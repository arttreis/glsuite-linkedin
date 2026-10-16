import { beforeEach, describe, expect, it } from "vitest";
import { TIPOS_DE_CANAL } from "@/domain/canais";
import { ORIGENS_DO_CONTATO } from "@/domain/contatos";
import { MODULOS } from "@/domain/modulos";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import {
  criarLancamento,
  encerrarLancamento,
  encerrarLancamentosVencidos,
  listarLancamentos,
  obterLancamento,
  pausarLancamento,
  porNoAr,
  retomarLancamento,
  salvarLancamento,
  salvarSdrDoLancamento,
} from "@/server/lancamentos/lancamentos";
import { alterarModulo, ModuloNaoContratado, modulosDaOrganizacao } from "@/server/modulos/modulos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-16T13:00:00Z");
const DIA = 24 * 3_600_000;

async function codigoDoErro(promessa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promessa;
    return undefined;
  } catch (erro) {
    return (erro as { code?: string }).code;
  }
}

const formulario = (extra: Record<string, unknown> = {}) => ({
  nome: "Lançamento Outubro",
  produto: "Curso de tráfego",
  captacaoEm: "2026-10-13T08:00",
  aulas: [
    { nome: "Aula 1", quando: "2026-10-20T20:00", link: "" },
    { nome: "Aula 2", quando: "2026-10-22T20:00", link: "" },
  ],
  carrinhoAbreEm: "2026-10-24T20:00",
  carrinhoFechaEm: "2026-10-31T23:59",
  ...extra,
});

