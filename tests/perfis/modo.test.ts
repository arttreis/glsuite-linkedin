import { beforeEach, describe, expect, it } from "vitest";
import { VERSAO_DOS_PROMPTS } from "@/server/agente/prompts";
import { avaliarGate, avaliarModosAutomaticos, ErroDeModo, registrarEval, trocarModo } from "@/server/perfis/modo";
import { executarTick } from "@/server/tick";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa, idDoPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-15T15:00:00Z");
const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);

function relatorio(vereditos: Record<string, "aprovado" | "reprovado" | "inconclusivo">, versao = VERSAO_DOS_PROMPTS) {
  return {
    geradoEm: diasAtras(1).toISOString(),
    versaoDosPrompts: versao,
    versaoDoJuiz: "juiz-1",
    pracas: Object.entries(vereditos).map(([praca, veredito]) => ({
      praca,
      casos: 34,
      veredito,
      motivos: veredito === "aprovado" ? [] : ["tom abaixo do mínimo"],
      custo: { total: 0.42 },
    })),
  };
}

describe("modo automático por perfil (SDR-17)", () => {
  let banco: BancoDeTeste;
  let arthur: string;
  let operador: string;
  let campanha: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    arthur = await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    operador = await criarOperador(banco.db, { nome: "Arthur", perfis: ["arthur"] });
    campanha = await criarCampanha(banco.db);
    await banco.db.query("update public.configuracoes set valor = '\"admin@guessless.com.br\"' where chave = 'alerta_admin_email'");
  });

  const modo = async (perfilId = arthur) =>
    (await banco.db.query<{ modo_resposta: string }>("select modo_resposta from public.perfis where id = $1::uuid", [perfilId]))[0]!
      .modo_resposta;

  async function leadEmConversa(): Promise<{ leadId: string; providerId: string }> {
    const providerId = `ACo${Math.random().toString(36).slice(2)}`;
    const pessoaId = await criarPessoa(banco.db, { providerId });
    const leadId = await criarLead(banco.db, { pessoaId, campanhaId: campanha, estado: "em_conversa" });
    return { leadId, providerId };
  }

  /** Rascunho da IA que um humano decidiu na fila. */
  async function rascunhoDecidido(decisao: "aprovada" | "editada" | "rejeitada", decididaEm = diasAtras(2)) {
    const { leadId } = await leadEmConversa();
    await banco.db.query(
      `insert into public.acoes (lead_id, perfil_id, tipo, origem, status, idempotency_key, agendada_para, decisao_humana, decidida_em)
       values ($1::uuid, $2::uuid, 'dm', 'ia', $3, gen_random_uuid()::text, $4, $5, $4)`,
      [leadId, arthur, decisao === "rejeitada" ? "cancelada" : "enviada", decididaEm, decisao],
    );
  }

  /** Perfil há 20 dias em aprovação, com 20 decisões e `editadas` delas editadas. */
  async function historicoEmAprovacao(editadas: number) {
    await banco.db.query("update public.perfis set modo_resposta = 'aprovacao', modo_desde = $2 where id = $1::uuid", [
      arthur,
      diasAtras(20),
    ]);
    for (let i = 0; i < 20; i += 1) await rascunhoDecidido(i < editadas ? "editada" : "aprovada");
  }

  /** DM que a IA agendou sozinha no automático, com o desfecho dela. */
  async function mensagemAutomatica(desfecho: "enviada" | "barrada" | "falhou" | "optout" | "pendente") {
    const { leadId, providerId } = await leadEmConversa();
    const [mensagem] = await banco.db.query<{ id: string }>(
      `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, em)
       values ($1::uuid, $2::uuid, 'entrada', 'prospect', 'Oi', $3) returning id`,
      [leadId, arthur, diasAtras(2)],
    );
    const status = { enviada: "enviada", optout: "enviada", barrada: "aguardando_aprovacao", falhou: "falhou", pendente: "pendente" }[desfecho];
    const [acao] = await banco.db.query<{ id: string }>(
      `insert into public.acoes (lead_id, perfil_id, tipo, origem, status, idempotency_key, agendada_para, criada_em, enviada_em, texto_final)
       values ($1::uuid, $2::uuid, 'dm', 'ia', $3, gen_random_uuid()::text, $4, $4, $5, 'Obrigado pela resposta.') returning id`,
      [leadId, arthur, status, diasAtras(2), status === "enviada" ? diasAtras(2) : null],
    );
    await banco.db.query(
      `insert into public.rascunhos (lead_id, perfil_id, mensagem_id, modo, resultado, acao_id)
       values ($1::uuid, $2::uuid, $3::uuid, 'automatico', 'agendado', $4::uuid)`,
      [leadId, arthur, mensagem!.id, acao!.id],
    );
    if (desfecho === "barrada") {
      await banco.db.query(
        "insert into public.eventos (tipo, entidade, entidade_id, perfil_id, payload, em) values ('acao_em_revisao', 'acao', $1, $2::uuid, '{}', $3)",
        [acao!.id, arthur, diasAtras(2)],
      );
    }
    if (desfecho === "optout") {
      await banco.db.query("insert into public.optouts (provider_id, em) values ($1, $2)", [providerId, diasAtras(1)]);
    }
    return acao!.id;
  }

  describe("gate para ligar", () => {
    it("bloqueia sem o gate, explica os motivos e registra a tentativa", async () => {
      await banco.db.query("update public.perfis set modo_resposta = 'aprovacao', modo_desde = $2 where id = $1::uuid", [
        arthur,
        diasAtras(3),
      ]);

      const tentativa = trocarModo(banco.db, { perfilId: arthur, para: "automatico", operadorId: operador, agora: AGORA });

      await expect(tentativa).rejects.toBeInstanceOf(ErroDeModo);
      const erro = (await tentativa.catch((e: ErroDeModo) => e)) as ErroDeModo;
      expect(erro.motivos).toEqual([
        "O perfil está há 3 dias em aprovacao; o mínimo é 14.",
        "Só 0 rascunhos decididos nos últimos 14 dias; o mínimo é 20.",
        `Nenhum eval registrado para a praça na versão ${VERSAO_DOS_PROMPTS} dos prompts.`,
      ]);
      expect(await modo()).toBe("aprovacao");
      const eventos = await banco.db.query<{ tipo: string; ator: string }>(
        "select tipo, ator from public.eventos where entidade = 'perfil' and entidade_id = $1",
        [arthur],
      );
      expect(eventos).toEqual([{ tipo: "automatico_bloqueado", ator: operador }]);
    });

    it("bloqueia com edição acima do limiar mesmo com eval aprovado", async () => {
      await historicoEmAprovacao(2);
      await registrarEval(banco.db, { relatorio: relatorio({ domestico: "aprovado" }), operadorId: operador, agora: AGORA });

      const gate = await avaliarGate(banco.db, arthur, AGORA);

      expect(gate).toEqual({ liberado: false, motivos: ["Taxa de edição/rejeição de 10%; precisa ficar abaixo de 10%."] });
    });

    it("bloqueia com eval reprovado ou de outra praça", async () => {
      await historicoEmAprovacao(1);
      await registrarEval(banco.db, {
        relatorio: relatorio({ domestico: "reprovado", canada: "aprovado" }),
        operadorId: operador,
        agora: AGORA,
      });

      expect((await avaliarGate(banco.db, arthur, AGORA)).motivos).toEqual([
        `O eval da praça na versão ${VERSAO_DOS_PROMPTS} dos prompts está reprovado.`,
      ]);
    });

    it("liga com o gate cumprido e registra a troca", async () => {
      await historicoEmAprovacao(1);
      await registrarEval(banco.db, { relatorio: relatorio({ domestico: "aprovado" }), operadorId: operador, agora: AGORA });

      await trocarModo(banco.db, { perfilId: arthur, para: "automatico", operadorId: operador, agora: AGORA });

      expect(await modo()).toBe("automatico");
      const [evento] = await banco.db.query<{ payload: unknown; ator: string }>(
        "select payload, ator from public.eventos where tipo = 'modo_alterado'",
      );
      expect(evento).toEqual({ payload: { de: "aprovacao", para: "automatico", devolvidas_para_fila: 0 }, ator: operador });
    });

    it("recusa eval de outra versão dos prompts", async () => {
      await expect(
        registrarEval(banco.db, { relatorio: relatorio({ domestico: "aprovado" }, "2020-01-01.1"), operadorId: operador, agora: AGORA }),
      ).rejects.toThrow(/versão 2020-01-01.1/);
      await expect(registrarEval(banco.db, { relatorio: { qualquer: 1 }, operadorId: operador, agora: AGORA })).rejects.toThrow(
        /relatorio.json/,
      );
    });

    it("na Espanha o automático não existe", async () => {
      const jp = await idDoPerfil(banco.db, "jp");

      await expect(trocarModo(banco.db, { perfilId: jp, para: "automatico", operadorId: operador, agora: AGORA })).rejects.toThrow(
        /Espanha/,
      );
    });

    it("sair do automático devolve para a fila o que ainda não saiu", async () => {
      await banco.db.query("update public.perfis set modo_resposta = 'automatico' where id = $1::uuid", [arthur]);
      const pendente = await mensagemAutomatica("pendente");

      await trocarModo(banco.db, { perfilId: arthur, para: "aprovacao", operadorId: operador, agora: AGORA });

      const [acao] = await banco.db.query<{ status: string; texto_final: string | null }>(
        "select status, texto_final from public.acoes where id = $1::uuid",
        [pendente],
      );
      expect(acao).toEqual({ status: "aguardando_aprovacao", texto_final: null });
      const [perfil] = await banco.db.query<{ modo_desde: Date }>("select modo_desde from public.perfis where id = $1::uuid", [arthur]);
      expect(perfil!.modo_desde).toEqual(AGORA);
    });
  });

  describe("rebaixamento automático", () => {
    beforeEach(async () => {
      await banco.db.query("update public.perfis set modo_resposta = 'automatico', modo_desde = $2 where id = $1::uuid", [
        arthur,
        diasAtras(30),
      ]);
    });

    it("volta para aprovação com erro acima do limiar, registra e avisa", async () => {
      for (let i = 0; i < 8; i += 1) await mensagemAutomatica("enviada");
      await mensagemAutomatica("barrada");
      await mensagemAutomatica("optout");
      const pendente = await mensagemAutomatica("pendente");

      const resultado = await avaliarModosAutomaticos(banco.db, AGORA);

      expect(resultado.rebaixados).toEqual([arthur]);
      expect(await modo()).toBe("aprovacao");
      const [evento] = await banco.db.query<{ payload: Record<string, unknown>; ator: string }>(
        "select payload, ator from public.eventos where tipo = 'modo_rebaixado'",
      );
      expect(evento!.ator).toBe("sistema");
      expect(evento!.payload).toMatchObject({ de: "automatico", para: "aprovacao", mensagens: 10, erros: 2, devolvidas_para_fila: 1 });
      expect(evento!.payload.motivo).toBe(
        "Taxa de erro de 20% nas mensagens automáticas dos últimos 7 dias (2 de 10), acima de 10%.",
      );
      const [alerta] = await banco.db.query<{ tipo: string; assunto: string; destinatarios: string[] }>(
        "select tipo, assunto, destinatarios from public.alertas",
      );
      expect(alerta).toEqual({
        tipo: "modo_rebaixado",
        assunto: "[SDR] Perfil Arthur voltou para aprovação",
        destinatarios: ["admin@guessless.com.br"],
      });
      const [acao] = await banco.db.query<{ status: string }>("select status from public.acoes where id = $1::uuid", [pendente]);
      expect(acao!.status).toBe("aguardando_aprovacao");
    });

    it("não rebaixa com erro no limiar ou com amostra pequena", async () => {
      for (let i = 0; i < 9; i += 1) await mensagemAutomatica("enviada");
      await mensagemAutomatica("falhou");
      expect((await avaliarModosAutomaticos(banco.db, AGORA)).rebaixados).toEqual([]);

      await banco.db.query("delete from public.rascunhos");
      await banco.db.query("delete from public.acoes");
      for (let i = 0; i < 3; i += 1) await mensagemAutomatica("barrada");
      expect((await avaliarModosAutomaticos(banco.db, AGORA)).rebaixados).toEqual([]);
      expect(await modo()).toBe("automatico");
    });

    it("roda no tick, antes do despacho", async () => {
      for (let i = 0; i < 5; i += 1) await mensagemAutomatica("enviada");
      for (let i = 0; i < 5; i += 1) await mensagemAutomatica("falhou");

      const relatorioDoTick = await executarTick({ db: banco.db, unipile: new UnipileFalso(), agora: AGORA });

      expect(relatorioDoTick.executado && relatorioDoTick.etapas.modo).toEqual({ ok: true, resultado: { rebaixados: [arthur] } });
      expect(await modo()).toBe("aprovacao");
    });
  });
});
