import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Sdr } from "@/domain/sdr";
import { abrirConversa, decidirResposta, type Consumo, type EntradaDoAgente } from "./decidir";
import type { Classificacao, Decisao, ModeloDeLinguagem, Uso } from "./modelo";
import {
  entradaDaAbertura,
  entradaDaClassificacao,
  entradaDoRascunho,
  promptDeClassificacao,
  promptDeRascunho,
  type LeadDoAgente,
  type MensagemDoHistorico,
  type PerfilDoAgente,
} from "./prompts";

/**
 * O prompt do LinkedIn não muda (SDR-75 (#64)): o texto que o agente do
 * LinkedIn manda ao Claude foi gravado em `referencia-do-linkedin/` com o
 * código de antes do canal, e cada caso tem de sair igual byte a byte. Os
 * arquivos não mudam: este teste só lê.
 */
const PASTA = new URL("./referencia-do-linkedin/", import.meta.url);

function conferir(nome: string, texto: string) {
  const arquivo = new URL(`${nome}.txt`, PASTA);
  expect(texto).toBe(readFileSync(arquivo, "utf8"));
}

const PERFIL: PerfilDoAgente = {
  nome: "Arthur",
  praca: "domestico",
  idioma: "pt",
  voz: null,
  regras: "Não falo de preço por mensagem.",
  palavrasProibidas: ["barato", "grátis"],
};

const LINK_DE_AGENDA = "https://cal.com/arthur/20min";

const SDR: Sdr = {
  objetivo: "marcar 20 minutos com a Duda para mostrar o atacado",
  voz: "Leve e próxima, trata por você.",
  abertura: "Uma observação sobre estoque parado em multimarca, sem pedir nada.",
  qualificacao: ["Tem loja multimarca de moda feminina"],
  objecoes: [{ objecao: "Já tenho fornecedor", resposta: "Lote mínimo menor e peça que não está em toda loja." }],
  regras: ["Não falo de preço por mensagem"],
  quando_chamar_voce: ["Pedido de tabela de atacado"],
  link_agenda: LINK_DE_AGENDA,
};

const LEAD: LeadDoAgente = {
  nome: "Marina Souza",
  cargo: "Gerente de AGC",
  empresa: "ADMINISTRADORA X",
  localizacao: "São Paulo, Brasil",
  campanha: "Administradoras",
  angulo: "assembleia montada no braço",
  nicho: "condomínios",
  pesquisa: { posts: ["AGC digital em 2026"] },
};

const MENSAGENS: MensagemDoHistorico[] = [
  {
    direcao: "saida",
    autor: "Arthur",
    texto: "Oi Marina, tudo bem? Hoje vocês montam a assembleia em ferramenta própria ou no braço?",
    em: new Date("2026-10-01T13:00:00.000Z"),
  },
  {
    direcao: "entrada",
    autor: "Marina Souza",
    texto: "Oi Arthur! No braço ainda, com planilha. Como funciona o de vocês?",
    em: new Date("2026-10-01T14:30:00.000Z"),
  },
];

const CLASSIFICACAO: Classificacao = {
  categoria: "pergunta",
  confianca: 0.87,
  sinais: { preco: false, reclamacao: false, idioma: "pt" },
};

const CASOS: Array<[nome: string, gerar: () => string]> = [
  ["classificacao", () => promptDeClassificacao()],
  [
    "rascunho-sem-sdr",
    () =>
      promptDeRascunho({
        perfil: PERFIL,
        linkDeAgenda: null,
        responsavelDiscovery: "Arthur",
        oferta: "Diagnóstico de margem para e-commerce.",
      }),
  ],
  [
    "rascunho-com-sdr",
    () =>
      promptDeRascunho({
        perfil: PERFIL,
        linkDeAgenda: LINK_DE_AGENDA,
        responsavelDiscovery: "Arthur",
        oferta: "Diagnóstico de margem para e-commerce.",
        sdr: SDR,
      }),
  ],
  ["entrada-da-classificacao", () => entradaDaClassificacao(MENSAGENS, PERFIL.nome)],
  [
    "entrada-do-rascunho",
    () =>
      entradaDoRascunho({
        lead: LEAD,
        mensagens: MENSAGENS,
        nomeDoPerfil: PERFIL.nome,
        classificacao: CLASSIFICACAO,
        instrucoesDaCampanha: "Fale de frete.",
      }),
  ],
  ["entrada-da-abertura", () => entradaDaAbertura({ lead: LEAD })],
];