describe("lançamentos (SDR-74, §4.21)", () => {
  let banco: BancoDeTeste;
  let guessless: string;
  let admin: string;

  const comoOperador = <T>(fn: (tx: Db) => Promise<T>, quem = admin) => comOperador(banco.db, quem, fn);
  const criar = async (entrada: unknown = formulario()) => {
    const resultado = await comoOperador((tx) => criarLancamento(tx, { organizacaoId: guessless, operadorId: admin, entrada, agora: AGORA }));
    if (!resultado.ok) throw new Error(resultado.erro);
    return resultado.id;
  };
  const estado = (id: string) =>
    banco.db
      .query<{
        status: string;
        no_ar_em: Date | null;
        no_ar_por: string | null;
        pausado_em: Date | null;
        pausado_por: string | null;
        encerrado_em: Date | null;
        encerrado_por: string | null;
      }>("select status, no_ar_em, no_ar_por, pausado_em, pausado_por, encerrado_em, encerrado_por from public.lancamentos where id = $1::uuid", [id])
      .then((linhas) => linhas[0]!);
  const eventos = (id: string) =>
    banco.db.query<{ tipo: string; ator: string; payload: Record<string, unknown> }>(
      "select tipo, ator, payload from public.eventos where entidade = 'lancamento' and entidade_id = $1 order by id",
      [id],
    );
  const transicao = (acao: typeof porNoAr, id: string, agora = AGORA) =>
    comoOperador((tx) => acao(tx, { id, organizacaoId: guessless, operadorId: admin, agora }));
  const contarTags = (organizacaoId: string) =>
    banco.db.query<{ n: number }>("select count(*)::int as n from public.tags where organizacao_id = $1::uuid", [organizacaoId]).then((l) => l[0]!.n);
  const contarLancamentos = (organizacaoId: string) =>
    banco.db.query<{ n: number }>("select count(*)::int as n from public.lancamentos where organizacao_id = $1::uuid", [organizacaoId]).then((l) => l[0]!.n);

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
  });

  describe("criar", () => {
    it("nasce montando, com a tag de mesmo nome e o evento", async () => {
      const id = await criar();
      const lancamento = await comoOperador((tx) => obterLancamento(tx, { id, organizacaoId: guessless }));
      expect(lancamento).toMatchObject({ nome: "Lançamento Outubro", produto: "Curso de tráfego", status: "montando", tagNome: "Lançamento Outubro", noArEm: null });
      expect(lancamento!.datas.aulas.map((aula) => aula.quando.toISOString())).toEqual(["2026-10-20T23:00:00.000Z", "2026-10-22T23:00:00.000Z"]);
      expect(lancamento!.datas.carrinhoAbreEm).toEqual(new Date("2026-10-24T23:00:00Z"));
      const [tag] = await banco.db.query<{ id: string; organizacao_id: string }>("select id, organizacao_id from public.tags where nome = 'Lançamento Outubro'");
      expect(tag).toEqual({ id: lancamento!.tagId, organizacao_id: guessless });
      expect(await eventos(id)).toEqual([{ tipo: "lancamento_criado", ator: admin, payload: { tag_id: tag!.id, tag_nova: true } }]);
    });

    it("nome igual ao de uma tag que já existe, sem caixa e acento, reaproveita a tag", async () => {
      const [existente] = await banco.db.query<{ id: string }>(
        "insert into public.tags (organizacao_id, nome, chave) values ($1::uuid, 'lancamento outubro', 'lancamento outubro') returning id",
        [guessless],
      );
      const antes = await contarTags(guessless);
      const id = await criar();
      expect((await comoOperador((tx) => obterLancamento(tx, { id, organizacaoId: guessless })))!.tagId).toBe(existente!.id);
      expect(await contarTags(guessless)).toBe(antes);
    });

    it("com a organização no teto de 200 tags, volta o erro do teto e nada é gravado", async () => {
      const faltam = 200 - (await contarTags(guessless));
      await banco.db.query(
        "insert into public.tags (organizacao_id, nome, chave) select $1::uuid, 'tag ' || g, 'tag ' || g from generate_series(1, $2::int) g",
        [guessless, faltam],
      );
      const resultado = await comoOperador((tx) => criarLancamento(tx, { organizacaoId: guessless, operadorId: admin, entrada: formulario(), agora: AGORA }));
      expect(resultado).toEqual({ ok: false, erro: expect.stringContaining("200 tags") });
      expect(await contarLancamentos(guessless)).toBe(0);
    });

    it("datas que a §4.21 recusa não salvam; o banco também recusa carrinho invertido", async () => {
      const resultado = await comoOperador((tx) =>
        criarLancamento(tx, { organizacaoId: guessless, operadorId: admin, entrada: formulario({ carrinhoFechaEm: "2026-10-24T19:00" }), agora: AGORA }),
      );
      expect(resultado).toEqual({ ok: false, erro: "O carrinho fecha antes de abrir. Confira as duas datas." });
      expect(await contarLancamentos(guessless)).toBe(0);

      const id = await criar();
      const invertido = banco.db.query("update public.lancamentos set carrinho_fecha_em = carrinho_abre_em where id = $1::uuid", [id]);
      expect(await codigoDoErro(invertido)).toBe("23514");
    });
  });

  describe("módulo e organização", () => {
    it("organização só com o LinkedIn: criar, obter e pôr no ar lançam ModuloNaoContratado e nada é gravado", async () => {
      const id = await criar();
      const nova = await criarOrganizacao(banco.db);
      const deFora = await criarOperador(banco.db, { organizacaoId: nova, papel: "admin" });
      const como = <T>(fn: (tx: Db) => Promise<T>) => comOperador(banco.db, deFora, fn);
      await expect(como((tx) => criarLancamento(tx, { organizacaoId: nova, operadorId: deFora, entrada: formulario(), agora: AGORA }))).rejects.toBeInstanceOf(
        ModuloNaoContratado,
      );
      await expect(como((tx) => obterLancamento(tx, { id, organizacaoId: nova }))).rejects.toBeInstanceOf(ModuloNaoContratado);
      await expect(como((tx) => porNoAr(tx, { id, organizacaoId: nova, operadorId: deFora, agora: AGORA }))).rejects.toThrow(
        "O módulo Lançamentos em grupos não está no plano da sua organização.",
      );
      expect(await contarLancamentos(nova)).toBe(0);
      expect(await contarTags(nova)).toBe(0);
      expect((await estado(id)).status).toBe("montando");
    });

    it("o operador de outra organização não lê nem muda o lançamento", async () => {
      const id = await criar();
      const outra = await criarOrganizacao(banco.db);
      await alterarModulo(banco.db, { organizacaoId: outra, modulo: "instagram", ativo: true, motivo: "teste", por: "arthur@guessless.com.br", agora: AGORA });
      const deFora = await criarOperador(banco.db, { organizacaoId: outra, papel: "admin" });
      const como = <T>(fn: (tx: Db) => Promise<T>) => comOperador(banco.db, deFora, fn);

      expect(await como((tx) => obterLancamento(tx, { id, organizacaoId: outra }))).toBeNull();
      expect(await como((tx) => salvarLancamento(tx, { id, organizacaoId: outra, entrada: formulario({ nome: "Roubado" }), agora: AGORA }))).toEqual({
        ok: false,
        erro: "Lançamento não encontrado.",
      });
      expect(await como((tx) => porNoAr(tx, { id, organizacaoId: outra, operadorId: deFora, agora: AGORA }))).toEqual({ ok: false, erro: "Lançamento não encontrado." });
      expect(await como((tx) => listarLancamentos(tx, outra))).toEqual([]);
      // Mesmo dizendo ser da organização dele, o RLS não deixa ver os módulos nem o lançamento.
      await expect(como((tx) => obterLancamento(tx, { id, organizacaoId: guessless }))).rejects.toBeInstanceOf(ModuloNaoContratado);
      const [linha] = await banco.db.query<{ nome: string }>("select nome from public.lancamentos where id = $1::uuid", [id]);
      expect(linha!.nome).toBe("Lançamento Outubro");
    });

    it("tag de outra organização não entra no lançamento (trigger)", async () => {
      const id = await criar();
      const outra = await criarOrganizacao(banco.db);
      const [tag] = await banco.db.query<{ id: string }>(
        "insert into public.tags (organizacao_id, nome, chave) values ($1::uuid, 'Alheia', 'alheia') returning id",
        [outra],
      );
      await expect(banco.db.query("update public.lancamentos set tag_id = $2::uuid where id = $1::uuid", [id, tag!.id])).rejects.toThrow("A tag é de outra organização.");
      await expect(banco.db.query("update public.lancamentos set tag_comprador_id = $2::uuid where id = $1::uuid", [id, tag!.id])).rejects.toThrow(
        "A tag é de outra organização.",
      );
    });
  });

  describe("editar", () => {
    it("mudar o nome não renomeia a tag; a aba SDR guarda preço, perguntas, o que o SDR sabe e o link", async () => {
      const id = await criar();
      expect(await comoOperador((tx) => salvarLancamento(tx, { id, organizacaoId: guessless, entrada: formulario({ nome: "Lançamento Novembro" }), agora: AGORA }))).toEqual({
        ok: true,
      });
      const sdr = {
        preco: "12x de R$ 97",
        perguntas: [{ pergunta: "Tem garantia?", resposta: "Sete dias." }],
        sdrSabe: "x".repeat(2000),
        linkDoCarrinho: "https://pay.hotmart.com/X123",
      };
      expect(await comoOperador((tx) => salvarSdrDoLancamento(tx, { id, organizacaoId: guessless, entrada: sdr, agora: AGORA }))).toEqual({ ok: true });
      expect(await comoOperador((tx) => salvarSdrDoLancamento(tx, { id, organizacaoId: guessless, entrada: { ...sdr, linkDoCarrinho: "http://x.com" }, agora: AGORA }))).toEqual({
        ok: false,
        erro: "O link do carrinho precisa começar com https://.",
      });
      const lancamento = await comoOperador((tx) => obterLancamento(tx, { id, organizacaoId: guessless }));
      expect(lancamento).toMatchObject({
        nome: "Lançamento Novembro",
        tagNome: "Lançamento Outubro",
        preco: "12x de R$ 97",
        perguntas: [{ pergunta: "Tem garantia?", resposta: "Sete dias." }],
        linkDoCarrinho: "https://pay.hotmart.com/X123",
      });
      expect(lancamento!.sdrSabe).toHaveLength(2000);
    });
  });

  describe("estados", () => {
    it("pôr no ar recusa aula fora de ordem gravada direto; com datas válidas, grava quem e quando", async () => {
      const id = await criar();
      await banco.db.query(
        `update public.lancamentos set aulas = '[{"nome": "Aula 1", "quando": "2026-10-22T23:00:00.000Z", "link": null},
                                                {"nome": "Aula 2", "quando": "2026-10-20T23:00:00.000Z", "link": null}]'::jsonb
          where id = $1::uuid`,
        [id],
      );
      expect(await transicao(porNoAr, id)).toEqual({ ok: false, erro: "As aulas precisam estar em ordem de data: a aula 2 está antes da aula 1." });
      expect((await estado(id)).status).toBe("montando");

      expect(await comoOperador((tx) => salvarLancamento(tx, { id, organizacaoId: guessless, entrada: formulario(), agora: AGORA }))).toEqual({ ok: true });
      expect(await transicao(porNoAr, id)).toEqual({ ok: true });
      expect(await estado(id)).toMatchObject({ status: "no_ar", no_ar_em: AGORA, no_ar_por: admin });
      expect(await transicao(porNoAr, id)).toEqual({ ok: false, erro: "Este lançamento já está no ar." });
      expect((await comoOperador((tx) => obterLancamento(tx, { id, organizacaoId: guessless })))!.noArPor).toBe("Arthur");
    });

    it("pausar, retomar e encerrar gravam quem e quando, com os eventos na ordem; encerrado não volta", async () => {
      const id = await criar();
      expect(await transicao(pausarLancamento, id)).toEqual({ ok: false, erro: "Só dá para pausar lançamento no ar." });
      await transicao(porNoAr, id);
      const depois = (minutos: number) => new Date(AGORA.getTime() + minutos * 60_000);

      expect(await transicao(pausarLancamento, id, depois(1))).toEqual({ ok: true });
      expect(await estado(id)).toMatchObject({ status: "no_ar", pausado_em: depois(1), pausado_por: admin });
      expect(await transicao(pausarLancamento, id, depois(2))).toEqual({ ok: false, erro: "Este lançamento já está pausado." });

      expect(await transicao(retomarLancamento, id, depois(3))).toEqual({ ok: true });
      expect(await estado(id)).toMatchObject({ status: "no_ar", pausado_em: null, pausado_por: null });
      expect(await transicao(retomarLancamento, id, depois(4))).toEqual({ ok: false, erro: "Este lançamento não está pausado." });

      await transicao(pausarLancamento, id, depois(5));
      expect(await comoOperador((tx) => encerrarLancamento(tx, { id, organizacaoId: guessless, por: admin, agora: depois(6) }))).toEqual({ ok: true });
      expect(await estado(id)).toMatchObject({ status: "encerrado", encerrado_em: depois(6), encerrado_por: admin, pausado_em: null, pausado_por: null });

      expect(await transicao(porNoAr, id)).toEqual({ ok: false, erro: "Lançamento encerrado não volta ao ar." });
      expect(await transicao(pausarLancamento, id)).toEqual({ ok: false, erro: "Este lançamento já foi encerrado." });
      expect(await transicao(retomarLancamento, id)).toEqual({ ok: false, erro: "Este lançamento já foi encerrado." });
      expect(await comoOperador((tx) => encerrarLancamento(tx, { id, organizacaoId: guessless, por: admin, agora: AGORA }))).toEqual({
        ok: false,
        erro: "Este lançamento já foi encerrado.",
      });

      expect((await eventos(id)).map((e) => [e.tipo, e.ator])).toEqual([
        ["lancamento_criado", admin],
        ["lancamento_no_ar", admin],
        ["lancamento_pausado", admin],
        ["lancamento_retomado", admin],
        ["lancamento_pausado", admin],
        ["lancamento_encerrado", admin],
      ]);
      expect((await eventos(id)).at(-1)!.payload).toEqual({ sozinho: false });
    });

    it("montando também encerra à mão", async () => {
      const id = await criar();
      expect(await comoOperador((tx) => encerrarLancamento(tx, { id, organizacaoId: guessless, por: admin, agora: AGORA }))).toEqual({ ok: true });
      expect((await estado(id)).status).toBe("encerrado");
    });
  });

  describe("encerrar sozinho", () => {
    const fecharHa = (id: string, ms: number) =>
      banco.db.query("update public.lancamentos set carrinho_abre_em = $2::timestamptz - interval '1 day', carrinho_fecha_em = $2 where id = $1::uuid", [
        id,
        new Date(AGORA.getTime() - ms),
      ]);

    it("no ar com o carrinho fechado há 7 dias encerra, não antes; pausado também; montando nunca", async () => {
      const noAr = await criar();
      await transicao(porNoAr, noAr);
      const pausado = await criar(formulario({ nome: "Lançamento Pausado" }));
      await transicao(porNoAr, pausado);
      await transicao(pausarLancamento, pausado);
      const montando = await criar(formulario({ nome: "Lançamento Montando" }));

      await fecharHa(noAr, 7 * DIA - 60_000);
      await fecharHa(pausado, 7 * DIA - 60_000);
      await fecharHa(montando, 30 * DIA);
      expect(await encerrarLancamentosVencidos(banco.db, AGORA)).toBe(0);

      await fecharHa(noAr, 7 * DIA);
      await fecharHa(pausado, 8 * DIA);
      expect(await encerrarLancamentosVencidos(banco.db, AGORA)).toBe(2);
      expect(await estado(noAr)).toMatchObject({ status: "encerrado", encerrado_em: AGORA, encerrado_por: null });
      expect(await estado(pausado)).toMatchObject({ status: "encerrado", pausado_em: null });
      expect((await eventos(noAr)).at(-1)).toEqual({ tipo: "lancamento_encerrado", ator: "sistema", payload: { sozinho: true } });
      expect((await estado(montando)).status).toBe("montando");
      expect(await encerrarLancamentosVencidos(banco.db, AGORA)).toBe(0);
    });

    it("organização que desligou os módulos dos lançamentos fica de fora: nada roda em segundo plano", async () => {
      const id = await criar();
      await transicao(porNoAr, id);
      await fecharHa(id, 10 * DIA);
      for (const modulo of ["instagram", "facebook", "comunidades"] as const) {
        await alterarModulo(banco.db, { organizacaoId: guessless, modulo, ativo: false, motivo: "teste", por: "arthur@guessless.com.br", agora: AGORA });
      }
      expect(await encerrarLancamentosVencidos(banco.db, AGORA)).toBe(0);
      expect((await estado(id)).status).toBe("no_ar");
    });
  });

  describe("o banco do Marco E", () => {
    it("os checks aceitam os valores novos e recusam um inventado; disparo continua só WhatsApp e Telegram", async () => {
      const canais: Record<string, string> = {};
      for (const tipo of TIPOS_DE_CANAL) {
        const [canal] = await banco.db.query<{ id: string }>(
          "insert into public.canais (organizacao_id, tipo, nome, status) values ($1::uuid, $2, 'teste', 'desconectado') returning id",
          [guessless, tipo],
        );
        canais[tipo] = canal!.id;
      }
      const outra = await criarOrganizacao(banco.db);
      expect(await codigoDoErro(banco.db.query("insert into public.canais (organizacao_id, tipo, nome, status) values ($1::uuid, 'sms', 'x', 'desconectado')", [outra]))).toBe(
        "23514",
      );

      for (const origem of ORIGENS_DO_CONTATO) {
        await banco.db.query("insert into public.contatos (organizacao_id, nome, origem) values ($1::uuid, $2, $3)", [guessless, `Contato ${origem}`, origem]);
      }
      expect(await codigoDoErro(banco.db.query("insert into public.contatos (organizacao_id, nome, origem) values ($1::uuid, 'X', 'tiktok')", [guessless]))).toBe("23514");

      await banco.db.query("insert into public.modulos_da_organizacao (organizacao_id, modulo) values ($1::uuid, 'comunidades')", [outra]);
      expect(await codigoDoErro(banco.db.query("insert into public.modulos_da_organizacao (organizacao_id, modulo) values ($1::uuid, 'email')", [outra]))).toBe("23514");

      const disparo = (tipo: string) =>
        banco.db.query("insert into public.disparos (organizacao_id, canal_id, canal_tipo, nome) values ($1::uuid, $2::uuid, $3, 'Teste')", [guessless, canais[tipo], tipo]);
      await disparo("whatsapp");
      expect(await codigoDoErro(disparo("instagram"))).toBe("23514");
    });

    it("a GuessLess tem os seis módulos, na ordem do catálogo; organização nova, só o LinkedIn", async () => {
      expect(await modulosDaOrganizacao(banco.db, guessless)).toEqual([...MODULOS]);
      expect(await modulosDaOrganizacao(banco.db, await criarOrganizacao(banco.db))).toEqual(["linkedin"]);
    });
  });
});
