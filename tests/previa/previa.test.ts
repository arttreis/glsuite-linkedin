import { beforeEach, describe, expect, it } from "vitest";
import type { NotasDeAderencia } from "@/domain/nota";
import { MOTIVO_SEM_NOMES } from "@/domain/previa";
import { estadoDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { comOperador } from "@/server/db/operador";
import { carregarPerfisAtivos } from "@/server/despachante/perfis";
import type { AvaliadorDeAderencia } from "@/server/nota/avaliador";
import { ErroDeAtivacao, despausarPerfil } from "@/server/perfis/pausa";
import { confirmarPrevia, marcarNaPrevia, obterPrevia, rodarPrevia, trocarPublicoDaPrevia } from "@/server/previa/previa";
import type { ResultadoDeBusca } from "@/server/unipile/cliente";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarOperador, criarOrganizacao, criarPublico, idDoPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-10T23:30:00Z"); // sábado à noite em São Paulo: a prévia roda fora da janela
const USO = { entrada: 1_000, saida: 200, cacheLeitura: 0, cacheEscrita: 0 };

const resultado = (n: number, extra: Partial<ResultadoDeBusca> = {}): ResultadoDeBusca => ({
  providerId: `ACo${n}`,
  nome: `Pessoa ${n}`,
  primeiroNome: `Pessoa`,
  sobrenome: `${n}`,
  titulo: "Head de E-commerce",
  localizacao: "São Paulo",
  publicIdentifier: `pessoa-${n}`,
  urlPublica: `https://www.linkedin.com/in/pessoa-${n}`,
  empresaAtual: `Loja ${n}`,
  cargoAtual: "Head de E-commerce",
  ...extra,
});

/** Dá a nota pela posição: a primeira pessoa do lote ganha 90, a segunda 50, e assim por diante. */
function avaliadorFalso(notas: number[] = [90, 50, 80]): AvaliadorDeAderencia & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async avaliar({ sistema, entrada }) {
      chamadas.push(sistema);
      const linhas = entrada.split("\n").filter((linha) => /^\d+\./.test(linha));
      const saida: NotasDeAderencia = {
        notas: linhas.map((_, indice) => ({ indice, nota: notas[indice] ?? 10, motivo: `motivo ${indice}` })),
      };
      return { saida, uso: USO, modelo: "claude-haiku-4-5" };
    },
  };
}

