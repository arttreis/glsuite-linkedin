import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { despachar } from "@/server/despachante/despachante";
import { executarReserva } from "@/server/despachante/envio";
import { carregarPerfil } from "@/server/despachante/perfis";
import { reservarProximaAcao } from "@/server/despachante/reserva";
import { criarVerificadorDeResposta } from "@/server/reacoes/verificar-resposta";
import { processarWebhook } from "@/server/webhooks/processar";
import { receberWebhookUnipile } from "@/server/webhooks/receber";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao, simular, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha } from "../support/fixtures";
import { mensagemRecebida, novaRelacao } from "../support/payloads-unipile";
import { UnipileFalso } from "../support/unipile-falso";

const SEGREDO = "segredo-dos-webhooks-123";
const SEGUNDA_10H = instanteLocal("2026-10-05", "10:00", SP);

describe("reações a eventos (SDR-07)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let arthur: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    arthur = await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
  });

  const webhook = (corpo: unknown, agora = SEGUNDA_10H) =>
    receberWebhookUnipile(
      new Request("https://sdr/api/webhooks/unipile", { method: "POST", headers: { "Unipile-Auth": SEGREDO }, body: JSON.stringify(corpo) }),
      { db: banco.db, segredo: SEGREDO, agora: () => agora, processar: (id) => processarWebhook({ db: banco.db, unipile, agora }, id) },
    );

  const providerDoLead = async (leadId: string) =>
    (await banco.db.query<{ provider_id: string }>(
      "select pe.provider_id from public.leads l join public.pessoas pe on pe.id = l.pessoa_id where l.id = $1::uuid",
      [leadId],
    ))[0]!.provider_id;
  const lead = async (leadId: string) =>
    (await banco.db.query<{ estado: string; chat_id: string | null; aceito_em: Date | null }>(
      "select estado, chat_id, aceito_em from public.leads where id = $1::uuid",
      [leadId],
    ))[0]!;
  const acoes = (leadId: string) =>
    banco.db.query<{ tipo: string; toque: string | null; status: string; agendada_para: Date }>(
      "select tipo, toque, status, agendada_para from public.acoes where lead_id = $1::uuid order by criada_em",
      [leadId],
    );

  async function leadComConviteEnviado(nota = "Oi Pessoa, tudo bem?") {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, desde: SEGUNDA_10H });
    await banco.db.query(
      "update public.acoes set status = 'enviada', enviada_em = $2, texto_final = $3 where lead_id = $1::uuid",
      [leadId, SEGUNDA_10H, nota],
    );
    await banco.db.query("update public.leads set estado = 'convite_enviado', convite_id = 'inv-1', convite_enviado_em = $2 where id = $1::uuid", [
      leadId,
      SEGUNDA_10H,
    ]);
    await agendarAcao(banco.db, {
      leadId: leadId!,
      perfilId: arthur,
      tipo: "retirar_convite",
      toque: null,
      origem: "template",
      agendadaPara: new Date(SEGUNDA_10H.getTime() + 21 * 86_400_000),
      chave: chaveDoToque(leadId!, "retirar"),
    });
    return leadId!;
  }

  it("convite aceito agenda o T2 em +2 dias úteis e cancela a retirada", async () => {
    const leadId = await leadComConviteEnviado();
    const quinta = instanteLocal("2026-10-08", "15:00", SP);
    await webhook(novaRelacao({ user_provider_id: await providerDoLead(leadId) }), quinta);

    expect((await lead(leadId)).estado).toBe("aceito");
    const lista = await acoes(leadId);
    expect(lista.find((a) => a.tipo === "retirar_convite")!.status).toBe("cancelada");
    const t2 = lista.find((a) => a.toque === "T2")!;
    // Quinta 08/10 + 2 dias úteis: sexta 09 e terça 13 (12/10 é feriado), 9h.
    expect(new Date(t2.agendada_para)).toEqual(instanteLocal("2026-10-13", "09:00", SP));
  });

  it("a nota do convite numa conversa nova conta como aceite em tempo real", async () => {
    const leadId = await leadComConviteEnviado("Oi Pessoa, tudo bem?");
    const providerId = await providerDoLead(leadId);
    await webhook(
      mensagemRecebida({
        chat_id: "chat-novo",
        message_id: "msg-nota",
        message: "Oi Pessoa, tudo bem?",
        sender: { attendee_provider_id: "ACoArthur", attendee_name: "Arthur" },
        attendees: [{ attendee_provider_id: providerId, attendee_name: "Pessoa" }],
      }),
    );
    expect(await lead(leadId)).toMatchObject({ estado: "aceito", chat_id: "chat-novo" });
  });

  it("mensagem recebida vira em_conversa e cancela todas as pendentes no mesmo processamento", async () => {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: SEGUNDA_10H });
    await banco.db.query("update public.leads set chat_id = 'chat-9' where id = $1::uuid", [leadId]);

    await webhook(mensagemRecebida({ chat_id: "chat-9", message_id: "resp-1", message: "Opa, me conta mais." }));
    await webhook(mensagemRecebida({ chat_id: "chat-9", message_id: "resp-1", message: "Opa, me conta mais." }));

    expect((await lead(leadId!)).estado).toBe("em_conversa");
    expect((await acoes(leadId!)).map((a) => a.status)).toEqual(["cancelada"]);
    const mensagens = await banco.db.query<{ direcao: string; autor: string }>(
      "select direcao, autor from public.mensagens where lead_id = $1::uuid",
      [leadId],
    );
    expect(mensagens).toEqual([{ direcao: "entrada", autor: "prospect" }]);
  });

  describe("corrida: a resposta chega enquanto o T3 está na fila — o T3 não sai", () => {
    async function t3NaFila() {
      const campanha = await criarCampanha(banco.db);
      const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: SEGUNDA_10H });
      await banco.db.query("update public.leads set chat_id = 'chat-corrida' where id = $1::uuid", [leadId]);
      return leadId!;
    }
    const resposta = mensagemRecebida({ chat_id: "chat-corrida", message_id: "resp-corrida", message: "Pode parar, tá? Brincadeira, fala." });

    it("webhook antes do tick", async () => {
      const leadId = await t3NaFila();
      await webhook(resposta);
      await simular(banco.db, unipile, { de: "2026-10-05", ate: "2026-10-06" });
      expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
      expect((await acoes(leadId)).map((a) => a.status)).toEqual(["cancelada"]);
    });

    it("webhook entre a reserva e o envio", async () => {
      const leadId = await t3NaFila();
      const perfil = (await carregarPerfil(banco.db, arthur))!;
      const reserva = await reservarProximaAcao(banco.db, perfil, { agora: SEGUNDA_10H, feriados: new Set(), cooldownDias: 30 });
      expect("reserva" in reserva).toBe(true);

      await webhook(resposta); // chega com a ação já reservada (enviando)

      const envio = await executarReserva(
        { db: banco.db, unipile, agora: SEGUNDA_10H, aleatorio: () => 0.5, feriados: new Set() },
        perfil,
        (reserva as { reserva: Parameters<typeof executarReserva>[2] }).reserva,
      );
      expect(envio).toMatchObject({ resultado: "cancelada" });
      expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
      expect((await lead(leadId)).estado).toBe("em_conversa");
    });

    it("webhook perdido: a checagem na Unipile antes da DM acha a resposta", async () => {
      const leadId = await t3NaFila();
      unipile.mensagensPorChat.set("chat-corrida", [
        { id: "resp-sem-webhook", texto: "Oi, tenho interesse", enviadaPelaConta: false, remetenteProviderId: null, em: SEGUNDA_10H.toISOString() },
      ]);
      const verificarResposta = criarVerificadorDeResposta({ db: banco.db, unipile, agora: SEGUNDA_10H });
      const resultado = await despachar({ db: banco.db, unipile, agora: new Date(SEGUNDA_10H.getTime() + 60_000), aleatorio: () => 0.5, verificarResposta });

      expect(resultado[0]!.resultado).toBe("cancelada");
      expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
      expect((await lead(leadId)).estado).toBe("em_conversa");
    });
  });

  it("o dono do perfil escrevendo direto no LinkedIn para a régua", async () => {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: SEGUNDA_10H });
    await banco.db.query("update public.leads set chat_id = 'chat-3' where id = $1::uuid", [leadId]);

    await webhook(mensagemRecebida({ chat_id: "chat-3", message_id: "manual-1", message: "Fala! Vi seu post.", sender: { attendee_provider_id: "ACoArthur" } }));

    expect((await lead(leadId!)).estado).toBe("escalado_humano");
    expect((await acoes(leadId!)).map((a) => a.status)).toEqual(["cancelada"]);
  });

  it("o eco da DM que o próprio SDR mandou não para a régua", async () => {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "aceito", toque: "T2", desde: SEGUNDA_10H });
    await despachar({ db: banco.db, unipile, agora: SEGUNDA_10H, aleatorio: () => 0.5 });
    const [enviada] = await banco.db.query<{ provider_message_id: string; chat_id: string }>(
      "select provider_message_id, chat_id from public.mensagens where lead_id = $1::uuid",
      [leadId],
    );

    await webhook(
      mensagemRecebida({ chat_id: enviada!.chat_id, message_id: enviada!.provider_message_id, message: "eco", sender: { attendee_provider_id: "ACoArthur" } }),
    );

    expect((await lead(leadId!)).estado).toBe("em_sequencia");
  });

  it("não guarda conversa de quem não é lead", async () => {
    await webhook(mensagemRecebida({ chat_id: "chat-estranho", message_id: "x-1", sender: { attendee_provider_id: "ACoDesconhecido" } }));
    const [contagem] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.mensagens");
    expect(contagem!.n).toBe(0);
  });

  it("convite pendente há 21 dias é retirado na Unipile", async () => {
    const leadId = await leadComConviteEnviado();
    const dia21 = new Date(SEGUNDA_10H.getTime() + 21 * 86_400_000 + 60 * 60_000); // segunda 26/10, 11h
    await despachar({ db: banco.db, unipile, agora: dia21, aleatorio: () => 0.5 });

    expect(unipile.chamadasDe("cancelarConvite")).toEqual([{ accountId: "acc-arthur", invitationId: "inv-1" }]);
    expect((await lead(leadId)).estado).toBe("convite_retirado");
  });
});
