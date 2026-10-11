import { beforeEach, describe, expect, it } from "vitest";
import { dataLocal, instanteLocal } from "@/domain/calendario";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { despachar } from "@/server/despachante/despachante";
import { reconciliarAcoesEmVoo } from "@/server/despachante/reconciliar";
import { executarTick } from "@/server/tick";
import { pegarTrava } from "@/server/travas";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { envios, leadsComAcao, simular, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarPessoa, idDoPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const SEGUNDA_10H = instanteLocal("2026-10-05", "10:00", SP);

describe("despachante: régua, revalidação e erros", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let arthur: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    arthur = await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
  });

  const tick = (agora = SEGUNDA_10H) => despachar({ db: banco.db, unipile, agora, aleatorio: () => 0.5 });
  const acoesDoLead = (leadId: string) =>
    banco.db.query<{ tipo: string; toque: string | null; status: string; agendada_para: Date; erro: string | null }>(
      "select tipo, toque, status, agendada_para, erro from public.acoes where lead_id = $1::uuid order by criada_em",
      [leadId],
    );
  const lead = async (leadId: string) =>
    (await banco.db.query<{ estado: string; convite_id: string | null; chat_id: string | null; retorno_apos: string | null; revisao_motivo: string | null }>(
      "select estado, convite_id, chat_id, retorno_apos, revisao_motivo from public.leads where id = $1::uuid",
      [leadId],
    ))[0]!;

  it("T1 sai com a nota renderizada, o lead vai a convite_enviado e a retirada fica para daqui a 21 dias", async () => {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: SEGUNDA_10H });

    expect(await tick()).toEqual([{ perfil: "arthur", resultado: "enviada", detalhe: expect.any(String) }]);

    expect(unipile.chamadasDe("enviarConvite")[0]).toEqual({
      accountId: "acc-arthur",
      providerId: expect.stringMatching(/^ACo/),
      mensagem: "Oi Pessoa, tudo bem?",
    });
    expect(await lead(leadId!)).toMatchObject({ estado: "convite_enviado", convite_id: "convite-1" });
    const acoes = await acoesDoLead(leadId!);
    expect(acoes.map((a) => [a.tipo, a.status])).toEqual([["convite", "enviada"], ["retirar_convite", "pendente"]]);
    expect(new Date(acoes[1]!.agendada_para).getTime()).toBe(SEGUNDA_10H.getTime() + 21 * 86_400_000);
  });

  it("T2 → T3 em +4 dias úteis às 9h; T4 fecha a régua como sem resposta", async () => {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "aceito", toque: "T2", desde: SEGUNDA_10H });

    await tick();
    expect(await lead(leadId!)).toMatchObject({ estado: "em_sequencia", chat_id: "chat-1" });
    const t3 = (await acoesDoLead(leadId!)).find((a) => a.toque === "T3")!;
    // Segunda 05/10 + 4 dias úteis = sexta 09/10, 9h de São Paulo.
    expect(new Date(t3.agendada_para)).toEqual(instanteLocal("2026-10-09", "09:00", SP));

    await simular(banco.db, unipile, { de: "2026-10-09", ate: "2026-10-19" });
    const toques = (await envios(banco.db)).map((e) => [e.toque, dataLocal(new Date(e.enviada_em), SP)]);
    // T4: sexta 09/10 + 5 dias úteis, pulando 12/10 = sábado… → segunda 19/10.
    expect(toques).toEqual([["T2", "2026-10-05"], ["T3", "2026-10-09"], ["T4", "2026-10-19"]]);
    expect((await lead(leadId!)).estado).toBe("sem_resposta");
    expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(2); // T3 e T4 usam o chat aberto no T2
  });

  it("pós-T4 com pausa de 60 dias grava a data de retorno", async () => {
    const campanha = await criarCampanha(banco.db, { posT4: "pausa_60_novo_angulo" });
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T4", desde: SEGUNDA_10H });
    await tick();
    expect(await lead(leadId!)).toMatchObject({ estado: "sem_resposta", retorno_apos: "2026-12-04" });
  });

  it("nunca dois toques no mesmo dia para a mesma pessoa", async () => {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "aceito", toque: "T2", desde: SEGUNDA_10H });
    // T3 vencido no mesmo dia (ex.: T2 atrasou por falta de saldo).
    await agendarAcao(banco.db, {
      leadId: leadId!,
      perfilId: arthur,
      tipo: "dm",
      toque: "T3",
      origem: "template",
      agendadaPara: SEGUNDA_10H,
      chave: chaveDoToque(leadId!, "T3"),
    });

    await simular(banco.db, unipile, { de: "2026-10-05", ate: "2026-10-06" });

    const toques = (await envios(banco.db)).map((e) => [e.toque, dataLocal(new Date(e.enviada_em), SP)]);
    expect(toques).toEqual([["T2", "2026-10-05"], ["T3", "2026-10-06"]]);
  });

  describe("revalidação antes de enviar", () => {
    it("lead que respondeu enquanto a ação estava na fila: a ação é cancelada e nada sai", async () => {
      const campanha = await criarCampanha(banco.db);
      const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: SEGUNDA_10H });
      await banco.db.query("update public.leads set estado = 'em_conversa' where id = $1::uuid", [leadId]);

      expect((await tick())[0]!.resultado).toBe("nada_a_fazer");
      expect((await acoesDoLead(leadId!))[0]).toMatchObject({ status: "cancelada", erro: "lead fora da régua (em_conversa)" });
      expect(unipile.chamadas.filter((c) => c.metodo !== "obterConta")).toHaveLength(0);
    });

    it("pessoa com opt-out não recebe nada", async () => {
      const campanha = await criarCampanha(banco.db);
      const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: SEGUNDA_10H });
      await banco.db.query(
        "insert into public.optouts (provider_id) select pe.provider_id from public.leads l join public.pessoas pe on pe.id = l.pessoa_id where l.id = $1::uuid",
        [leadId],
      );
      await tick();
      expect((await acoesDoLead(leadId!))[0]).toMatchObject({ status: "cancelada", erro: "opt-out" });
    });

    it("segura o convite enquanto a empresa está em cooldown por outro perfil", async () => {
      const campanhaJuliano = await criarCampanha(banco.db, { perfil: "juliano" });
      const colega = await criarPessoa(banco.db, { dono: "juliano", empresa: "Acme", empresaChave: "acme" });
      const leadColega = await criarLead(banco.db, { pessoaId: colega, campanhaId: campanhaJuliano, estado: "convite_enviado" });
      await banco.db.query("update public.leads set ultimo_toque_em = '2026-10-01T15:00:00Z' where id = $1::uuid", [leadColega]);

      const campanha = await criarCampanha(banco.db);
      const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: SEGUNDA_10H, empresa: () => "Acme" });
      await tick();

      const [acao] = await acoesDoLead(leadId!);
      expect(acao!.status).toBe("pendente");
      // 01/10 + 30 dias = 31/10 (sábado) → abre na segunda 02/11? 02/11 é feriado → terça 03/11, 9h.
      expect(new Date(acao!.agendada_para)).toEqual(instanteLocal("2026-11-03", "09:00", SP));
    });

    it("copy que viola o validador vai para revisão e o próximo da fila sai no lugar", async () => {
      const campanhaRuim = await criarCampanha(banco.db, {
        nome: "Antiga",
        sequencia: [{ toque: "T1", tipo: "convite", offset_dias_uteis: 0, ancora: "inicio", template: "Somos a melhor agência — oi {{first_name}}" }],
      });
      const campanhaBoa = await criarCampanha(banco.db, { nome: "Boa" });
      const [ruim] = await leadsComAcao(banco.db, { campanhaId: campanhaRuim, quantidade: 1, desde: new Date(SEGUNDA_10H.getTime() - 60_000) });
      const [boa] = await leadsComAcao(banco.db, { campanhaId: campanhaBoa, quantidade: 1, desde: SEGUNDA_10H });

      expect((await tick())[0]!.resultado).toBe("enviada");
      expect((await acoesDoLead(ruim!))[0]!.status).toBe("aguardando_aprovacao");
      expect((await acoesDoLead(boa!))[0]!.status).toBe("enviada");
    });
  });

  describe("erros da Unipile", () => {
    const umLead = async () => {
      const campanha = await criarCampanha(banco.db);
      return (await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: SEGUNDA_10H }))[0]!;
    };
    const limparIntervalo = () => banco.db.query("update public.perfis set proxima_acao_apos = null");

    it("transitório: tenta de novo com backoff e desiste na 3ª, mandando o lead para revisão", async () => {
      const leadId = await umLead();
      const fora = new ErroUnipile({ status: 503, tipo: "http_503", titulo: "indisponível" });
      unipile.falharProxima("enviarConvite", fora).falharProxima("enviarConvite", fora).falharProxima("enviarConvite", fora);

      await tick(SEGUNDA_10H);
      let [acao] = await acoesDoLead(leadId);
      expect(acao).toMatchObject({ status: "pendente" });
      expect(new Date(acao!.agendada_para).getTime()).toBe(SEGUNDA_10H.getTime() + 15 * 60_000);

      await tick(new Date(SEGUNDA_10H.getTime() + 15 * 60_000));
      [acao] = await acoesDoLead(leadId);
      expect(new Date(acao!.agendada_para).getTime()).toBe(SEGUNDA_10H.getTime() + 45 * 60_000);

      await tick(new Date(SEGUNDA_10H.getTime() + 45 * 60_000));
      [acao] = await acoesDoLead(leadId);
      expect(acao!.status).toBe("falhou");
      expect((await lead(leadId)).revisao_motivo).toMatch(/^Envio falhou: 503/);
    });

    it("limite do LinkedIn: volta para a fila no próximo dia útil e conta para a parada", async () => {
      const leadId = await umLead();
      unipile.falharProxima("enviarConvite", new ErroUnipile({ status: 422, tipo: "cannot_resend_yet", titulo: "limite" }));
      await tick();
      const [acao] = await acoesDoLead(leadId);
      expect(acao!.status).toBe("pendente");
      expect(new Date(acao!.agendada_para)).toEqual(instanteLocal("2026-10-06", "09:00", SP));
      const [evento] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.eventos where tipo = 'erro_limite'");
      expect(evento!.n).toBe(1);
    });

    it("erro de conta (checkpoint) pausa o perfil na hora", async () => {
      const leadId = await umLead();
      unipile.falharProxima("enviarConvite", new ErroUnipile({ status: 401, tipo: "checkpoint_error", titulo: "checkpoint" }));
      await tick();
      const [perfil] = await banco.db.query<{ status: string; motivo_pausa: string }>(
        "select status, motivo_pausa from public.perfis where slug = 'arthur'",
      );
      expect(perfil!.status).toBe("pausado");
      expect(perfil!.motivo_pausa).toMatch(/checkpoint_error/);
      expect((await acoesDoLead(leadId))[0]!.status).toBe("pendente");
      await limparIntervalo();
      expect((await tick(new Date(SEGUNDA_10H.getTime() + 30 * 60_000))).length).toBe(0);
    });

    it("permanente: a ação falha e o lead vai para revisão", async () => {
      const leadId = await umLead();
      unipile.falharProxima("enviarConvite", new ErroUnipile({ status: 422, tipo: "already_connected", titulo: "já conectado" }));
      await tick();
      expect((await acoesDoLead(leadId))[0]!.status).toBe("falhou");
      expect((await lead(leadId)).revisao_motivo).toMatch(/already_connected/);
    });
  });

  it("não envia com a conta instável na Unipile", async () => {
    const campanha = await criarCampanha(banco.db);
    await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: SEGUNDA_10H });
    await banco.db.query("update public.perfis set unipile_status = 'CONNECTING' where slug = 'arthur'");
    expect((await tick())[0]!.resultado).toBe("conta_instavel");

    await banco.db.query("update public.perfis set unipile_status = 'OK', unipile_status_em = $1 where slug = 'arthur'", [
      new Date(SEGUNDA_10H.getTime() - 10 * 60_000),
    ]);
    expect((await tick())[0]!.resultado).toBe("conta_instavel"); // voltou há 10 min: espera 30
    expect((await tick(new Date(SEGUNDA_10H.getTime() + 25 * 60_000)))[0]!.resultado).toBe("enviada");
  });

  it("dois ticks ao mesmo tempo: o segundo não roda", async () => {
    const soltar = await pegarTrava(banco.db, "tick", SEGUNDA_10H, 60_000);
    expect(await executarTick({ db: banco.db, unipile, agora: SEGUNDA_10H })).toEqual({
      executado: false,
      motivo: "outro tick em andamento",
    });
    await soltar!();
    expect((await executarTick({ db: banco.db, unipile, agora: SEGUNDA_10H })).executado).toBe(true);
  });

  describe("ações presas em envio", () => {
    const presa = async (tipo: "convite" | "dm") => {
      const campanha = await criarCampanha(banco.db);
      const [leadId] = await leadsComAcao(banco.db, {
        campanhaId: campanha,
        quantidade: 1,
        estado: tipo === "convite" ? "na_fila" : "aceito",
        toque: tipo === "convite" ? "T1" : "T2",
        desde: SEGUNDA_10H,
      });
      // O trigger de `atualizada_em` grava o relógio real; aqui a ação precisa
      // parecer parada há 20 min no relógio simulado.
      await banco.db.query("alter table public.acoes disable trigger acoes_atualizada_em");
      await banco.db.query(
        `update public.acoes set status = 'enviando', texto_final = 'Oi Pessoa', atualizada_em = $2 where lead_id = $1::uuid`,
        [leadId, new Date(SEGUNDA_10H.getTime() - 20 * 60_000)],
      );
      await banco.db.query("alter table public.acoes enable trigger acoes_atualizada_em");
      const [pessoa] = await banco.db.query<{ provider_id: string }>(
        "select pe.provider_id from public.leads l join public.pessoas pe on pe.id = l.pessoa_id where l.id = $1::uuid",
        [leadId],
      );
      return { leadId: leadId!, providerId: pessoa!.provider_id };
    };

    it("convite que já está pendente no LinkedIn é registrado como enviado, sem reenviar", async () => {
      const { leadId, providerId } = await presa("convite");
      unipile.convitesPendentes = [{ id: "inv-9", providerId, data: null }];
      const feriadosPorPraca = new Map();
      expect(await reconciliarAcoesEmVoo({ db: banco.db, unipile, agora: SEGUNDA_10H, feriadosPorPraca })).toBe(1);
      expect(await lead(leadId)).toMatchObject({ estado: "convite_enviado", convite_id: "inv-9" });
      expect(unipile.chamadasDe("enviarConvite")).toHaveLength(0);
    });

    it("DM que não aparece na conversa volta para a fila", async () => {
      const { leadId, providerId } = await presa("dm");
      unipile.conversasPorPessoa.set(providerId, [{ id: "chat-7", attendeeProviderId: providerId }]);
      unipile.mensagensPorChat.set("chat-7", [
        { id: "m1", texto: "outra coisa", enviadaPelaConta: true, remetenteProviderId: null, em: SEGUNDA_10H.toISOString() },
      ]);
      await reconciliarAcoesEmVoo({ db: banco.db, unipile, agora: SEGUNDA_10H, feriadosPorPraca: new Map() });
      const [acao] = await acoesDoLead(leadId);
      expect(acao).toMatchObject({ status: "pendente", erro: "reconciliada: não saiu, volta para a fila" });
    });
  });

  it("mantém a ordem: resposta de conversa antes de DM da régua, DM antes de convite", async () => {
    const campanha = await criarCampanha(banco.db);
    const [convite] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: new Date(SEGUNDA_10H.getTime() - 3 * 3_600_000) });
    const [dm] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "aceito", toque: "T2", desde: SEGUNDA_10H });
    const conversaLead = await criarLead(banco.db, {
      pessoaId: await criarPessoa(banco.db),
      campanhaId: campanha,
      estado: "em_conversa",
    });
    await banco.db.query(
      `insert into public.acoes (lead_id, perfil_id, tipo, origem, status, agendada_para, idempotency_key, texto_final)
       values ($1::uuid, $2::uuid, 'dm', 'humano', 'pendente', $3, 'resposta-1', 'Claro, te explico.')`,
      [conversaLead, await idDoPerfil(banco.db, "arthur"), SEGUNDA_10H],
    );

    const ordem: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await banco.db.query("update public.perfis set proxima_acao_apos = null");
      await tick(new Date(SEGUNDA_10H.getTime() + i * 10 * 60_000));
      const [ultima] = await banco.db.query<{ lead_id: string }>(
        "select lead_id from public.acoes where status = 'enviada' order by enviada_em desc limit 1",
      );
      ordem.push(ultima!.lead_id);
    }
    expect(ordem).toEqual([conversaLead, dm, convite]);
  });
});
