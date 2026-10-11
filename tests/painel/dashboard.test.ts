import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import { transicionarLead } from "@/server/leads/transicoes";
import { numerosDoPeriodo } from "@/server/painel/numeros";
import { precisaDeVoce } from "@/server/painel/precisa";
import { saudeDosPerfis } from "@/server/painel/saude";
import { gravarVersaoDoSdr, resumoDoSdr } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  ativarPerfil,
  criarCampanha,
  criarLead,
  criarOperador,
  criarOrganizacao,
  criarPerfilNaOrganizacao,
  criarPessoa,
  idDaOrganizacaoGuessless,
  idDoPerfil,
} from "../support/fixtures";

const AGORA = new Date("2026-10-12T15:00:00Z");
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const antes = (ms: number) => new Date(AGORA.getTime() - ms);

describe("Dashboard (SDR-47)", () => {
  let banco: BancoDeTeste;
  let duda: string;
  let juliano: string;
  let campanha: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    juliano = await ativarPerfil(banco.db, "juliano");
    duda = await criarOperador(banco.db, { nome: "Duda", perfis: ["juliano"] });
    campanha = await criarCampanha(banco.db, { perfil: "juliano" });
  });

  const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);

  async function lead(estado: string, nome = "Maria Souza", empresa = "Acme") {
    const pessoa = await criarPessoa(banco.db, { dono: "juliano", nome, empresa });
    return criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha, estado });
  }

  async function mensagem(leadId: string, direcao: "entrada" | "saida", em: Date) {
    await banco.db.query(
      `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, provider_message_id, em)
       values ($1::uuid, $2::uuid, $3, $4, 'oi', $5, $6)`,
      [leadId, juliano, direcao, direcao === "entrada" ? "prospect" : "humano", randomUUID(), em],
    );
  }

  const escalar = (leadId: string, ator: string, motivo: string, em = antes(HORA)) =>
    transicionarLead(banco.db, { leadId, para: "escalado_humano", ator, agora: em, motivo });

  describe("precisa de você", () => {
    it("a conversa em que o SDR chamou você leva direto a ela, com o motivo", async () => {
      const ana = await lead("em_conversa", "Ana Lima", "Loja da Ana");
      await mensagem(ana, "entrada", antes(2 * HORA));
      await escalar(ana, "agente", "pediu preço do atacado");

      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([
        {
          id: `conversa-${ana}`,
          texto: "Ana Lima, Loja da Ana",
          detalhe: "O SDR chamou você: pediu preço do atacado",
          href: `/chats/${ana}`,
          acao: "Responder",
        },
      ]);
    });

    it("conversa que o SDR responde sozinho, ou que você já respondeu, não espera você", async () => {
      await banco.db.query("update public.perfis set modo_resposta = 'automatico' where id = $1::uuid", [juliano]);
      const comSdr = await lead("em_conversa");
      await mensagem(comSdr, "entrada", antes(HORA));
      const respondida = await lead("em_conversa");
      await mensagem(respondida, "entrada", antes(3 * HORA));
      await escalar(respondida, "agente", "reclamou", antes(2 * HORA));
      await mensagem(respondida, "saida", antes(HORA));

      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([]);
    });

    it("conversa que você assumiu espera você quando a pessoa responde", async () => {
      const bia = await lead("em_conversa", "Bia Reis", "Ateliê");
      await escalar(bia, duda, "respondido pelo Chats", antes(2 * HORA));
      await mensagem(bia, "entrada", antes(HORA));

      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([
        expect.objectContaining({ href: `/chats/${bia}`, detalhe: "Esperando a sua resposta." }),
      ]);
    });

    it("lista cinco conversas, a mais recente primeiro, e o resto vai para os Chats", async () => {
      const leads: string[] = [];
      for (let i = 0; i < 7; i++) {
        const id = await lead("em_conversa", `Pessoa ${i}`);
        await mensagem(id, "entrada", antes((10 - i) * HORA));
        await escalar(id, "agente", "pediu preço");
        leads.push(id);
      }

      const itens = await comoDuda((tx) => precisaDeVoce(tx));
      expect(itens.map((item) => item.href)).toEqual([
        ...leads.slice(2).reverse().map((id) => `/chats/${id}`),
        "/chats?filter=needs-you",
      ]);
      expect(itens.at(-1)!.texto).toBe("Mais 2 conversas esperando você");
    });

    it("resposta para aprovar leva à conversa do lead, onde se aprova", async () => {
      const id = await lead("em_conversa");
      await banco.db.query(
        `insert into public.acoes (lead_id, perfil_id, tipo, origem, status, agendada_para, idempotency_key)
         values ($1::uuid, $2::uuid, 'dm', 'ia', 'aguardando_aprovacao', $3, $4)`,
        [id, juliano, AGORA, randomUUID()],
      );
      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([
        { id: `aprovacao-${id}`, texto: "Maria Souza, Acme", detalhe: "O SDR escreveu e espera você aprovar.", href: `/chats/${id}`, acao: "Revisar" },
      ]);
    });

    it("conta pausada leva à conta no Dashboard; desconectada, a reconectar", async () => {
      await banco.db.query("update public.perfis set status = 'pausado', motivo_pausa = 'Aceite abaixo de 15%' where id = $1::uuid", [
        juliano,
      ]);
      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([
        {
          id: `conta-${juliano}`,
          texto: "A conta de Juliano está pausada",
          detalhe: "Aceite abaixo de 15%",
          href: `/#conta-${juliano}`,
          acao: "Ver a conta",
        },
      ]);

      await banco.db.query("update public.perfis set unipile_status = 'CREDENTIALS' where id = $1::uuid", [juliano]);
      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([
        expect.objectContaining({ href: `/settings/linkedin#conta-${juliano}`, acao: "Reconectar" }),
      ]);
    });

    it("a conta da casa nunca aparece, nem no Precisa de você nem nas contas", async () => {
      const casa = await idDoPerfil(banco.db, "jp");
      await banco.db.query("update public.perfis set casa = true where id = $1::uuid", [casa]);
      await banco.db.query("insert into public.operador_perfis (operador_id, perfil_id) values ($1::uuid, $2::uuid)", [duda, casa]);

      expect(await comoDuda((tx) => precisaDeVoce(tx))).toEqual([]);
      const contas = await comoDuda((tx) => saudeDosPerfis(tx, AGORA));
      expect(contas.map((conta) => conta.id)).not.toContain(casa);
      expect(contas.find((conta) => conta.id === juliano)).toMatchObject({ status: "ativo", modoResposta: expect.any(String) });
    });

    it("outra organização não vê nada da GuessLess", async () => {
      const ana = await lead("em_conversa");
      await mensagem(ana, "entrada", antes(HORA));
      await escalar(ana, "agente", "pediu preço");
      const outra = await criarOrganizacao(banco.db);
      const perfilDeFora = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: outra, slug: "fora" });
      const deFora = await criarOperador(banco.db, { organizacaoId: outra, perfilIds: [perfilDeFora] });

      const itens = await comOperador(banco.db, deFora, (tx) => precisaDeVoce(tx));
      expect(itens.map((item) => item.id)).toEqual([`conta-${perfilDeFora}`]);
    });
  });

  describe("números do período", () => {
    async function convite(leadId: string, em: Date) {
      await banco.db.query(
        `insert into public.acoes (lead_id, perfil_id, tipo, toque, origem, status, agendada_para, enviada_em, idempotency_key)
         values ($1::uuid, $2::uuid, 'convite', 'T1', 'template', 'enviada', $3, $3, $4)`,
        [leadId, juliano, em, randomUUID()],
      );
    }
    const transicao = (leadId: string, para: string, em: Date) =>
      transicionarLead(banco.db, { leadId, para: para as never, ator: "sistema", agora: em });

    it("batem com os convites, os aceites e as transições gravadas, cada lead uma vez por etapa", async () => {
      const recente = await lead("convite_enviado");
      await convite(recente, antes(3 * DIA));
      await banco.db.query("update public.leads set aceito_em = $2 where id = $1::uuid", [recente, antes(2 * DIA)]);
      await transicao(recente, "em_conversa", antes(2 * DIA));
      await transicao(recente, "escalado_humano", antes(DIA));
      await transicao(recente, "em_conversa", antes(DIA));
      await transicao(recente, "qualificado", antes(20 * HORA));
      await transicao(recente, "reuniao_marcada", antes(12 * HORA));

      const antigo = await lead("convite_enviado");
      await convite(antigo, antes(20 * DIA));
      await banco.db.query("update public.leads set aceito_em = $2 where id = $1::uuid", [antigo, antes(15 * DIA)]);
      await transicao(antigo, "em_conversa", antes(15 * DIA));

      const velho = await lead("convite_enviado");
      await convite(velho, antes(45 * DIA));

      expect(await comoDuda((tx) => numerosDoPeriodo(tx, { periodo: "7d", agora: AGORA }))).toEqual({
        convites: 1,
        aceites: 1,
        conversas: 1,
        qualificados: 1,
        reunioes: 1,
      });
      expect(await comoDuda((tx) => numerosDoPeriodo(tx, { periodo: "30d", agora: AGORA }))).toEqual({
        convites: 2,
        aceites: 2,
        conversas: 2,
        qualificados: 1,
        reunioes: 1,
      });

      const [eventos] = await banco.db.query<{ n: number }>(
        `select count(distinct entidade_id)::int as n from public.eventos
          where tipo = 'lead_transicao' and payload ->> 'para' = 'em_conversa' and em >= $1`,
        [antes(30 * DIA)],
      );
      expect(eventos!.n).toBe(2);
    });

    it("só conta as contas que a pessoa opera", async () => {
      const id = await lead("convite_enviado");
      await convite(id, antes(DIA));
      const outro = await criarOperador(banco.db, { perfis: ["luiz"] });
      expect(await comOperador(banco.db, outro, (tx) => numerosDoPeriodo(tx, { periodo: "7d", agora: AGORA }))).toMatchObject({
        convites: 0,
      });
    });
  });

  it("o SDR mostra a versão e a última mudança, com quem fez", async () => {
    const organizacao = await idDaOrganizacaoGuessless(banco.db);
    expect(await comoDuda((tx) => resumoDoSdr(tx, organizacao))).toBeNull();

    const sdr = {
      objetivo: "marcar 20 minutos",
      voz: "Direta.",
      abertura: "Margem por canal.",
      qualificacao: [],
      objecoes: [],
      regras: [],
      quando_chamar_voce: [],
      link_agenda: null,
    };
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr, origem: "ia", por: null, agora: antes(DIA) });
    await gravarVersaoDoSdr(banco.db, {
      organizacaoId: organizacao,
      sdr: { ...sdr, voz: "Mais leve." },
      origem: "ajuste",
      pedido: "menos formal",
      resumo: "Voz mais leve.",
      por: duda,
      agora: AGORA,
    });

    expect(await comoDuda((tx) => resumoDoSdr(tx, organizacao))).toEqual({
      versao: 2,
      ultimaMudanca: { origem: "ajuste", resumo: "Voz mais leve.", pedido: "menos formal", em: AGORA, por: "Duda" },
    });
  });
});
