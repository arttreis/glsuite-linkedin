import { describe, expect, it } from "vitest";
import { cargosDoPedido, escolherParametro, listaPeloNome, mudancasDaBusca, type RascunhoDaBusca } from "./conversa-da-busca";

const SP_CIDADE = { id: "105871508", nome: "São Paulo, São Paulo, Brasil" };
const SP_ESTADO = { id: "104746682", nome: "São Paulo, Brasil" };
const BRASIL = { id: "106057199", nome: "Brasil" };

const BUSCA: RascunhoDaBusca = {
  cargos: ["Head de E-commerce"],
  palavras: "",
  regioes: [BRASIL],
  setores: [],
  lista: null,
  parte: 0,
  cursor: null,
  assinatura: null,
  esgotada: false,
};

describe("conversa da busca (SDR-62)", () => {
  it("cargos do pedido sem repetido, sem aspas e no máximo 10", () => {
    const pedidos = ['"CMO"', "cmo", " Head  de Marketing ", "", ...Array.from({ length: 10 }, (_, n) => `Cargo ${n}`)];
    const { cargos, cortados } = cargosDoPedido(pedidos);
    expect(cargos.slice(0, 2)).toEqual(["CMO", "Head de Marketing"]);
    expect(cargos).toHaveLength(10);
    expect(cortados).toBe(2);
  });

  it("acha a região de mesmo nome, ou a única; com várias parecidas, pede escolha", () => {
    expect(escolherParametro("brasil", [BRASIL, { id: "1", nome: "Brasília, Distrito Federal, Brasil" }])).toEqual({ tipo: "achado", item: BRASIL });
    expect(escolherParametro("Grande SP", [SP_ESTADO])).toEqual({ tipo: "achado", item: SP_ESTADO });
    expect(escolherParametro("São Paulo", [SP_CIDADE, SP_ESTADO, { id: "2", nome: "Região Metropolitana de São Paulo" }])).toMatchObject({
      tipo: "duvida",
      opcoes: [SP_CIDADE, SP_ESTADO, { id: "2" }],
    });
    expect(escolherParametro("Atlântida", [])).toEqual({ tipo: "nada" });
  });

  it("acha a lista pelo nome igual, ou pela única que contém o nome", () => {
    const listas = [
      { id: "a", nome: "Administradoras judiciais" },
      { id: "b", nome: "Top 200 varejo" },
      { id: "c", nome: "Top 50 varejo" },
    ];
    expect(listaPeloNome("administradoras JUDICIAIS", listas)?.id).toBe("a");
    expect(listaPeloNome("200", listas)?.id).toBe("b");
    expect(listaPeloNome("varejo", listas)).toBeNull();
    expect(listaPeloNome("bancos", listas)).toBeNull();
  });

  it("mostra o que entrou e o que saiu, sem contar o que só mudou de caixa", () => {
    const depois: RascunhoDaBusca = {
      ...BUSCA,
      cargos: ["head de e-commerce", "CMO"],
      palavras: "marketplace",
      regioes: [SP_ESTADO],
      lista: { id: "6b0e3c1e-8f5a-4f61-9d1b-3a9a2c7e0b11", nome: "Top 200" },
    };
    expect(mudancasDaBusca(BUSCA, depois)).toEqual([
      { sinal: "+", texto: "CMO" },
      { sinal: "+", texto: "São Paulo, Brasil" },
      { sinal: "-", texto: "Brasil" },
      { sinal: "+", texto: 'palavras-chave "marketplace"' },
      { sinal: "+", texto: "lista Top 200" },
    ]);
    expect(mudancasDaBusca(BUSCA, BUSCA)).toEqual([]);
  });
});
