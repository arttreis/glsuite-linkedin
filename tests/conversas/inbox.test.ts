import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { alertarSlasEstourados } from "@/server/conversas/alertas";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { listarConversas } from "@/server/conversas/inbox";
import { registrarOptout } from "@/server/conversas/optout";
import { responderManualmente } from "@/server/conversas/responder";
import { importarPessoas } from "@/server/importacao/importar";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = instanteLocal("2026-10-07", "10:00", SP); // quarta

describe("inbox (SDR-09)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let operador: string;
  let campanha: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    await banco.db.query("update public.perfis set email_alerta = 'arthur@guessless.com.br' where slug = 'arthur'");
    await banco.db.query("update public.configuracoes set valor = '\"admin@guessless.com.br\"' where chave = 'alerta_admin_email'");
    operador = await criarOperador(banco.db, { nome: "Arthur", perfis: ["arthur"] });
    campanha = await criarCampanha(banco.db);
  });

  async function leadEmConversa(estado = "em_conversa", chat: string | null = "chat-1") {
    const pessoaId = await criarPessoa(banco.db, { providerId: `ACo${randomUUID().replaceAll("-", "").slice(0, 16)}` });
    const leadId = await criarLead(banco.db, { pessoaId, campanhaId: campanha, estado });
    await banco.db.query("update public.leads set chat_id = $2 where id = $1::uuid", [leadId, chat]);
    return leadId;
  }

  const responder = (leadId: string, texto: string, chave = randomUUID()) =>
    responderManualmente({ db: banco.db, unipile, agora: AGORA }, { leadId, texto, operadorId: operador, chave });

  it("mensagem enviada pelo painel sai no LinkedIn e entra no histórico com autor = humano", async () => {
    const leadId = await leadEmConversa();
    const resultado = await responder(leadId, "Claro, Maria! Te explico em 2 minutos.");

    expect(resultado.ok).toBe(true);
    expect(unipile.chamadasDe("enviarMensagem")).toEqual([
      { accountId: "acc-arthur", chatId: "chat-1", texto: "Claro, Maria! Te explico em 2 minutos." },
    ]);
    const historico = await banco.db.query<{ direcao: string; autor: string; texto: string }>(
      "select direcao, autor, texto from public.mensagens where lead_id = $1::uuid",
      [leadId],
    );
    expect(historico).toEqual([{ direcao: "saida", autor: "humano", texto: "Claro, Maria! Te explico em 2 minutos." }]);
    const [acao] = await banco.db.query<{ origem: string; status: string; aprovada_por: string }>(
      "select origem, status, aprovada_por from public.acoes where lead_id = $1::uuid",
      [leadId],
    );
    expect(acao).toEqual({ origem: "humano", status: "enviada", aprovada_por: operador });
  });

  it("clicar duas vezes (mesma chave) não manda duas mensagens", async () => {
    const leadId = await leadEmConversa();
    const chave = randomUUID();
    await responder(leadId, "Oi!", chave);
    expect(await responder(leadId, "Oi!", chave)).toEqual({ ok: false, motivo: "Essa mensagem já foi enviada." });
    expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(1);
  });

  it("texto humano também passa pelo validador", async () => {
    const leadId = await leadEmConversa();
    const resultado = await responder(leadId, "Somos a melhor agência — vamos?");
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.violacoes?.map((v) => v.regra).sort()).toEqual(["palavra_proibida", "travessao"]);
    expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
  });

  it("perfil pausado não responde pelo painel", async () => {
    const leadId = await leadEmConversa();
    await banco.db.query("update public.perfis set status = 'pausado', motivo_pausa = 'teste' where slug = 'arthur'");
    expect(await responder(leadId, "Oi")).toEqual({ ok: false, motivo: "O perfil está pausado. Despause antes de responder pelo painel." });
  });

  it("responder quem ainda está na régua para a régua (a conversa passa ao humano)", async () => {
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: AGORA });
    await banco.db.query("update public.leads set chat_id = 'chat-2' where id = $1::uuid", [leadId]);
    await responder(leadId!, "Vi seu comentário e lembrei de você.");
    const [lead] = await banco.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [leadId]);
    expect(lead!.estado).toBe("escalado_humano");
    const acoes = await banco.db.query<{ toque: string | null; status: string }>(
      "select toque, status from public.acoes where lead_id = $1::uuid order by criada_em",
      [leadId],
    );
    expect(acoes).toEqual([{ toque: "T3", status: "cancelada" }, { toque: null, status: "enviada" }]);
  });

  it("opt-out é global: fecha todos os leads da pessoa, cancela o que ia sair e barra reimportação", async () => {
    const pessoaId = await criarPessoa(banco.db, { providerId: "ACoOptoutGlobal01" });
    const antigo = await criarLead(banco.db, { pessoaId, campanhaId: await criarCampanha(banco.db), estado: "sem_resposta" });
    const atual = await criarLead(banco.db, { pessoaId, campanhaId: campanha, estado: "em_sequencia" });
    await banco.db.query(
      `insert into public.acoes (lead_id, perfil_id, tipo, toque, origem, agendada_para, idempotency_key)
       select id, perfil_id, 'dm', 'T3', 'template', now(), 'k-optout' from public.leads where id = $1::uuid`,
      [atual],
    );

    const { leadsFechados } = await registrarOptout(banco.db, {
      providerId: "ACoOptoutGlobal01",
      perfilOrigem: null,
      textoPedido: "pare de me mandar mensagem",
      ator: operador,
      agora: AGORA,
    });

    expect(leadsFechados).toBe(2);
    const estados = await banco.db.query<{ estado: string }>("select estado from public.leads where id = any($1::uuid[])", [[antigo, atual]]);
    expect(estados.map((e) => e.estado)).toEqual(["optout", "optout"]);
    const [acao] = await banco.db.query<{ status: string }>("select status from public.acoes where idempotency_key = 'k-optout'");
    expect(acao!.status).toBe("cancelada");

    const nova = await criarCampanha(banco.db, { perfil: "juliano" });
    const { resumo } = await importarPessoas(
      { db: banco.db },
      {
        campanhaId: nova,
        fonte: "csv",
        agora: AGORA,
        pessoas: [
          {
            providerId: "ACoOptoutGlobal01",
            publicIdentifier: null,
            urlPublica: "https://www.linkedin.com/in/x",
            nome: "X",
            primeiroNome: "X",
            cargo: null,
            empresa: null,
            empresaDominio: null,
            empresaChave: null,
            localizacao: null,
            coletadoEm: null,
          },
        ],
      },
    );
    expect(resumo.optouts).toBe(1);
  });

  it("o humano marca qualificado e reunião; disse não encerra e cancela", async () => {
    const leadId = await leadEmConversa();
    expect(await marcarDesfecho(banco.db, { leadId, para: "qualificado", operadorId: operador, agora: AGORA })).toBe(true);
    const reuniao = new Date("2026-10-14T17:00:00Z");
    expect(await marcarDesfecho(banco.db, { leadId, para: "reuniao_marcada", operadorId: operador, agora: AGORA, reuniaoEm: reuniao })).toBe(true);
    const [lead] = await banco.db.query<{ estado: string; reuniao_em: Date; dono_conversa_id: string }>(
      "select estado, reuniao_em, dono_conversa_id from public.leads where id = $1::uuid",
      [leadId],
    );
    expect(lead).toEqual({ estado: "reuniao_marcada", reuniao_em: reuniao, dono_conversa_id: operador });
    expect(await marcarDesfecho(banco.db, { leadId, para: "qualificado", operadorId: operador, agora: AGORA })).toBe(false);
  });

  describe("SLA e alertas", () => {
    const entrada = (leadId: string, id: string, em: Date, texto = "Oi, me conta mais") =>
      registrarMensagem(
        banco.db,
        {
          accountId: "acc-arthur",
          chatId: "chat-1",
          messageId: id,
          texto,
          em: em.toISOString(),
          remetenteProviderId: "ACoQualquer",
          remetenteNome: null,
          enviadaPelaConta: false,
          participantes: [],
        },
        em,
      );

    it("ordena a inbox pelo SLA: estourado primeiro, depois o que vence antes", async () => {
      const respondida = await leadEmConversa("em_conversa", "chat-a");
      const estourada = await leadEmConversa("em_conversa", "chat-b");
      const noPrazo = await leadEmConversa("em_conversa", "chat-c");
      const inserir = (leadId: string, direcao: string, em: Date) =>
        banco.db.query(
          `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, em)
           select id, perfil_id, $2, case when $2 = 'entrada' then 'prospect' else 'humano' end, 'x', $3 from public.leads where id = $1::uuid`,
          [leadId, direcao, em],
        );
      await inserir(respondida, "entrada", instanteLocal("2026-10-06", "10:00", SP));
      await inserir(respondida, "saida", instanteLocal("2026-10-06", "11:00", SP));
      await inserir(estourada, "entrada", instanteLocal("2026-10-06", "15:00", SP)); // venceu ontem 17h+... hoje 10h
      await inserir(noPrazo, "entrada", instanteLocal("2026-10-07", "09:30", SP));

      const conversas = await listarConversas(banco.db, { agora: AGORA });
      expect(conversas.map((c) => [c.leadId, c.sla?.tipo])).toEqual([
        [estourada, "estourado"],
        [noPrazo, "no_prazo"],
        [respondida, "respondida"],
      ]);
    });

    it("a resposta alerta só o dono do perfil, uma vez por virada de turno", async () => {
      const leadId = await leadEmConversa("em_sequencia");
      await entrada(leadId, "m-1", AGORA);
      await entrada(leadId, "m-2", new Date(AGORA.getTime() + 60_000), "e outra coisa");
      const alertas = await banco.db.query<{ destinatarios: string[]; assunto: string }>(
        "select destinatarios, assunto from public.alertas order by criado_em",
      );
      expect(alertas).toHaveLength(1);
      expect(alertas[0]!.destinatarios).toEqual(["arthur@guessless.com.br"]);
      expect(alertas[0]!.assunto).toMatch(/respondeu ao Arthur$/);
    });

    it("SLA estourado vira alerta uma vez só, com o Arthur em cópia", async () => {
      const leadId = await leadEmConversa();
      await entrada(leadId, "m-3", instanteLocal("2026-10-06", "09:00", SP));
      const depois = instanteLocal("2026-10-06", "15:00", SP);
      expect(await alertarSlasEstourados(banco.db, depois)).toBe(1);
      expect(await alertarSlasEstourados(banco.db, new Date(depois.getTime() + 600_000))).toBe(1);
      const alertas = await banco.db.query<{ destinatarios: string[] }>(
        "select destinatarios from public.alertas where chave like 'sla/%'",
      );
      expect(alertas).toEqual([{ destinatarios: ["arthur@guessless.com.br", "admin@guessless.com.br"] }]);
    });
  });
});
