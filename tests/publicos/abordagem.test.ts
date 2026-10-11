import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import type { PessoaImportada } from "@/domain/importacao";
import type { Publico } from "@/domain/publico";
import { sequencia } from "@/domain/sequencia";
import { salvarCampanha } from "@/server/campanhas/campanhas";
import { comOperador } from "@/server/db/operador";
import { importarPessoas } from "@/server/importacao/importar";
import { calcularFunil } from "@/server/metricas/funil";
import { comecarAAbordar, contasDoPublico } from "@/server/publicos/abordagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import {
  criarCampanha,
  criarLead,
  criarOperador,
  criarPessoa,
  idDaOrganizacaoGuessless,
  idDoPerfil,
  SEQUENCIA_PADRAO,
} from "../support/fixtures";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);

const PUBLICO: Publico = {
  nome: "Diretores de e-commerce de moda",
  quem: { cargos: ["Head de E-commerce"], senioridade: "diretoria" },
  empresa: { setores: ["Varejo de moda"], porte: "", regiao: "Brasil, Sudeste" },
  por_que: { dor: "Não sabe a margem por canal.", gatilho: "", resultado: "Decide o mix de canais com número." },
  angulo: "A margem que o marketplace esconde",
  provas: [],
  quem_nao_e: "",
  praca: "domestico",
};

