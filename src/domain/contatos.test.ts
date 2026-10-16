import { describe, expect, it } from "vitest";
import {
  chaveDaTag,
  contatosUnicos,
  lerPlanilhaDeContatos,
  lerTags,
  MAX_LINHAS_POR_IMPORTACAO,
  nomeDaTag,
  normalizarTelefone,
  telefoneLegivel,
} from "./contatos";

describe("telefone no formato internacional (SDR-70, §4.15)", () => {
  it.each([
    ["(11) 99999-8888", "+5511999998888"],
    ["11 3456-7890", "+551134567890"],
    ["+55 11 99999-8888", "+5511999998888"],
    ["5511999998888", "+5511999998888"],
    ["0xx11 99999-8888", "+5511999998888"],
    ["011 99999 8888", "+5511999998888"],
    ["(55) 99999-8888", "+5555999998888"],
    ["+1 415 555 2671", "+14155552671"],
    ["0044 20 7946 0958", "+442079460958"],
  ])("%s vira %s", (entrada, saida) => {
    expect(normalizarTelefone(entrada)).toEqual({ ok: true, telefone: saida });
  });

  it("celular brasileiro antigo, de 8 dígitos, ganha o 9 da frente; fixo não", () => {
    expect(normalizarTelefone("11 8765-4321")).toEqual({ ok: true, telefone: "+5511987654321" });
    expect(normalizarTelefone("21 2555-1234")).toEqual({ ok: true, telefone: "+552125551234" });
  });

  it.each([
    ["", "sem telefone"],
    ["99999-8888", "telefone sem DDD ou com dígitos a mais"],
    ["(10) 99999-8888", "DDD inválido"],
    ["11 999999-88888", "telefone sem DDD ou com dígitos a mais"],
    ["+55 11 99999-88888", "número brasileiro com dígitos a mais ou a menos"],
    ["11 1234-5678", "número brasileiro com dígitos a mais ou a menos"],
    ["+123", "telefone internacional inválido"],
  ])("%j não é telefone (%s)", (entrada, motivo) => {
    expect(normalizarTelefone(entrada)).toEqual({ ok: false, motivo });
  });

  it("mostra o número como as pessoas leem", () => {
    expect(telefoneLegivel("+5511999998888")).toBe("+55 11 99999-8888");
    expect(telefoneLegivel("+551134567890")).toBe("+55 11 3456-7890");
    expect(telefoneLegivel("+14155552671")).toBe("+14155552671");
  });
});

describe("tags (SDR-70, §4.16)", () => {
  it("nome sem espaço sobrando e até 40 caracteres; a chave ignora caixa e acento", () => {
    expect(nomeDaTag("  Clientes   VIP ")).toBe("Clientes VIP");
    expect(nomeDaTag("x".repeat(50))).toHaveLength(40);
    expect(nomeDaTag("   ")).toBeNull();
    expect(chaveDaTag("Ação Rápida")).toBe(chaveDaTag("acao rapida"));
  });

  it("a célula de tags separa por vírgula ou ponto e vírgula e não repete", () => {
    expect(lerTags("Cliente, VIP; cliente ; Evento SP|")).toEqual(["Cliente", "VIP", "Evento SP"]);
    expect(lerTags(undefined)).toEqual([]);
  });
});

describe("planilha de contatos (SDR-70, §4.15)", () => {
  it("reconhece as colunas pelo nome e normaliza telefone, e-mail e tags", () => {
    const lida = lerPlanilhaDeContatos(
      "Nome Completo;Celular;E-mail;Empresa;Cargo;Tags\n" +
        "Maria Souza;(11) 99999-8888;Maria@Acme.com;Acme;Diretora;cliente, vip\n" +
        "João;;joao@beta.com;Beta;;\n",
    );
    expect(lida.colunas).toEqual({ nome: "Nome Completo", telefone: "Celular", email: "E-mail", empresa: "Empresa", cargo: "Cargo", tags: "Tags" });
    expect(lida.recusadas).toEqual([]);
    expect(lida.contatos).toEqual([
      {
        linha: 2,
        nome: "Maria Souza",
        primeiroNome: "Maria",
        telefone: "+5511999998888",
        email: "maria@acme.com",
        empresa: "Acme",
        cargo: "Diretora",
        tags: ["cliente", "vip"],
      },
      { linha: 3, nome: "João", primeiroNome: "João", telefone: null, email: "joao@beta.com", empresa: "Beta", cargo: null, tags: [] },
    ]);
  });

  it("aceita texto colado da planilha (tab) e coluna whatsapp", () => {
    const lida = lerPlanilhaDeContatos("nome\twhatsapp\nAna\t21 98888-7777\n");
    expect(lida.contatos.map((c) => [c.nome, c.telefone])).toEqual([["Ana", "+5521988887777"]]);
  });

  it("recusa a linha com telefone inválido, e-mail inválido ou sem nenhum dos dois, dizendo qual e por quê", () => {
    const lida = lerPlanilhaDeContatos("nome,telefone,email\nA,123,\nB,,b@\nC,,\nD,11 99999-8888,\n");
    expect(lida.recusadas).toEqual([
      { linha: 2, motivo: 'Telefone "123": telefone sem DDD ou com dígitos a mais.' },
      { linha: 3, motivo: 'E-mail "b@" inválido.' },
      { linha: 4, motivo: "Sem telefone e sem e-mail: não há como falar com ela." },
    ]);
    expect(lida.contatos.map((c) => c.nome)).toEqual(["D"]);
  });

  it("sem nome, o contato leva o telefone como nome e fica sem primeiro nome", () => {
    const [contato] = lerPlanilhaDeContatos("telefone\n11999998888\n").contatos;
    expect(contato).toMatchObject({ nome: "+55 11 99999-8888", primeiroNome: null });
  });

  it("sem coluna de telefone nem de e-mail, nada entra", () => {
    expect(lerPlanilhaDeContatos("nome,empresa\nAna,Acme\n")).toMatchObject({
      contatos: [],
      recusadas: [{ linha: 1, motivo: "Nenhuma coluna de telefone ou e-mail no cabeçalho." }],
    });
  });

  it(`lê até ${MAX_LINHAS_POR_IMPORTACAO} linhas e conta as que passaram do teto`, () => {
    const corpo = Array.from({ length: MAX_LINHAS_POR_IMPORTACAO + 3 }, (_, i) => `P${i},11 9${String(i).padStart(8, "0")}`).join("\n");
    const lida = lerPlanilhaDeContatos(`nome,telefone\n${corpo}\n`);
    expect(lida.contatos).toHaveLength(MAX_LINHAS_POR_IMPORTACAO);
    expect(lida.alemDoTeto).toBe(3);
  });

  it("telefone repetido na planilha entra uma vez, com as tags somadas", () => {
    const { contatos } = lerPlanilhaDeContatos("nome,telefone,tags\nAna,11 99999-8888,a\nAna S.,+55 11 99999-8888,b;A\n");
    expect(contatosUnicos(contatos)).toEqual({ contatos: [expect.objectContaining({ nome: "Ana", tags: ["a", "b"] })], repetidos: 1 });
  });
});
