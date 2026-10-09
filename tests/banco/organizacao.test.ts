import { beforeEach, describe, expect, it } from "vitest";
import { buscarOperadorAtivo, comOperador } from "@/server/db/operador";
import { membrosDaOrganizacao, renomearOrganizacao } from "@/server/organizacao/organizacao";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-10T12:00:00Z");

describe("organização", () => {
  let banco: BancoDeTeste;
  let guessless: string;
  let admin: string;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { nome: "Arthur", papel: "admin" });
    operador = await criarOperador(banco.db, { nome: "Juliano", perfis: ["juliano"] });
  });

  it("os perfis do seed e os operadores ficam na GuessLess", async () => {
    const perfis = await banco.db.query<{ n: number }>(
      "select count(*)::int as n from public.perfis where organizacao_id = $1::uuid",
      [guessless],
    );
    expect(perfis[0]!.n).toBe(4);
    expect(await buscarOperadorAtivo(banco.db, operador)).toMatchObject({
      nome: "Juliano",
      organizacaoId: guessless,
      organizacaoNome: "GuessLess",
    });
  });

  it("o admin renomeia e o evento fica gravado", async () => {
    const resultado = await comOperador(banco.db, admin, (tx) =>
      renomearOrganizacao(tx, { organizacaoId: guessless, nome: "  GuessLess Brasil ", operadorId: admin, agora: AGORA }),
    );
    expect(resultado).toEqual({ ok: true });
    const [org] = await banco.db.query<{ nome: string }>("select nome from public.organizacoes where id = $1::uuid", [guessless]);
    expect(org!.nome).toBe("GuessLess Brasil");
    const [evento] = await banco.db.query<{ payload: { de: string; para: string }; ator: string }>(
      "select payload, ator from public.eventos where tipo = 'organizacao_renomeada'",
    );
    expect(evento).toMatchObject({ payload: { de: "GuessLess", para: "GuessLess Brasil" }, ator: admin });
  });

  it("o operador comum não renomeia", async () => {
    const resultado = await comOperador(banco.db, operador, (tx) =>
      renomearOrganizacao(tx, { organizacaoId: guessless, nome: "Outro nome", operadorId: operador, agora: AGORA }),
    );
    expect(resultado).toEqual({ ok: false, erro: "Só um admin da organização muda o nome." });
  });

  it("nome curto demais é recusado", async () => {
    const resultado = await comOperador(banco.db, admin, (tx) =>
      renomearOrganizacao(tx, { organizacaoId: guessless, nome: "X", operadorId: admin, agora: AGORA }),
    );
    expect(resultado).toEqual({ ok: false, erro: "Use de 2 a 80 caracteres." });
  });

  it("membros listam só a própria organização, com os perfis de cada um", async () => {
    const outra = await criarOrganizacao(banco.db);
    await criarOperador(banco.db, { nome: "De fora", organizacaoId: outra });
    const membros = await comOperador(banco.db, admin, (tx) => membrosDaOrganizacao(tx));
    expect(membros.map((m) => m.nome)).toEqual(["Arthur", "Juliano"]);
    expect(membros.find((m) => m.nome === "Juliano")!.perfis).toEqual(["Juliano"]);
  });

  it("com mais de uma organização, operador novo precisa dizer qual", async () => {
    await criarOrganizacao(banco.db);
    const tentativa = banco.db.query(
      "insert into public.operadores (id, nome, email, papel) values (gen_random_uuid(), 'Sem org', 'x@y.z', 'operador')",
    );
    await expect(tentativa).rejects.toThrow(/Informe a organização/);
  });
});
