import { describe, expect, it } from "vitest";
import {
  classificarErroDaMeta,
  dentroDaJanela,
  estimativaDoCusto,
  idDaVariavel,
  motivoParaPular,
  pedeParaSair,
  preencherTemplate,
  proximaAbertura,
  proximoStatusDoEnvio,
  variaveisDoTemplate,
  type ConteudoDoWhatsapp,
  type ContatoParaDisparo,
  type TemplateDoWhatsapp,
} from "./disparos";

const OFERTA: TemplateDoWhatsapp = {
  id: "1",
  nome: "oferta_outubro",
  idioma: "pt_BR",
  categoria: "MARKETING",
  status: "APPROVED",
  formato: "positional",
  componentes: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Oi {{1}}, a {{2}} tem 20% até sexta. Responda SAIR para não receber mais." },
    { type: "FOOTER", text: "GuessLess" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sair" }, { type: "URL", text: "Ver", url: "https://x.com/o/{{1}}" }] },
  ],
};

const conteudo = (variaveis: ConteudoDoWhatsapp["variaveis"], template = OFERTA): ConteudoDoWhatsapp => ({ tipo: "whatsapp", template, variaveis });
const ANA = { nome: "Ana Souza", primeiroNome: "Ana", empresa: "Acme", cargo: null };

describe("template do WhatsApp (SDR-72, §4.19)", () => {
  it("acha as variáveis do cabeçalho, do corpo e da URL dinâmica", () => {
    expect(variaveisDoTemplate(OFERTA).map(idDaVariavel)).toEqual(["midia", "corpo:1", "corpo:2", "botao:1:1"]);
    const nomeado: TemplateDoWhatsapp = {
      ...OFERTA,
      formato: "named",
      componentes: [
        { type: "HEADER", format: "TEXT", text: "Olá, {{primeiro_nome}}" },
        { type: "BODY", text: "{{primeiro_nome}}, a {{empresa}} foi convidada." },
      ],
    };
    expect(variaveisDoTemplate(nomeado).map(idDaVariavel)).toEqual(["cabecalho:primeiro_nome", "corpo:primeiro_nome", "corpo:empresa"]);
  });

  it("preenche no formato do envio e mostra o texto como chega", () => {
    const preenchido = preencherTemplate(
      conteudo({ midia: { texto: "https://x.com/o.jpg" }, "corpo:1": { campo: "primeiro_nome" }, "corpo:2": { campo: "empresa" }, "botao:1:1": { texto: "out" } }),
      ANA,
    );
    expect(preenchido).toEqual({
      ok: true,
      componentes: [
        { type: "header", parameters: [{ type: "image", image: { link: "https://x.com/o.jpg" } }] },
        { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "Acme" }] },
        { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "out" }] },
      ],
      texto: "Oi Ana, a Acme tem 20% até sexta. Responda SAIR para não receber mais.\n\nGuessLess",
    });
  });

  it("template nomeado leva o nome de cada parâmetro", () => {
    const nomeado: TemplateDoWhatsapp = { ...OFERTA, formato: "named", componentes: [{ type: "BODY", text: "Oi {{primeiro_nome}}" }] };
    const preenchido = preencherTemplate(conteudo({ "corpo:primeiro_nome": { campo: "primeiro_nome" } }, nomeado), ANA);
    expect(preenchido).toMatchObject({ ok: true, componentes: [{ type: "body", parameters: [{ type: "text", text: "Ana", parameter_name: "primeiro_nome" }] }] });
  });

  it("contato sem o campo fica de fora, com o motivo; primeiro nome sai do nome completo", () => {
    const semEmpresa = preencherTemplate(
      conteudo({ midia: { texto: "https://x.com/o.jpg" }, "corpo:1": { campo: "primeiro_nome" }, "corpo:2": { campo: "empresa" }, "botao:1:1": { texto: "x" } }),
      { ...ANA, empresa: null },
    );
    expect(semEmpresa).toEqual({ ok: false, motivo: "Contato sem empresa para {{2}} no texto." });
    const semFonte = preencherTemplate(conteudo({}), ANA);
    expect(semFonte).toEqual({ ok: false, motivo: "Contato sem valor para Link da imagem do cabeçalho." });
    const soNome = preencherTemplate(conteudo({ "corpo:1": { campo: "primeiro_nome" } }, { ...OFERTA, componentes: [{ type: "BODY", text: "Oi {{1}}" }] }), {
      nome: "DR. JOÃO Silva",
      primeiroNome: null,
      empresa: null,
      cargo: null,
    });
    expect(soNome).toMatchObject({ ok: true, texto: "Oi João" });
  });
});

