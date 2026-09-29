import { describe, expect, it } from "vitest";
import {
  ehLinhaInvalida,
  extrairProviderId,
  lerArquivoDeImportacao,
  lerCsv,
  normalizarPessoa,
  publicIdentifierDaUrl,
} from "./importacao";

describe("importação", () => {
  it("lê CSV do Excel em português (ponto e vírgula, aspas e BOM)", () => {
    const csv = '﻿nome;empresa;url\r\n"Souza, Maria";"Acme ""Tech""";https://www.linkedin.com/in/maria\r\n';
    expect(lerCsv(csv)).toEqual([{ nome: "Souza, Maria", empresa: 'Acme "Tech"', url: "https://www.linkedin.com/in/maria" }]);
  });

  it("lê JSON do Apify, em lista ou em { items }", () => {
    expect(lerArquivoDeImportacao("x.json", '[{"fullName":"A"}]')).toHaveLength(1);
    expect(lerArquivoDeImportacao("dataset.json", '{"items":[{"fullName":"A"},{"fullName":"B"}]}')).toHaveLength(2);
  });

  it("extrai provider_id de URN e de campo solto", () => {
    expect(extrairProviderId("urn:li:fsd_profile:ACoAABCDEFGHIJ12345")).toBe("ACoAABCDEFGHIJ12345");
    expect(extrairProviderId("ACwAAB-sales_nav_1234")).toBe("ACwAAB-sales_nav_1234");
    expect(extrairProviderId("12345")).toBeNull();
  });

  it("tira o public identifier da URL", () => {
    expect(publicIdentifierDaUrl("https://www.linkedin.com/in/Maria-Souza-123/?originalSubdomain=br")).toBe("maria-souza-123");
    expect(publicIdentifierDaUrl("https://example.com")).toBeNull();
  });

  it("normaliza a saída de um actor do Apify com campos aninhados", () => {
    const pessoa = normalizarPessoa(
      {
        id: "ACoAAB1234567890abc",
        linkedinUrl: "https://www.linkedin.com/in/joao-silva?trk=x",
        firstName: "JOÃO",
        lastName: "Silva",
        headline: "Diretor Comercial na Acme",
        location: { linkedinText: "São Paulo, Brasil" },
        currentPosition: [{ companyName: "Acme Tecnologia Ltda" }],
        scrapedAt: "2026-09-20T10:00:00Z",
      },
      1,
    );
    expect(ehLinhaInvalida(pessoa)).toBe(false);
    expect(pessoa).toMatchObject({
      providerId: "ACoAAB1234567890abc",
      publicIdentifier: "joao-silva",
      urlPublica: "https://www.linkedin.com/in/joao-silva",
      nome: "JOÃO Silva",
      primeiroNome: "João",
      cargo: "Diretor Comercial na Acme",
      empresa: "Acme Tecnologia Ltda",
      empresaChave: "acme tecnologia",
      localizacao: "São Paulo, Brasil",
      coletadoEm: "2026-09-20T10:00:00.000Z",
    });
  });

  it("aceita o CSV canônico do SDR", () => {
    const [linha] = lerCsv(
      "provider_id,url_publica,nome,cargo,empresa,empresa_dominio,localizacao\nACoAAB1234567890abc,https://www.linkedin.com/in/ana,Ana Lima,CEO,Loja X,lojax.com.br,Recife",
    );
    expect(normalizarPessoa(linha!, 2)).toMatchObject({ providerId: "ACoAAB1234567890abc", empresaChave: "lojax.com.br" });
  });

  it("recusa linha sem identificação ou sem nome, com o número da linha", () => {
    expect(normalizarPessoa({ nome: "Sem URL" }, 7)).toEqual({ linha: 7, motivo: "sem provider_id nem URL do perfil" });
    expect(normalizarPessoa({ url: "https://www.linkedin.com/in/x" }, 8)).toEqual({ linha: 8, motivo: "sem nome" });
  });
});