const CASOS_COM_CANAL: Array<[nome: string, gerar: () => string]> = [
  ["classificacao", () => promptDeClassificacao("linkedin")],
  [
    "rascunho-sem-sdr",
    () =>
      promptDeRascunho({
        perfil: PERFIL,
        linkDeAgenda: null,
        responsavelDiscovery: "Arthur",
        oferta: "Diagnóstico de margem para e-commerce.",
        canal: "linkedin",
      }),
  ],
  [
    "rascunho-com-sdr",
    () =>
      promptDeRascunho({
        perfil: PERFIL,
        linkDeAgenda: LINK_DE_AGENDA,
        responsavelDiscovery: "Arthur",
        oferta: "Diagnóstico de margem para e-commerce.",
        sdr: SDR,
        canal: "linkedin",
      }),
  ],
];

describe("prompts do LinkedIn iguais byte a byte (SDR-75)", () => {
  it.each(CASOS)("%s sem canal", (nome, gerar) => {
    conferir(nome, gerar());
  });

  it.each(CASOS_COM_CANAL)("%s com canal: linkedin", (nome, gerar) => {
    conferir(nome, gerar());
  });
});

const USO: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
const DECISAO: Decisao = {
  acao: "responder",
  mensagem: "Hoje a gente monta a pauta e a votação num lugar só. Quantas assembleias vocês fazem por mês?",
  motivo: "pergunta objetiva",
  estagio_sugerido: "03",
  confianca: 0.9,
};

/** Um modelo que guarda o que recebeu: é o texto que o Claude leria. */
function modeloQueGuarda() {
  const chamadas: { etapa: "classificar" | "rascunhar"; sistema: string; entrada: string }[] = [];
  const modelo: ModeloDeLinguagem = {
    async classificar(p) {
      chamadas.push({ etapa: "classificar", ...p });
      return { saida: CLASSIFICACAO, uso: USO, modelo: "guarda" };
    },
    async rascunhar(p) {
      chamadas.push({ etapa: "rascunhar", ...p });
      return { saida: DECISAO, uso: USO, modelo: "guarda" };
    },
    async escreverConvite() {
      throw new Error("o agente de conversa não escreve convite");
    },
  };
  return { modelo, chamadas };
}

const entradaDoAgente = (extra: Partial<EntradaDoAgente>): EntradaDoAgente => ({
  perfil: { ...PERFIL, palavrasProibidas: [...PERFIL.palavrasProibidas], limiteNotaConvite: 300 },
  linkDeAgenda: LINK_DE_AGENDA,
  responsavelDiscovery: "Arthur",
  oferta: "Diagnóstico de margem para e-commerce.",
  sdr: { versao: 1, sdr: SDR },
  lead: LEAD,
  mensagens: MENSAGENS,
  ...extra,
});

describe("o agente do LinkedIn manda ao modelo o texto gravado (SDR-75)", () => {
  // Sem canal é o agente em produção (`agente.ts`); com `linkedin`, o chat de
  // teste. No LinkedIn, links e lançamento são ignorados.
  const VARIANTES: Array<[rotulo: string, extra: Partial<EntradaDoAgente>]> = [
    ["sem canal", {}],
    ["com canal: linkedin", { canal: "linkedin", linksPermitidos: ["https://pay.hotmart.com/X1"], contextoDoLancamento: "Fase: carrinho" }],
  ];

  it.each(VARIANTES)("decidirResposta %s", async (_rotulo, extra) => {
    const { modelo, chamadas } = modeloQueGuarda();
    const consumo: Consumo = { modelos: {}, uso: {} };
    await decidirResposta({
      entrada: entradaDoAgente({ ...extra, instrucoesDaCampanha: "Fale de frete." }),
      modelo,
      configuracao: { limiar_optout: 0.8, limiar_confianca: 0.7, atraso_minutos: [0, 0] },
      consumo,
    });

    const [classificar, rascunhar] = chamadas;
    expect(chamadas.map((c) => c.etapa)).toEqual(["classificar", "rascunhar"]);
    conferir("classificacao", classificar!.sistema);
    conferir("entrada-da-classificacao", classificar!.entrada);
    conferir("rascunho-com-sdr", rascunhar!.sistema);
    conferir("entrada-do-rascunho", rascunhar!.entrada);
  });

  it.each(VARIANTES)("abrirConversa %s", async (_rotulo, extra) => {
    const { modelo, chamadas } = modeloQueGuarda();
    await abrirConversa({ entrada: entradaDoAgente(extra), modelo, consumo: { modelos: {}, uso: {} } });

    expect(chamadas).toHaveLength(1);
    conferir("rascunho-com-sdr", chamadas[0]!.sistema);
    conferir("entrada-da-abertura", chamadas[0]!.entrada);
  });
});
