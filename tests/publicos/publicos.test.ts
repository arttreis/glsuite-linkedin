import { beforeEach, describe, expect, it } from "vitest";
import type { Dossie } from "@/domain/dossie";
import type { Publico, SugestaoDePublicos } from "@/domain/publico";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import {
  listarPublicos,
  mudarStatusDoPublico,
  publicoParaCampanha,
  salvarPublico,
  sugerirPublicos,
} from "@/server/publicos/publicos";
import type { SugeridorDePublicos } from "@/server/publicos/sugeridor";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-10T12:00:00Z");
const DEPOIS = new Date("2026-10-11T12:00:00Z");
const USO = { entrada: 5_000, saida: 2_000, cacheLeitura: 0, cacheEscrita: 0 };

const DOSSIE: Dossie = {
  empresa: { nome: "GuessLess", resumo: "Consultoria de crescimento para e-commerce." },
  produtos: [{ nome: "Diagnóstico de margem", descricao: "Mapa da margem por canal.", para_quem: "e-commerce" }],
  para_quem: "E-commerces de médio porte.",
  diferenciais: [],
  provas: [
    { tipo: "numero", texto: "Margem 12% maior em 6 meses", fonte_url: null },
    { tipo: "cliente", texto: "Atende a Loja X", fonte_url: null },
  ],
  dores: ["Refém do marketplace"],
  objecoes: [],
  tom_de_voz: "Direto.",
  idioma: "pt",
  mercado: { segmentos: [], alternativas: [], gatilhos: [] },
};

const PUBLICO: Publico = {
  nome: "Diretores de e-commerce de moda",
  quem: { cargos: ["Head de E-commerce", "Diretor de E-commerce"], senioridade: "diretoria" },
  empresa: { setores: ["Varejo de moda"], porte: "50 a 500 funcionários", regiao: "Brasil, Sudeste" },
  por_que: { dor: "Não sabe a margem por canal.", gatilho: "", resultado: "Decide o mix de canais com número." },
  angulo: "A margem que o marketplace esconde.",
  provas: ["Margem 12% maior em 6 meses"],
  quem_nao_e: "Analistas sem decisão de orçamento.",
};

const sugerido = (nome: string, parcial: Partial<SugestaoDePublicos["publicos"][number]> = {}) => ({
  ...PUBLICO,
  nome,
  provas: [0],
  ...parcial,
});

