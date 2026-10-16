import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Sdr } from "@/domain/sdr";
import type { Classificacao } from "./modelo";
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
 * código de antes do canal, e cada caso tem de sair igual byte a byte.
 */
const PASTA = new URL("./referencia-do-linkedin/", import.meta.url);

function conferir(nome: string, texto: string) {
  const arquivo = new URL(`${nome}.txt`, PASTA);
  if (process.env.GRAVAR_PROMPTS_DO_LINKEDIN === "1") writeFileSync(arquivo, texto, "utf8");
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

describe("prompts do LinkedIn iguais byte a byte (SDR-75)", () => {
  it.each(CASOS)("%s sem canal", (nome, gerar) => {
    conferir(nome, gerar());
  });
});
