import { beforeEach, describe, expect, it } from "vitest";
import { importarDaBusca, pessoaDaBusca } from "@/server/importacao/busca";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarOperador } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-01T14:00:00Z");

const resultado = {
  providerId: "ACoBusca00000001",
  nome: "Carla Mendes",
  primeiroNome: null,
  sobrenome: null,
  titulo: "Head de E-commerce",
  localizacao: "Curitiba, PR",
  publicIdentifier: "carlamendes",
  urlPublica: "https://www.linkedin.com/in/carlamendes?miniProfileUrn=x",
  empresaAtual: "Loja Sul",
  cargoAtual: "Head de E-commerce",
};

describe("importação pela busca da Unipile", () => {
  let banco: BancoDeTeste;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
  });

  it("converte o resultado da busca para o formato da importação", () => {
    expect(pessoaDaBusca(resultado)).toMatchObject({
      providerId: "ACoBusca00000001",
      urlPublica: "https://www.linkedin.com/in/carlamendes",
      primeiroNome: "Carla",
      empresaChave: "loja sul",
    });
  });

  it("busca com a conta do perfil da campanha e importa com fonte unipile_busca", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    const campanhaId = await criarCampanha(banco.db, { perfil: "arthur" });
    const unipile = new UnipileFalso();
    unipile.resultadosDeBusca = [resultado];

    const { resumo } = await importarDaBusca(
      { db: banco.db, unipile },
      {
        campanhaId,
        busca: { url: "https://www.linkedin.com/search/results/people/?keywords=ecommerce" },
        limite: 50,
        operadorId: await criarOperador(banco.db),
        agora: AGORA,
      },
    );

    expect(resumo.novos).toBe(1);
    expect(unipile.chamadasDe("buscarPessoas")[0]).toMatchObject({ accountId: "acc-arthur" });
    const [pessoa] = await banco.db.query<{ fonte: string }>("select fonte from public.pessoas");
    expect(pessoa!.fonte).toBe("unipile_busca");
  });

  it("não busca com perfil sem LinkedIn conectado", async () => {
    const campanhaId = await criarCampanha(banco.db, { perfil: "juliano" });
    await expect(
      importarDaBusca(
        { db: banco.db, unipile: new UnipileFalso() },
        { campanhaId, busca: { keywords: "ecommerce" }, limite: 10, operadorId: await criarOperador(banco.db), agora: AGORA },
      ),
    ).rejects.toThrow(/não tem LinkedIn conectado/);
  });
});