function sugeridorFalso(saida: SugestaoDePublicos | Error): SugeridorDePublicos & { entradas: string[] } {
  const entradas: string[] = [];
  return {
    entradas,
    async sugerir(p) {
      entradas.push(p.entrada);
      if (saida instanceof Error) throw saida;
      return { saida, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

/** Oferta com o dossiê já confirmado em `em`, direto no banco. */
async function confirmarDossie(db: Db, organizacaoId: string, em: Date, dossie: Dossie = DOSSIE) {
  await db.query(
    `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em, gerado_em)
     values ($1::uuid, 'https://guessless.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3, $3)
     on conflict (organizacao_id) do update set dossie = excluded.dossie, dossie_confirmado = excluded.dossie_confirmado,
       confirmado_em = excluded.confirmado_em`,
    [organizacaoId, JSON.stringify(dossie), em],
  );
}

describe("públicos sugeridos a partir do dossiê (SDR-25)", () => {
  let banco: BancoDeTeste;
  let guessless: string;
  let operador: string;

  const sugerir = (sugeridor: SugeridorDePublicos, organizacaoId = guessless, quem = operador) =>
    sugerirPublicos({ db: banco.db, sugeridor, agora: () => AGORA }, { organizacaoId, operadorId: quem });

  const comoOperador = <T>(fn: (tx: Db) => Promise<T>, quem = operador) => comOperador(banco.db, quem, fn);

  const listar = (organizacaoId = guessless, quem = operador) => comoOperador((tx) => listarPublicos(tx, organizacaoId), quem);

  const salvar = (publico: unknown, p: { id?: string | null; ativar?: boolean; agora?: Date } = {}) =>
    comoOperador((tx) =>
      salvarPublico(tx, {
        organizacaoId: guessless,
        id: p.id ?? null,
        publico,
        ativar: p.ativar ?? false,
        operadorId: operador,
        agora: p.agora ?? AGORA,
      }),
    );

  const mudar = (id: string, acao: "escolher" | "arquivar" | "reativar") =>
    comoOperador((tx) => mudarStatusDoPublico(tx, { id, acao, operadorId: operador, agora: AGORA }));

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
    operador = await criarOperador(banco.db, { nome: "Arthur", papel: "admin" });
  });

  it("sem dossiê confirmado, não sugere e nem chama a IA", async () => {
    const sugeridor = sugeridorFalso({ publicos: [sugerido("A")] });
    expect(await sugerir(sugeridor)).toEqual({ ok: false, erro: "Confirme o dossiê da oferta antes: os públicos saem dele." });
    expect(sugeridor.entradas).toEqual([]);
  });

  it("sugere públicos como sugestão, com o texto das provas do dossiê", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    const sugeridor = sugeridorFalso({ publicos: [sugerido("A", { provas: [1, 9] }), sugerido("B"), sugerido("C")] });

    expect(await sugerir(sugeridor)).toEqual({ ok: true, quantidade: 3 });

    const publicos = await listar();
    expect(publicos.map((p) => [p.nome, p.status, p.origem])).toEqual([
      ["A", "sugerido", "ia"],
      ["B", "sugerido", "ia"],
      ["C", "sugerido", "ia"],
    ]);
    // A prova 9 não existe no dossiê: some.
    expect(publicos[0]!.provas).toEqual(["Atende a Loja X"]);
    // A IA recebe as provas numeradas.
    expect(sugeridor.entradas[0]).toContain("1. [cliente] Atende a Loja X");
    const [evento] = await banco.db.query<{ payload: { quantidade: number; versao_prompt: string } }>(
      "select payload from public.eventos where tipo = 'publicos_sugeridos'",
    );
    expect(evento!.payload).toMatchObject({ quantidade: 3, versao_prompt: "publicos-2" });
  });

  it("toda prova de um público existe no dossiê confirmado", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    expect(await salvar({ ...PUBLICO, provas: ["Margem 12% maior em 6 meses", "Dobramos o faturamento"] })).toEqual({
      ok: false,
      erro: 'A prova "Dobramos o faturamento" não está no dossiê confirmado.',
    });
    expect(await listar()).toEqual([]);
  });

  it("o público não tem praça: a sugestão de outra organização entra inteira (SDR-53)", async () => {
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: outra });
    await confirmarDossie(banco.db, outra, AGORA);
    const sugeridor = sugeridorFalso({ publicos: [sugerido("Lojas do Sul"), sugerido("Lojas do Norte")] });

    expect(await sugerir(sugeridor, outra, deFora)).toEqual({ ok: true, quantidade: 2 });
    expect((await listar(outra, deFora)).map((p) => p.nome).sort()).toEqual(["Lojas do Norte", "Lojas do Sul"]);
  });

  it("público sugerido não vira campanha sem escolha humana", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    await sugerir(sugeridorFalso({ publicos: [sugerido("A")] }));
    const [sugestao] = await listar();

    expect(await comoOperador((tx) => publicoParaCampanha(tx, sugestao!.id))).toBeNull();

    expect(await mudar(sugestao!.id, "escolher")).toEqual({ ok: true });
    expect(await comoOperador((tx) => publicoParaCampanha(tx, sugestao!.id))).toMatchObject({ nome: "A", status: "ativo" });
    const [escolha] = await banco.db.query<{ escolhido_por: string }>("select escolhido_por from public.publicos where id = $1", [sugestao!.id]);
    expect(escolha!.escolhido_por).toBe(operador);

    await mudar(sugestao!.id, "arquivar");
    expect(await comoOperador((tx) => publicoParaCampanha(tx, sugestao!.id))).toBeNull();
  });

  it("pedir de novo troca as sugestões e mantém os escolhidos e os arquivados", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    await sugerir(sugeridorFalso({ publicos: [sugerido("A"), sugerido("B"), sugerido("C")] }));
    const [a, b] = await listar();
    await mudar(a!.id, "escolher");
    await mudar(b!.id, "arquivar");

    const sugeridor = sugeridorFalso({ publicos: [sugerido("D"), sugerido("E"), sugerido("F")] });
    await sugerir(sugeridor);

    expect((await listar()).map((p) => [p.nome, p.status])).toEqual([
      ["A", "ativo"],
      ["D", "sugerido"],
      ["E", "sugerido"],
      ["F", "sugerido"],
      ["B", "arquivado"],
    ]);
    // A IA sabe o que já foi escolhido, para não repetir.
    expect(sugeridor.entradas[0]).toContain("Públicos já escolhidos:\n- A: ");
  });

  it("falha da IA não apaga as sugestões anteriores", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    await sugerir(sugeridorFalso({ publicos: [sugerido("A")] }));

    expect(await sugerir(sugeridorFalso(new ErroDoModelo("O modelo recusou (cyber).")))).toEqual({
      ok: false,
      erro: "Não consegui sugerir públicos: O modelo recusou (cyber).",
    });
    expect((await listar()).map((p) => p.nome)).toEqual(["A"]);
  });

  it("público criado à mão já nasce escolhido; salvar e escolher vale para a sugestão", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    const criado = await salvar({ ...PUBLICO, nome: "  Criado à mão ", quem: { ...PUBLICO.quem, cargos: ["CEO", " "] } });
    expect(criado).toMatchObject({ ok: true });

    await sugerir(sugeridorFalso({ publicos: [sugerido("Sugerido")] }));
    const sugestao = (await listar()).find((p) => p.nome === "Sugerido")!;
    expect(await salvar({ ...PUBLICO, nome: "Sugerido e revisto" }, { id: sugestao.id, ativar: true })).toEqual({ ok: true, id: sugestao.id });

    expect((await listar()).map((p) => [p.nome, p.status, p.origem, p.quem.cargos])).toEqual([
      ["Criado à mão", "ativo", "humano", ["CEO"]],
      ["Sugerido e revisto", "ativo", "ia", PUBLICO.quem.cargos],
    ]);
  });

  it("o público fica desatualizado quando o dossiê é confirmado de novo; revisar tira o aviso", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    const criado = (await salvar(PUBLICO)) as { id: string };
    expect((await listar())[0]!.desatualizado).toBe(false);

    await confirmarDossie(banco.db, guessless, DEPOIS);
    expect((await listar())[0]!.desatualizado).toBe(true);

    await salvar(PUBLICO, { id: criado.id, agora: DEPOIS });
    expect((await listar())[0]!.desatualizado).toBe(false);
  });

  it("outra organização não vê nem mexe nos públicos da GuessLess", async () => {
    await confirmarDossie(banco.db, guessless, AGORA);
    await sugerir(sugeridorFalso({ publicos: [sugerido("A")] }));
    const [publico] = await listar();
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: outra });

    expect(await listar(guessless, deFora)).toEqual([]);
    expect(
      await comOperador(banco.db, deFora, (tx) => mudarStatusDoPublico(tx, { id: publico!.id, acao: "escolher", operadorId: deFora, agora: AGORA })),
    ).toMatchObject({ ok: false });
  });
});
