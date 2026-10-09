import { describe, expect, it } from "vitest";
import {
  condicaoDoConvite,
  fluxo as esquemaDoFluxo,
  fluxoPadrao,
  proximoNode,
  sequenciaParaFluxo,
  validarCopyDoFluxo,
  validarFluxo,
  type Fluxo,
} from "./fluxo";

const PERFIL = { praca: "domestico" as const, palavrasProibidas: ["agência"], rodapeObrigatorio: null, limiteNotaConvite: 300 };
const EXEMPLO = { first_name: "Guilhermina", company: "Distribuidora Nordeste Alimentos" };

/** Convite; aceitou → espera 1 → A → espera 3 → B → fim; não aceitou → fim. */
function fluxoComDesvio(): Fluxo {
  return {
    versao: 1,
    nodes: [
      { id: "inicio", tipo: "inicio" },
      { id: "convite", tipo: "convite", template: "Oi {{first_name}}" },
      { id: "aceitou", tipo: "condicao", condicao: "aceitou", prazo_dias_uteis: 10 },
      { id: "e1", tipo: "esperar", dias_uteis: 1 },
      { id: "a", tipo: "mensagem", template: "Obrigado, {{first_name}}." },
      { id: "e2", tipo: "esperar", dias_uteis: 3 },
      { id: "b", tipo: "mensagem", template: "Como a {{company}} mede isso?" },
      { id: "fim", tipo: "fim", resultado: "sem_resposta" },
      { id: "fim-nao", tipo: "fim", resultado: "pausa_60" },
    ],
    arestas: [
      { de: "inicio", para: "convite" },
      { de: "convite", para: "aceitou" },
      { de: "aceitou", para: "e1", saida: "sim" },
      { de: "aceitou", para: "fim-nao", saida: "nao" },
      { de: "e1", para: "a" },
      { de: "a", para: "e2" },
      { de: "e2", para: "b" },
      { de: "b", para: "fim" },
    ],
  };
}

const mensagens = (f: Fluxo) => validarFluxo(f).map((p) => p.mensagem);