describe("prévia de leads pela conta da casa (SDR-44)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let organizacao: string;
  let duda: string;
  let publico: string;
  let casa: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    unipile.parametrosDeBusca.set("LOCATION:Brasil, Sudeste", [{ id: "106057199", nome: "Sudeste do Brasil" }]);
    unipile.resultadosDeBusca = [resultado(1), resultado(2), resultado(3)];
    organizacao = await criarOrganizacao(banco.db, { nome: "Loja da Duda" });
    duda = await criarOperador(banco.db, { nome: "Duda", papel: "admin", organizacaoId: organizacao });
    publico = await criarPublico(banco.db, { organizacaoId: organizacao, cargos: ["Head de E-commerce", "Diretor de E-commerce"], status: "ativo" });
    casa = await idDoPerfil(banco.db, "arthur");
    await banco.db.query("update public.perfis set casa = true, unipile_account_id = 'conta-casa' where id = $1::uuid", [casa]);
  });

  const rodar = (opcoes: { avaliador?: AvaliadorDeAderencia | null; agora?: Date; unipileNulo?: boolean } = {}) =>
    rodarPrevia(
      {
        db: banco.db,
        unipile: opcoes.unipileNulo ? null : unipile,
        avaliador: opcoes.avaliador === undefined ? avaliadorFalso() : opcoes.avaliador,
        agora: opcoes.agora ?? AGORA,
      },
      { organizacaoId: organizacao, publicoId: publico },
    );

  it("busca pela conta da casa, a qualquer hora, com os cargos e a região do público, e marca quem passa do corte", async () => {
    const previa = await rodar();

    const [busca] = unipile.chamadasDe("buscarPessoas");
    expect(busca).toMatchObject({
      accountId: "conta-casa",
      busca: { filtros: { cargo: '"Head de E-commerce" OR "Diretor de E-commerce"', regioes: ["106057199"], setores: [] } },
    });
    expect(previa).toMatchObject({ status: "pronta", regiao: { id: "106057199", nome: "Sudeste do Brasil" }, confirmada: false });
    expect(previa.pessoas.map((p) => [p.nome, p.nota, p.marcada])).toEqual([
      ["Pessoa 1", 90, true],
      ["Pessoa 3", 80, true],
      ["Pessoa 2", 50, false],
    ]);
  });

  it("a prévia gasta o teto de busca do dia da conta da casa", async () => {
    await rodar();
    const [evento] = await banco.db.query<{ perfil_id: string; payload: { resultados: number } }>(
      "select perfil_id, payload from public.eventos where tipo = 'busca_feita'",
    );
    expect(evento).toEqual({ perfil_id: casa, payload: expect.objectContaining({ resultados: 3 }) });

    await banco.db.query("update public.configuracoes set valor = '{\"max_resultados_dia\": 3, \"nota_de_corte\": 70}' where chave = 'busca'");
    const outraOrg = await criarOrganizacao(banco.db);
    const outroPublico = await criarPublico(banco.db, { organizacaoId: outraOrg, status: "ativo" });
    const semSaldo = await rodarPrevia(
      { db: banco.db, unipile, avaliador: null, agora: AGORA },
      { organizacaoId: outraOrg, publicoId: outroPublico },
    );
    expect(semSaldo).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.limite_da_conta, pessoas: [] });
  });

  it("o teto da prévia é por organização, somando as buscas, mesmo trocando de público", async () => {
    await banco.db.query("update public.configuracoes set valor = '{\"max_pessoas\": 4}' where chave = 'previa'");
    await rodar();
    const segundo = await criarPublico(banco.db, { organizacaoId: organizacao, status: "ativo" });
    const previa = await rodarPrevia(
      { db: banco.db, unipile, avaliador: null, agora: AGORA },
      { organizacaoId: organizacao, publicoId: segundo },
    );
    expect(previa.pessoas).toHaveLength(1);

    const terceira = await rodarPrevia({ db: banco.db, unipile, avaliador: null, agora: AGORA }, { organizacaoId: organizacao, publicoId: segundo });
    expect(terceira).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.limite_da_previa });
  });

  it("opt-out nunca aparece, e a mesma pessoa vem uma vez só", async () => {
    unipile.resultadosDeBusca = [resultado(1), resultado(2), resultado(2)];
    await banco.db.query("insert into public.optouts (provider_id, texto_pedido) values ('ACo1', 'pare')");
    const previa = await rodar({ avaliador: null });
    expect(previa.pessoas.map((p) => p.providerId)).toEqual(["ACo2"]);
  });

  it("sem conta da casa, com a conta fora ou sem a Unipile, fica sem nomes e não trava", async () => {
    expect(await rodar({ unipileNulo: true })).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.sem_conta });

    await banco.db.query("update public.perfis set unipile_status = 'CREDENTIALS' where id = $1::uuid", [casa]);
    expect(await rodar()).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.conta_fora });

    await banco.db.query("update public.perfis set casa = false where id = $1::uuid", [casa]);
    expect(await rodar()).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.sem_conta });
    expect(unipile.chamadasDe("buscarPessoas")).toEqual([]);
  });

  it("região que o LinkedIn não acha cai no Brasil; sem nenhuma, fica sem nomes", async () => {
    unipile.parametrosDeBusca.clear();
    unipile.parametrosDeBusca.set("LOCATION:Brasil", [{ id: "106057198", nome: "Brasil" }]);
    expect(await rodar()).toMatchObject({ status: "pronta", regiao: { nome: "Brasil" } });

    unipile.parametrosDeBusca.clear();
    expect(await rodar()).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.sem_regiao });
  });

  it("erro de limite do LinkedIn suspende a busca da conta da casa", async () => {
    unipile.falharProxima("buscarPessoas", new ErroUnipile({ status: 429, tipo: "too_many_requests", titulo: "Too many requests" }));
    expect(await rodar()).toMatchObject({ status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.falhou });
    const [perfil] = await banco.db.query<{ busca_suspensa_ate: Date | null }>("select busca_suspensa_ate from public.perfis where id = $1::uuid", [casa]);
    expect(perfil!.busca_suspensa_ate).not.toBeNull();
  });

  it("a conta da casa nunca é movida pelo despachante nem ativa", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "conta-casa" });
    await banco.db.query("update public.perfis set casa = true where id = $1::uuid", [casa]);
    expect((await carregarPerfisAtivos(banco.db)).map((p) => p.id)).not.toContain(casa);

    await banco.db.query("update public.perfis set status = 'pausado', motivo_pausa = 'manual' where id = $1::uuid", [casa]);
    await expect(despausarPerfil(banco.db, { perfilId: casa, operadorId: duda, agora: AGORA })).rejects.toThrow(ErroDeAtivacao);
  });

  it("marcar, desmarcar e seguir: o passo 4 termina com pelo menos uma marcada", async () => {
    await rodar();
    const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);

    await comoDuda((tx) => marcarNaPrevia(tx, { organizacaoId: organizacao, providerId: "ACo1", marcada: false, agora: AGORA }));
    await comoDuda((tx) => marcarNaPrevia(tx, { organizacaoId: organizacao, providerId: "ACo3", marcada: false, agora: AGORA }));
    expect(await comoDuda((tx) => confirmarPrevia(tx, { organizacaoId: organizacao, operadorId: duda, agora: AGORA }))).toEqual({
      ok: false,
      erro: "Marque pelo menos uma pessoa para seguir.",
    });

    await comoDuda((tx) => marcarNaPrevia(tx, { organizacaoId: organizacao, providerId: "ACo2", marcada: true, agora: AGORA }));
    expect(await comoDuda((tx) => confirmarPrevia(tx, { organizacaoId: organizacao, operadorId: duda, agora: AGORA }))).toEqual({ ok: true });
    expect((await obterPrevia(banco.db, organizacao))!.pessoas.filter((p) => p.marcada).map((p) => p.providerId)).toEqual(["ACo2"]);
    const estado = await comoDuda((tx) => estadoDoPrimeiroAcesso(tx));
    expect(estado.feitos.has("leads")).toBe(true);
  });

  it("sem nomes, segue mesmo assim", async () => {
    await rodar({ unipileNulo: true });
    expect(await comOperador(banco.db, duda, (tx) => confirmarPrevia(tx, { organizacaoId: organizacao, operadorId: duda, agora: AGORA }))).toEqual({
      ok: true,
    });
  });

  it("trocar o perfil do lead volta o público para sugestão e zera a lista", async () => {
    await rodar();
    expect(
      await comOperador(banco.db, duda, (tx) => trocarPublicoDaPrevia(tx, { organizacaoId: organizacao, publicoId: publico, operadorId: duda, agora: AGORA })),
    ).toEqual({ ok: true });
    const [status] = await banco.db.query<{ status: string }>("select status from public.publicos where id = $1::uuid", [publico]);
    expect(status!.status).toBe("sugerido");
    expect(await obterPrevia(banco.db, organizacao)).toMatchObject({ publicoId: null, pessoas: [] });
  });

  it("outra organização não vê a prévia", async () => {
    await rodar();
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: await criarOrganizacao(banco.db) });
    expect(await comOperador(banco.db, deFora, (tx) => obterPrevia(tx, organizacao))).toBeNull();
  });
});