describe("quem recebe (SDR-72, §4.18)", () => {
  const AGORA = new Date("2026-10-16T15:00:00Z");
  const pode: ContatoParaDisparo = {
    naoContatarEm: null,
    telefone: "+5511999998888",
    whatsappAutorizadoEm: AGORA,
    whatsappSaiuEm: null,
    ultimoEnvioNoCanalEm: null,
  };

  it("diz por que fica de fora, na ordem do que pesa mais", () => {
    expect(motivoParaPular("whatsapp", pode, AGORA, 24)).toBeNull();
    expect(motivoParaPular("whatsapp", { ...pode, naoContatarEm: AGORA, telefone: null }, AGORA, 24)).toBe("Pediu para não ser contatado.");
    expect(motivoParaPular("whatsapp", { ...pode, telefone: null }, AGORA, 24)).toBe("Sem telefone.");
    expect(motivoParaPular("whatsapp", { ...pode, whatsappSaiuEm: AGORA }, AGORA, 24)).toBe("Saiu do WhatsApp.");
    expect(motivoParaPular("whatsapp", { ...pode, whatsappAutorizadoEm: null }, AGORA, 24)).toBe("Sem autorização para o WhatsApp.");
  });

  it("não recebe dois disparos pelo mesmo canal em menos de 24 h", () => {
    const ha23h = new Date(AGORA.getTime() - 23 * 3_600_000);
    const ha25h = new Date(AGORA.getTime() - 25 * 3_600_000);
    expect(motivoParaPular("whatsapp", { ...pode, ultimoEnvioNoCanalEm: ha23h }, AGORA, 24)).toBe("Recebeu outro disparo pelo WhatsApp há menos de 24 h.");
    expect(motivoParaPular("whatsapp", { ...pode, ultimoEnvioNoCanalEm: ha25h }, AGORA, 24)).toBeNull();
  });
});

describe("janela de envio (SDR-72, §4.18, D17)", () => {
  const JANELA = { inicio: "08:00", fim: "21:00", fuso: "America/Sao_Paulo" };

  it("das 8h às 21h no horário de Brasília", () => {
    expect(dentroDaJanela(new Date("2026-10-16T11:00:00Z"), JANELA)).toBe(true); // 8h
    expect(dentroDaJanela(new Date("2026-10-16T10:59:00Z"), JANELA)).toBe(false); // 7h59
    expect(dentroDaJanela(new Date("2026-10-17T00:00:00Z"), JANELA)).toBe(false); // 21h
    expect(dentroDaJanela(new Date("2026-10-18T13:00:00Z"), JANELA)).toBe(true); // domingo, 10h
  });

  it("fora da janela, continua às 8h do mesmo dia ou do seguinte", () => {
    expect(proximaAbertura(new Date("2026-10-16T09:30:00Z"), JANELA)).toEqual(new Date("2026-10-16T11:00:00Z"));
    expect(proximaAbertura(new Date("2026-10-17T01:30:00Z"), JANELA)).toEqual(new Date("2026-10-17T11:00:00Z"));
    const dentro = new Date("2026-10-16T15:00:00Z");
    expect(proximaAbertura(dentro, JANELA)).toBe(dentro);
  });
});

describe("erros da Meta e status (SDR-72)", () => {
  it("classifica pelo código da pesquisa", () => {
    expect(classificarErroDaMeta(131026).classe).toBe("contato");
    expect(classificarErroDaMeta("131050").classe).toBe("saiu");
    expect(classificarErroDaMeta(130429).classe).toBe("ritmo");
    expect(classificarErroDaMeta(131049).classe).toBe("esperar");
    expect(classificarErroDaMeta(132015).classe).toBe("template");
    expect(classificarErroDaMeta(190).classe).toBe("conta");
    expect(classificarErroDaMeta(999999)).toEqual({ classe: "ritmo", motivo: "Erro da Meta (999999)." });
  });

  it("o status só anda para a frente; repetido e fora de ordem não voltam; falha só antes de entregue", () => {
    expect(proximoStatusDoEnvio("enviando", "sent")).toBe("enviado");
    expect(proximoStatusDoEnvio("enviado", "read")).toBe("lido");
    expect(proximoStatusDoEnvio("lido", "delivered")).toBeNull();
    expect(proximoStatusDoEnvio("entregue", "delivered")).toBeNull();
    expect(proximoStatusDoEnvio("enviado", "failed")).toBe("falhou");
    expect(proximoStatusDoEnvio("entregue", "failed")).toBeNull();
    expect(proximoStatusDoEnvio("falhou", "read")).toBeNull();
    expect(proximoStatusDoEnvio("enviado", "played")).toBeNull();
  });
});

describe("saída do canal e custo", () => {
  it.each(["SAIR", "  sair!", "Parar", "PARE.", "stop", "Descadastrar", "/sair", "não quero mais receber mensagens"])("%j pede para sair", (texto) => {
    expect(pedeParaSair(texto)).toBe(true);
  });

  it.each(["Quero saber mais", "sair mais cedo hoje?", "Pode parar de mandar boleto atrasado e mandar o novo?"])("%j não pede", (texto) => {
    expect(pedeParaSair(texto)).toBe(false);
  });

  it("estima com o preço da categoria; sem preço, não inventa", () => {
    const tabela = { precos: { marketing: 0.0625, utility: 0.0068 }, moeda: "USD", tabela_em: "2026-10-16" };
    expect(estimativaDoCusto(1000, "MARKETING", tabela)).toEqual({ valor: 62.5, moeda: "USD" });
    expect(estimativaDoCusto(10, "SERVICE", tabela)).toBeNull();
  });
});