describe("fluxo da campanha (§4.1, SDR-21)", () => {
  it("o fluxo padrão é válido e tem os 4 toques com os ids T1 a T4", () => {
    const f = fluxoPadrao("domestico");
    for (const node of f.nodes) if (node.tipo === "mensagem") node.template = "Texto";
    expect(validarFluxo(f)).toEqual([]);
    expect(f.nodes.filter((n) => n.tipo === "convite" || n.tipo === "mensagem").map((n) => n.id)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(esquemaDoFluxo.safeParse(f).success).toBe(true);
  });

  it("a sequência antiga vira o fluxo equivalente: aceite, esperas e o fim da praça", () => {
    const f = sequenciaParaFluxo(
      [
        { toque: "T1", tipo: "convite", offset_dias_uteis: 0, ancora: "inicio", template: "Oi" },
        { toque: "T2", tipo: "dm", offset_dias_uteis: 2, ancora: "aceite", template: "Obrigado" },
        { toque: "T3", tipo: "dm", offset_dias_uteis: 4, ancora: "anterior", template: "Pergunta?" },
      ],
      "pausa_60_novo_angulo",
    );
    expect(validarFluxo(f)).toEqual([]);
    expect(condicaoDoConvite(f, "T1")).toMatchObject({ condicao: "aceitou" });
    expect(proximoNode(f, "aceite", "sim")).toMatchObject({ tipo: "esperar", dias_uteis: 2 });
    expect(proximoNode(f, "T2")).toMatchObject({ tipo: "esperar", dias_uteis: 4 });
    expect(proximoNode(f, "T3")).toMatchObject({ tipo: "fim", resultado: "pausa_60" });
  });

  it("aceita um fluxo com desvio por aceite e mensagens com ids livres", () => {
    expect(validarFluxo(fluxoComDesvio())).toEqual([]);
  });

  it("recusa mensagem para quem não é conexão", () => {
    const f = fluxoComDesvio();
    f.arestas = f.arestas.map((a) => (a.de === "aceitou" && a.saida === "nao" ? { ...a, para: "e1" } : a.de === "aceitou" ? { ...a, para: "fim-nao" } : a));
    expect(mensagens(f).some((m) => m.includes("DM só vai para conexão de 1º grau"))).toBe(true);
  });

  it("recusa ciclo, bloco solto, bloco sem saída e condição sem as duas saídas", () => {
    const ciclo = fluxoComDesvio();
    ciclo.arestas = ciclo.arestas.map((a) => (a.de === "b" ? { ...a, para: "e1" } : a));
    expect(mensagens(ciclo).some((m) => m.includes("Ciclos não são permitidos"))).toBe(true);

    const solto = fluxoComDesvio();
    solto.nodes.push({ id: "x", tipo: "mensagem", template: "Solta" });
    expect(mensagens(solto)).toContain("Mensagem solto: nenhuma seta chega nele.");

    const semSaida = fluxoComDesvio();
    semSaida.arestas = semSaida.arestas.filter((a) => a.de !== "b");
    expect(mensagens(semSaida)).toContain("Mensagem sem seta de saída: ligue ao próximo bloco ou a um Fim.");

    const meiaCondicao = fluxoComDesvio();
    meiaCondicao.arestas = meiaCondicao.arestas.filter((a) => !(a.de === "aceitou" && a.saida === "nao"));
    expect(mensagens(meiaCondicao)).toContain('A condição precisa de uma saída "sim" e uma "não".');
  });

  it("convite precisa ser seguido de \"Aceitou o convite?\"", () => {
    const f = fluxoComDesvio();
    f.nodes.push({ id: "e0", tipo: "esperar", dias_uteis: 1 });
    f.arestas = f.arestas.map((a) => (a.de === "convite" ? { ...a, para: "e0" } : a));
    f.arestas.push({ de: "e0", para: "aceitou" });
    expect(mensagens(f)).toContain('Depois de um convite vem a condição "Aceitou o convite?".');
  });

  it("\"Já é conexão?\" permite mensagem direta no sim e convite no não", () => {
    const f: Fluxo = {
      versao: 1,
      nodes: [
        { id: "inicio", tipo: "inicio" },
        { id: "conectado", tipo: "condicao", condicao: "conectado" },
        { id: "dm", tipo: "mensagem", template: "Oi de novo" },
        { id: "convite", tipo: "convite", template: "" },
        { id: "aceitou", tipo: "condicao", condicao: "aceitou" },
        { id: "fim", tipo: "fim", resultado: "sem_resposta" },
        { id: "fim2", tipo: "fim", resultado: "sem_resposta" },
        { id: "fim3", tipo: "fim", resultado: "sem_resposta" },
      ],
      arestas: [
        { de: "inicio", para: "conectado" },
        { de: "conectado", para: "dm", saida: "sim" },
        { de: "conectado", para: "convite", saida: "nao" },
        { de: "dm", para: "fim" },
        { de: "convite", para: "aceitou" },
        { de: "aceitou", para: "fim2", saida: "sim" },
        { de: "aceitou", para: "fim3", saida: "nao" },
      ],
    };
    expect(validarFluxo(f)).toEqual([]);
  });

  it("a copy de cada convite e mensagem passa pelo validador com o exemplo longo", () => {
    const f = fluxoComDesvio();
    const b = f.nodes.find((n) => n.id === "b")!;
    if (b.tipo === "mensagem") b.template = "Somos uma agência — fala comigo";
    const problemas = validarCopyDoFluxo(f, PERFIL, EXEMPLO);
    expect(problemas.find((p) => p.toque === "a")).toEqual({ toque: "a", previa: "Obrigado, Guilhermina.", violacoes: [] });
    expect(problemas.find((p) => p.toque === "b")!.violacoes.map((v) => v.regra).sort()).toEqual(["palavra_proibida", "travessao"]);
  });
});
