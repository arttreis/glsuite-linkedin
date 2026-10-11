import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { abrirChat, devolverAoSdr, listarChats } from "@/server/chats/chats";
import { responderManualmente } from "@/server/conversas/responder";
import { comOperador } from "@/server/db/operador";
import { transicionarLead } from "@/server/leads/transicoes";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  ativarPerfil,
  criarCampanha,
  criarLead,
  criarOperador,
  criarOrganizacao,
  criarPessoa,
} from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-12T15:00:00Z");
const MINUTO = 60 * 1000;
const antes = (minutos: number) => new Date(AGORA.getTime() - minutos * MINUTO);

describe("Chats (SDR-48)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let duda: string;
  let juliano: string;
  let campanha: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    juliano = await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });
    await banco.db.query("update public.perfis set modo_resposta = 'automatico' where id = $1::uuid", [juliano]);
    duda = await criarOperador(banco.db, { nome: "Duda", perfis: ["juliano"] });
    campanha = await criarCampanha(banco.db, { perfil: "juliano", nome: "Multimarcas" });
  });

  const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);

  async function lead(estado: string, nome: string) {
    const pessoa = await criarPessoa(banco.db, { dono: "juliano", nome, empresa: `Loja ${nome}` });
    const id = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha, estado });
    await banco.db.query("update public.leads set chat_id = $2 where id = $1::uuid", [id, `chat-${id}`]);
    return id;
  }

  async function mensagem(leadId: string, direcao: "entrada" | "saida", autor: string, minutos: number, texto = "oi") {
    await banco.db.query(
      `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, provider_message_id, em)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
      [leadId, juliano, direcao, autor, texto, randomUUID(), antes(minutos)],
    );
  }

  async function pendente(leadId: string, texto: string, motivo: string | null = null) {
    const [acao] = await banco.db.query<{ id: string }>(
      `insert into public.acoes (lead_id, perfil_id, tipo, origem, status, agendada_para, idempotency_key, texto_gerado, motivo_revisao)
       values ($1::uuid, $2::uuid, 'dm', 'ia', 'aguardando_aprovacao', $3, $4, $5, $6) returning id`,
      [leadId, juliano, AGORA, randomUUID(), texto, motivo],
    );
    return acao!.id;
  }

  describe("a lista", () => {
    it("junta as conversas de campanha e as de fora, a última mensagem primeiro, com quem conduz cada uma", async () => {
      const comSdr = await lead("em_conversa", "Ana");
      await mensagem(comSdr, "entrada", "prospect", 30);
      await mensagem(comSdr, "saida", "ia", 20, "Que bom!");
      const chamou = await lead("em_conversa", "Bia");
      await mensagem(chamou, "entrada", "prospect", 10, "Qual o preço?");
      await transicionarLead(banco.db, { leadId: chamou, para: "escalado_humano", ator: "agente", agora: antes(9), motivo: "pediu preço" });
      const [externa] = await banco.db.query<{ id: string }>(
        `insert into public.conversas (perfil_id, chat_id, contraparte_nome, ultima_em) values ($1::uuid, 'chat-x', 'Carla', $2) returning id`,
        [juliano, antes(5)],
      );
      await banco.db.query(
        `insert into public.mensagens (perfil_id, conversa_id, chat_id, direcao, autor, texto, provider_message_id, em)
         values ($1::uuid, $2::uuid, 'chat-x', 'entrada', 'prospect', 'Oi, tudo bem?', 'ext-1', $3)`,
        [juliano, externa!.id, antes(5)],
      );

      const todas = await comoDuda((tx) => listarChats(tx, { filtro: "all" }));
      expect(todas.map((c) => [c.nome, c.situacao, c.href, c.ultimoAutor])).toEqual([
        ["Carla", "fora", `/chats/thread/${externa!.id}`, "lead"],
        ["Bia", "precisa", `/chats/${chamou}`, "lead"],
        ["Ana", "sdr", `/chats/${comSdr}`, "sdr"],
      ]);
      expect((await comoDuda((tx) => listarChats(tx, { filtro: "sdr" }))).map((c) => c.nome)).toEqual(["Ana"]);
      expect((await comoDuda((tx) => listarChats(tx, { filtro: "you" }))).map((c) => c.nome)).toEqual(["Bia"]);
      expect((await comoDuda((tx) => listarChats(tx, { filtro: "needs-you" }))).map((c) => c.nome)).toEqual(["Bia"]);
    });

    it("resposta esperando aprovação precisa de você; conversa com você já respondida, não", async () => {
      const aprovar = await lead("em_conversa", "Dani");
      await mensagem(aprovar, "entrada", "prospect", 10);
      await pendente(aprovar, "Oi Dani, o lote mínimo é de 12 peças.");
      const respondida = await lead("escalado_humano", "Eva");
      await mensagem(respondida, "entrada", "prospect", 20);
      await mensagem(respondida, "saida", "humano", 5);

      const precisa = await comoDuda((tx) => listarChats(tx, { filtro: "needs-you" }));
      expect(precisa.map((c) => c.nome)).toEqual(["Dani"]);
      const comVoce = await comoDuda((tx) => listarChats(tx, { filtro: "you" }));
      expect(comVoce.map((c) => [c.nome, c.situacao])).toEqual([
        ["Eva", "voce"],
        ["Dani", "precisa"],
      ]);
    });

    it("a conta da casa e outra organização não aparecem", async () => {
      const id = await lead("em_conversa", "Ana");
      await mensagem(id, "entrada", "prospect", 10);
      const outra = await criarOperador(banco.db, { organizacaoId: await criarOrganizacao(banco.db) });
      expect(await comOperador(banco.db, outra, (tx) => listarChats(tx, { filtro: "all" }))).toEqual([]);

      await banco.db.query("update public.perfis set casa = true where id = $1::uuid", [juliano]);
      expect(await comoDuda((tx) => listarChats(tx, { filtro: "all" }))).toEqual([]);
    });
  });

  describe("a conversa", () => {
    it("marca cada mensagem como SDR ou Você e mostra os marcos no fio", async () => {
      const id = await lead("convite_enviado", "Ana");
      await banco.db.query(
        `insert into public.acoes (lead_id, perfil_id, tipo, toque, origem, status, agendada_para, enviada_em, idempotency_key)
         values ($1::uuid, $2::uuid, 'convite', 'T1', 'template', 'enviada', $3, $3, $4)`,
        [id, juliano, antes(600), randomUUID()],
      );
      await banco.db.query("update public.leads set aceito_em = $2 where id = $1::uuid", [id, antes(500)]);
      await mensagem(id, "saida", "sistema", 400, "Obrigado por aceitar.");
      await mensagem(id, "entrada", "prospect", 300, "Quanto custa?");
      await transicionarLead(banco.db, { leadId: id, para: "em_conversa", ator: "unipile", agora: antes(300) });
      await transicionarLead(banco.db, { leadId: id, para: "escalado_humano", ator: "agente", agora: antes(299), motivo: "pediu preço" });
      await mensagem(id, "saida", "humano", 200, "Te mando a tabela.");
      await transicionarLead(banco.db, { leadId: id, para: "em_conversa", ator: duda, agora: antes(100), motivo: "devolvida ao SDR" });
      await mensagem(id, "saida", "ia", 50, "Posso te mostrar em 20 minutos?");

      const chat = await comoDuda((tx) => abrirChat(tx, id));
      expect(chat!.fio.map((item) => (item.tipo === "mensagem" ? `${item.quem}: ${item.texto}` : `· ${item.texto}`))).toEqual([
        "· Convite enviado",
        "· Aceitou o convite",
        "sdr: Obrigado por aceitar.",
        "lead: Quanto custa?",
        "· O SDR chamou você: pediu preço",
        "voce: Te mando a tabela.",
        "· Duda devolveu a conversa ao SDR",
        "sdr: Posso te mostrar em 20 minutos?",
      ]);
      expect(chat!.lead).toMatchObject({ nome: "Ana", campanha: "Multimarcas", conta: "Juliano", estado: "em_conversa" });
      expect(chat!.situacao).toBe("sdr");
    });

    it("a resposta que espera aprovação vem com o motivo", async () => {
      const id = await lead("em_conversa", "Ana");
      await mensagem(id, "entrada", "prospect", 10);
      const acao = await pendente(id, "Te passo por WhatsApp", "barrada no validador: canal fora do LinkedIn");
      const chat = await comoDuda((tx) => abrirChat(tx, id));
      expect(chat!.pendentes).toEqual([
        { id: acao, texto: "Te passo por WhatsApp", motivo: "barrada no validador: canal fora do LinkedIn", toque: null },
      ]);
      expect(chat!.situacao).toBe("precisa");
    });

    it("outra organização não abre a conversa", async () => {
      const id = await lead("em_conversa", "Ana");
      const outra = await criarOperador(banco.db, { organizacaoId: await criarOrganizacao(banco.db) });
      expect(await comOperador(banco.db, outra, (tx) => abrirChat(tx, id))).toBeNull();
    });
  });

  describe("você assume e devolve", () => {
    it("responder pelo Chats tira o SDR: o lead vai para com humano e o rascunho pendente cai", async () => {
      const id = await lead("em_conversa", "Ana");
      await mensagem(id, "entrada", "prospect", 10, "Quanto custa?");
      const rascunho = await pendente(id, "O preço depende do lote.");

      const resultado = await responderManualmente(
        { db: banco.db, unipile, agora: AGORA },
        { leadId: id, texto: "Te explico em 2 minutos.", operadorId: duda, chave: randomUUID() },
      );
      expect(resultado.ok).toBe(true);

      const [estado] = await banco.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [id]);
      expect(estado!.estado).toBe("escalado_humano");
      const [acao] = await banco.db.query<{ status: string }>("select status from public.acoes where id = $1::uuid", [rascunho]);
      expect(acao!.status).toBe("cancelada");

      const chat = await comoDuda((tx) => abrirChat(tx, id));
      const fim = chat!.fio.slice(-2).map((item) => (item.tipo === "mensagem" ? `${item.quem}: ${item.texto}` : `· ${item.texto}`));
      expect(fim).toEqual(["voce: Te explico em 2 minutos.", "· Duda assumiu a conversa"]);
      expect(chat!.situacao).toBe("voce");
    });

    it("devolver ao SDR volta para em conversa; fora de com humano, não faz nada", async () => {
      const id = await lead("escalado_humano", "Ana");
      expect(await devolverAoSdr(banco.db, { leadId: id, operadorId: duda, agora: AGORA })).toBe(true);
      const [lead1] = await banco.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [id]);
      expect(lead1!.estado).toBe("em_conversa");
      expect(await devolverAoSdr(banco.db, { leadId: id, operadorId: duda, agora: AGORA })).toBe(false);

      const qualificado = await lead("qualificado", "Bia");
      expect(await devolverAoSdr(banco.db, { leadId: qualificado, operadorId: duda, agora: AGORA })).toBe(false);
    });
  });
});
