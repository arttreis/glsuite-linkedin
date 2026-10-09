import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { processarMensagensPendentes } from "@/server/agente/agente";
import { aprovarAcao, rejeitarAcao } from "@/server/aprovacao/aprovar";
import { listarFila, taxaDeEdicao } from "@/server/aprovacao/fila";
import { assumirParado, listarParados, tentarDeNovo } from "@/server/aprovacao/parados";
import { despachar } from "@/server/despachante/despachante";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarOperador } from "../support/fixtures";
import { ModeloFalso } from "../support/modelo-falso";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);

describe("fila de aprovação (SDR-11)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let modelo: ModeloFalso;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    modelo = new ModeloFalso();
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    operador = await criarOperador(banco.db, { nome: "Arthur", perfis: ["arthur"] });
  });

  /** A pessoa responde e o agente (modo aprovação) deixa um rascunho na fila. */
  async function rascunhoNaFila(texto = "Me conta mais?") {
    const campanha = await criarCampanha(banco.db);
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: AGORA });
    const chat = `chat-${randomUUID().slice(0, 6)}`;
    await banco.db.query("update public.leads set chat_id = $2 where id = $1::uuid", [leadId, chat]);
    await registrarMensagem(
      banco.db,
      {
        accountId: "acc-arthur",
        chatId: chat,
        messageId: `in-${randomUUID().slice(0, 6)}`,
        texto,
        em: AGORA.toISOString(),
        remetenteProviderId: "ACoX",
        remetenteNome: null,
        enviadaPelaConta: false,
        participantes: [],
      },
      AGORA,
    );
    await processarMensagensPendentes({ db: banco.db, modelo, agora: AGORA });
    const [acao] = await banco.db.query<{ id: string }>(
      "select id from public.acoes where lead_id = $1::uuid and origem = 'ia' and status = 'aguardando_aprovacao'",
      [leadId],
    );
    return { leadId: leadId!, acaoId: acao!.id, chat };
  }

  const aprovar = (acaoId: string, textoEditado?: string) =>
    aprovarAcao({ db: banco.db, unipile, agora: AGORA }, { acaoId, operadorId: operador, textoEditado });
  const acao = async (acaoId: string) =>
    (await banco.db.query<{ status: string; texto_gerado: string | null; texto_final: string | null; decisao_humana: string | null; decidida_por: string | null }>(
      "select status, texto_gerado, texto_final, decisao_humana, decidida_por from public.acoes where id = $1::uuid",
      [acaoId],
    ))[0]!;

  it("no modo aprovação nada da IA sai sem aprovação; aprovado, sai na hora com autor = ia", async () => {
    const { leadId, acaoId, chat } = await rascunhoNaFila();

    await despachar({ db: banco.db, unipile, agora: new Date(AGORA.getTime() + 30 * 60_000), aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);

    expect(await aprovar(acaoId)).toEqual({ ok: true, enviada: true });
    expect(unipile.chamadasDe("enviarMensagem")).toEqual([{ accountId: "acc-arthur", chatId: chat, texto: modelo.decisaoPadrao.mensagem }]);
    expect(await acao(acaoId)).toMatchObject({ status: "enviada", decisao_humana: "aprovada", decidida_por: operador });
    const [mensagem] = await banco.db.query<{ autor: string }>(
      "select autor from public.mensagens where lead_id = $1::uuid and direcao = 'saida'",
      [leadId],
    );
    expect(mensagem!.autor).toBe("ia");
  });

  it("a edição guarda o texto original e o final, e a mensagem sai assinada pelo humano", async () => {
    const { leadId, acaoId } = await rascunhoNaFila();
    const editado = "Claro! Posso te mostrar em 15 minutos como olhamos a margem por canal. Faz sentido?";
    expect(await aprovar(acaoId, editado)).toEqual({ ok: true, enviada: true });
    expect(await acao(acaoId)).toMatchObject({
      texto_gerado: modelo.decisaoPadrao.mensagem,
      texto_final: editado,
      decisao_humana: "editada",
    });
    const [mensagem] = await banco.db.query<{ autor: string; texto: string }>(
      "select autor, texto from public.mensagens where lead_id = $1::uuid and direcao = 'saida'",
      [leadId],
    );
    expect(mensagem).toEqual({ autor: "humano", texto: editado });
  });

  it("edição que viola o validador não sai e o item continua na fila", async () => {
    const { acaoId } = await rascunhoNaFila();
    const resultado = await aprovar(acaoId, "Somos a melhor agência — bora?");
    expect(resultado.ok).toBe(false);
    expect(await acao(acaoId)).toMatchObject({ status: "aguardando_aprovacao", decisao_humana: null });
    expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
  });

  it("rejeitar não envia nada e conta na taxa de edição", async () => {
    const { acaoId } = await rascunhoNaFila();
    expect(await rejeitarAcao(banco.db, { acaoId, operadorId: operador, agora: AGORA })).toBe(true);
    expect(await acao(acaoId)).toMatchObject({ status: "cancelada", decisao_humana: "rejeitada" });
    expect(unipile.chamadas.filter((c) => c.metodo === "enviarMensagem")).toHaveLength(0);
  });

  it("aprovar duas vezes não manda duas mensagens", async () => {
    const { acaoId } = await rascunhoNaFila();
    await aprovar(acaoId);
    expect(await aprovar(acaoId)).toEqual({ ok: false, motivo: "Essa ação já foi decidida." });
    expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(1);
  });

  it("o encerramento sugerido pelo agente, quando aprovado, fecha a conversa", async () => {
    modelo.classificacoes.push({ categoria: "nao", confianca: 0.95, sinais: { preco: false, reclamacao: false, idioma: "pt" } });
    modelo.decisoes.push({ acao: "encerrar", mensagem: "Entendido, obrigado pelo retorno!", motivo: "disse não", estagio_sugerido: null, confianca: 0.95 });
    const { leadId, acaoId } = await rascunhoNaFila("Não tenho interesse, obrigado.");
    await aprovar(acaoId);
    const [lead] = await banco.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [leadId]);
    expect(lead!.estado).toBe("encerrado_nao");
  });

  it("toque da régua barrado pelo validador: a fila mostra o texto e, corrigido, ele volta para o despachante", async () => {
    const campanha = await criarCampanha(banco.db, {
      sequencia: [
        { toque: "T1", tipo: "convite", offset_dias_uteis: 0, ancora: "inicio", template: "" },
        { toque: "T2", tipo: "dm", offset_dias_uteis: 2, ancora: "aceite", template: "Oi {{first_name}} — tudo bem?" },
      ],
    });
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "aceito", toque: "T2", desde: AGORA });
    await despachar({ db: banco.db, unipile, agora: AGORA, aleatorio: () => 0.5 });

    const [item] = await listarFila(banco.db);
    expect(item).toMatchObject({ leadId, toque: "T2", textoGerado: "Oi Pessoa — tudo bem?" });
    expect(item!.motivoRevisao).toContain("travessão");

    expect(await aprovar(item!.acaoId, "Oi Pessoa, tudo bem?")).toEqual({ ok: true, enviada: false });
    await banco.db.query("update public.perfis set proxima_acao_apos = null");
    await despachar({ db: banco.db, unipile, agora: new Date(AGORA.getTime() + 10 * 60_000), aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("iniciarConversa")[0]).toMatchObject({ texto: "Oi Pessoa, tudo bem?" });
  });

  it("aprovar com o texto da caixa igual ao original conta como aprovado, não como editado", async () => {
    const { acaoId } = await rascunhoNaFila();
    expect(await aprovar(acaoId, `  ${modelo.decisaoPadrao.mensagem}  `)).toEqual({ ok: true, enviada: true });
    expect(await acao(acaoId)).toMatchObject({ decisao_humana: "aprovada" });
  });

  describe("leads parados por toque rejeitado", () => {
    async function toqueRejeitado() {
      const campanha = await criarCampanha(banco.db);
      const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 1, estado: "aceito", toque: "T2", desde: AGORA });
      await banco.db.query(
        "update public.acoes set status = 'aguardando_aprovacao', texto_gerado = 'Oi Pessoa, tudo bem?' where lead_id = $1::uuid",
        [leadId],
      );
      const [item] = await listarFila(banco.db);
      await rejeitarAcao(banco.db, { acaoId: item!.acaoId, operadorId: operador, agora: AGORA });
      return leadId!;
    }

    it("o lead aparece como parado, com o motivo e o texto do toque", async () => {
      const leadId = await toqueRejeitado();
      expect(await listarParados(banco.db)).toEqual([
        expect.objectContaining({ leadId, toque: "T2", texto: "Oi Pessoa, tudo bem?", motivo: expect.stringMatching(/rejeitada/i) }),
      ]);
    });

    it("tentar de novo devolve o toque à fila de aprovação e tira o lead dos parados", async () => {
      const leadId = await toqueRejeitado();
      expect(await tentarDeNovo(banco.db, { leadId, operadorId: operador, agora: AGORA })).toBe(true);
      expect(await listarParados(banco.db)).toEqual([]);
      expect(await listarFila(banco.db)).toEqual([expect.objectContaining({ leadId, toque: "T2", textoGerado: "Oi Pessoa, tudo bem?" })]);
    });

    it("assumir passa o lead para humano", async () => {
      const leadId = await toqueRejeitado();
      expect(await assumirParado(banco.db, { leadId, operadorId: operador, agora: AGORA })).toBe(true);
      const [lead] = await banco.db.query<{ estado: string; revisao_motivo: string | null }>(
        "select estado, revisao_motivo from public.leads where id = $1::uuid",
        [leadId],
      );
      expect(lead).toEqual({ estado: "escalado_humano", revisao_motivo: null });
      expect(await listarParados(banco.db)).toEqual([]);
    });
  });

  it("não aprova resposta com o perfil pausado", async () => {
    const { acaoId } = await rascunhoNaFila();
    await banco.db.query("update public.perfis set status = 'pausado', motivo_pausa = 'teste' where slug = 'arthur'");
    expect(await aprovar(acaoId)).toEqual({ ok: false, motivo: "O perfil está pausado. Despause antes de aprovar respostas." });
  });

  it("mostra a taxa de edição por perfil", async () => {
    const itens = [await rascunhoNaFila(), await rascunhoNaFila(), await rascunhoNaFila(), await rascunhoNaFila()];
    await aprovar(itens[0]!.acaoId);
    await aprovar(itens[1]!.acaoId);
    await aprovar(itens[2]!.acaoId, "Texto reescrito pelo Arthur, com calma.");
    await rejeitarAcao(banco.db, { acaoId: itens[3]!.acaoId, operadorId: operador, agora: AGORA });

    const taxas = await taxaDeEdicao(banco.db, { agora: new Date(AGORA.getTime() + 60_000) });
    expect(taxas.find((t) => t.perfil === "Arthur")).toEqual({
      perfilId: expect.any(String),
      perfil: "Arthur",
      decididas: 4,
      aprovadas: 2,
      editadas: 1,
      rejeitadas: 1,
      taxa: 0.5,
    });
    expect(taxas.find((t) => t.perfil === "Juliano")!.taxa).toBeNull();
  });
});