describe("campanha nasce do público (SDR-26)", () => {
  let banco: BancoDeTeste;
  let guessless: string;
  let operador: string;

  /** Público direto no banco, já com o status pedido. */
  async function criarPublico(p: Partial<Publico> & { status?: "sugerido" | "ativo" } = {}): Promise<string> {
    const pub = { ...PUBLICO, ...p };
    const [criado] = await banco.db.query<{ id: string }>(
      `insert into public.publicos (organizacao_id, nome, quem, empresa, por_que, angulo, provas, quem_nao_e, praca, origem, status)
       values ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, '[]'::jsonb, '', $7, 'ia', $8) returning id`,
      [guessless, pub.nome, JSON.stringify(pub.quem), JSON.stringify(pub.empresa), JSON.stringify(pub.por_que), pub.angulo, pub.praca, p.status ?? "ativo"],
    );
    return criado!.id;
  }

  const abordar = (publicoId: string, perfil: "arthur" | "juliano" | "luiz" | "jp") =>
    comOperador(banco.db, operador, async (tx) =>
      comecarAAbordar(tx, { publicoId, perfilId: await idDoPerfil(tx, perfil), operadorId: operador, agora: AGORA }),
    );

  const campanhaCriada = async (publicoId: string, perfil: "arthur" | "juliano") => {
    const resultado = await abordar(publicoId, perfil);
    if (!resultado.ok) throw new Error(resultado.erro);
    return resultado.campanhaId;
  };

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
  });

  it("conta de outra praça não aparece para o público e não abre campanha", async () => {
    const publico = await criarPublico();

    const contas = await comOperador(banco.db, operador, (tx) => contasDoPublico(tx, publico));
    expect(contas.map((c) => c.nome)).toEqual(["Arthur", "Juliano"]);

    expect(await abordar(publico, "luiz")).toEqual({
      ok: false,
      erro: "Esta conta não trabalha este público: é de outra praça ou você não a opera.",
    });
  });

  it("público sugerido não abre campanha", async () => {
    const publico = await criarPublico({ status: "sugerido" });
    expect(await abordar(publico, "arthur")).toEqual({ ok: false, erro: "Escolha o público antes de começar a abordar." });
  });

  it("a campanha herda nome, nicho e ângulo do público, nasce em rascunho e é uma só por conta", async () => {
    const publico = await criarPublico();

    const primeira = await abordar(publico, "arthur");
    expect(primeira).toMatchObject({ ok: true, criada: true });
    const campanhaId = (primeira as { campanhaId: string }).campanhaId;
    const [campanha] = await banco.db.query<{ nome: string; nicho: string; angulo: string; status: string; publico_id: string; fluxo_id: string | null }>(
      "select nome, nicho, angulo, status, publico_id, fluxo_id from public.campanhas where id = $1::uuid",
      [campanhaId],
    );
    expect(campanha).toMatchObject({
      nome: PUBLICO.nome,
      nicho: PUBLICO.nome,
      angulo: PUBLICO.angulo,
      status: "rascunho",
      publico_id: publico,
    });
    expect(campanha!.fluxo_id).not.toBeNull();

    expect(await abordar(publico, "arthur")).toEqual({ ok: true, campanhaId, criada: false });
    const contas = await comOperador(banco.db, operador, (tx) => contasDoPublico(tx, publico));
    expect(contas.find((c) => c.nome === "Arthur")!.campanha).toMatchObject({ id: campanhaId, status: "rascunho" });
  });

  it("nome repetido na conta ganha um número", async () => {
    await criarCampanha(banco.db, { perfil: "arthur", nome: PUBLICO.nome });
    const publico = await criarPublico();
    const campanhaId = await campanhaCriada(publico, "arthur");
    const [campanha] = await banco.db.query<{ nome: string }>("select nome from public.campanhas where id = $1::uuid", [campanhaId]);
    expect(campanha!.nome).toBe(`${PUBLICO.nome} (2)`);
  });


  it("a mesma pessoa não entra por duas contas do mesmo público (§4.7)", async () => {
    const publico = await criarPublico();
    const doArthur = await campanhaCriada(publico, "arthur");
    const doJuliano = await campanhaCriada(publico, "juliano");
    const pessoa: PessoaImportada = {
      providerId: "ACoMesmaPessoa01",
      publicIdentifier: "mesma-pessoa",
      urlPublica: "https://www.linkedin.com/in/mesma-pessoa",
      nome: "Maria Souza",
      primeiroNome: "Maria",
      cargo: "Head de E-commerce",
      empresa: "Acme",
      empresaDominio: null,
      empresaChave: "acme",
      localizacao: "São Paulo",
      coletadoEm: null,
    };
    const importar = (campanhaId: string) =>
      importarPessoas({ db: banco.db }, { campanhaId, fonte: "csv", pessoas: [pessoa], operadorId: operador, agora: AGORA });

    expect((await importar(doArthur)).resumo).toMatchObject({ novos: 1 });
    expect((await importar(doJuliano)).resumo).toMatchObject({ novos: 0, bloqueados: 1 });
  });

  it("editar a campanha no editor mantém o ângulo do público", async () => {
    const campanhaId = await campanhaCriada(await criarPublico(), "arthur");

    const salvo = await salvarCampanha(
      banco.db,
      {
        id: campanhaId,
        perfilId: await idDoPerfil(banco.db, "arthur"),
        nome: "Moda, com texto novo",
        angulo: "Margem invisível",
        nicho: PUBLICO.nome,
        modoCopy: "template",
        maxLeads: null,
        sequencia: sequencia.parse(SEQUENCIA_PADRAO),
      },
      { operadorId: operador, agora: AGORA },
    );

    expect(salvo).toMatchObject({ ok: true });
    const [campanha] = await banco.db.query<{ nome: string; angulo: string }>("select nome, angulo from public.campanhas where id = $1::uuid", [campanhaId]);
    expect(campanha).toEqual({ nome: "Moda, com texto novo", angulo: PUBLICO.angulo });
  });

  it("o funil do público só conta as campanhas dele", async () => {
    const campanhaDoPublico = await campanhaCriada(await criarPublico(), "arthur");
    const outra = await criarCampanha(banco.db, { perfil: "arthur" });
    for (const campanhaId of [campanhaDoPublico, outra]) {
      await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "arthur" }), campanhaId, estado: "convite_enviado" });
    }
    const publico = (await banco.db.query<{ id: string }>("select publico_id as id from public.campanhas where id = $1::uuid", [campanhaDoPublico]))[0]!.id;

    const funil = await calcularFunil(banco.db, { publicoId: publico });
    expect(funil.porPerfil).toHaveLength(1);
    expect(funil.porCampanha.map((l) => l.campanha)).toEqual([PUBLICO.nome]);
  });
});
