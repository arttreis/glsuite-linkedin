import { describe, expect, it } from "vitest";
import type { Sdr } from "@/domain/sdr";
import { abrirConversa, decidirResposta, type Consumo, type EntradaDoAgente } from "@/server/agente/decidir";
import { promptDeRascunho } from "@/server/agente/prompts";
import { ModeloFalso } from "../support/modelo-falso";

const CONFIGURACAO = { limiar_optout: 0.8, limiar_confianca: 0.7, atraso_minutos: [0, 0] as [number, number] };

const SDR: Sdr = {
  objetivo: "marcar 20 minutos com a Duda",
  voz: "Leve e próxima.",
  abertura: "Observação sobre estoque parado.",
  qualificacao: [],
  objecoes: [],
  regras: [],
  quando_chamar_voce: [],
  link_agenda: "https://cal.com/duda/20min",
};

const entrada = (extra: Partial<EntradaDoAgente> = {}): EntradaDoAgente => ({
  perfil: { nome: "Duda", praca: "domestico", idioma: "pt", voz: null, regras: null, palavrasProibidas: [], limiteNotaConvite: 300 },
  linkDeAgenda: SDR.link_agenda,
  responsavelDiscovery: "Duda",
  oferta: "Atacado de moda para multimarca.",
  sdr: { versao: 3, sdr: SDR },
  lead: { nome: "Marina", cargo: null, empresa: null, localizacao: null, campanha: "Lançamento", angulo: null, nicho: null, pesquisa: null },
  mensagens: [{ direcao: "entrada", autor: "prospect", texto: "Oi, vi o post de vocês", em: new Date("2026-10-16T12:00:00Z") }],
  ...extra,
});

async function decidir(e: EntradaDoAgente, modelo = new ModeloFalso()) {
  const consumo: Consumo = { modelos: {}, uso: {} };
  const desfecho = await decidirResposta({ entrada: e, modelo, configuracao: CONFIGURACAO, consumo });
  const sistema = (etapa: "classificar" | "rascunhar") => modelo.chamadas.find((c) => c.etapa === etapa)?.sistema;
  return { desfecho, modelo, sistema };
}

const comLink = (link: string) => ({
  acao: "responder" as const,
  mensagem: `A inscrição é por aqui: ${link}`,
  motivo: "pediu o link",
  estagio_sugerido: "03" as const,
  confianca: 0.9,
});

describe("o SDR em cada canal (SDR-75)", () => {
  it("no LinkedIn, sem canal e com canal: linkedin mandam o mesmo prompt de sistema", async () => {
    const sem = await decidir(entrada());
    const com = await decidir(entrada({ canal: "linkedin" }));
    expect(com.sistema("classificar")).toBe(sem.sistema("classificar"));
    expect(com.sistema("rascunhar")).toBe(sem.sistema("rascunhar"));
  });

  it("o prompt de sistema é estável por canal e versão do SDR, qualquer que seja a conversa", async () => {
    const uma = await decidir(entrada({ canal: "instagram", linksPermitidos: ["https://pay.hotmart.com/X1"], contextoDoLancamento: "Fase: captação" }));
    const outra = await decidir(
      entrada({
        canal: "instagram",
        lead: { nome: "Paula", cargo: "Dona", empresa: "Boutique P", localizacao: "Recife", campanha: "Outra", angulo: null, nicho: "festa", pesquisa: null },
        mensagens: [{ direcao: "entrada", autor: "prospect", texto: "Quero saber do curso", em: new Date("2026-10-15T09:00:00Z") }],
        linksPermitidos: ["https://pay.hotmart.com/Y2", "https://chat.whatsapp.com/abc"],
        contextoDoLancamento: "Fase: carrinho",
      }),
    );
    expect(outra.sistema("classificar")).toBe(uma.sistema("classificar"));
    expect(outra.sistema("rascunhar")).toBe(uma.sistema("rascunhar"));

    const telegram = await decidir(entrada({ canal: "telegram" }));
    expect(telegram.sistema("classificar")).not.toBe(uma.sistema("classificar"));
    expect(telegram.sistema("rascunhar")).not.toBe(uma.sistema("rascunhar"));
  });

  it("fora do LinkedIn, links e lançamento vão só na mensagem do usuário", async () => {
    const { modelo, sistema } = await decidir(
      entrada({ canal: "instagram", linksPermitidos: ["https://pay.hotmart.com/X1"], contextoDoLancamento: "Fase: carrinho" }),
    );
    const rascunho = modelo.chamadas.find((c) => c.etapa === "rascunhar")!;
    expect(rascunho.entrada).toContain("- https://pay.hotmart.com/X1");
    expect(rascunho.entrada).toContain("Fase: carrinho");
    expect(sistema("rascunhar")).not.toContain("pay.hotmart.com");
    expect(sistema("rascunhar")).toBe(
      promptDeRascunho({ perfil: entrada().perfil, linkDeAgenda: SDR.link_agenda, responsavelDiscovery: "Duda", oferta: entrada().oferta, sdr: SDR, canal: "instagram" }),
    );
  });

  it("no Instagram, link da lista passa e link de fora vira resposta para aprovar", async () => {
    const lista = { canal: "instagram" as const, linksPermitidos: ["https://pay.hotmart.com/X1"] };

    const daLista = new ModeloFalso();
    daLista.decisoes.push(comLink("https://pay.hotmart.com/X1"));
    expect((await decidir(entrada(lista), daLista)).desfecho).toMatchObject({ tipo: "rascunho", excecao: null });

    const deFora = new ModeloFalso();
    deFora.decisoes.push(comLink("https://outro.com"));
    const { desfecho } = await decidir(entrada(lista), deFora);
    expect(desfecho).toMatchObject({ tipo: "rascunho", excecao: expect.stringMatching(/^validador: /) });
  });

  it("no LinkedIn, a lista é ignorada: só o link de agenda passa", async () => {
    const modelo = new ModeloFalso();
    modelo.decisoes.push(comLink("https://outro.com"));
    const { desfecho } = await decidir(entrada({ canal: "linkedin", linksPermitidos: ["https://outro.com"] }), modelo);
    expect(desfecho).toMatchObject({ tipo: "rascunho", excecao: expect.stringContaining("só pode mandar o link de agenda configurado") });
  });

  it("fora do LinkedIn, sem o SDR da organização, não decide nem chama o modelo", async () => {
    const modelo = new ModeloFalso();
    await expect(decidir(entrada({ canal: "instagram", sdr: null }), modelo)).rejects.toThrow(
      "Fora do LinkedIn, o SDR precisa do SDR da organização (§4.26).",
    );
    expect(modelo.chamadas).toEqual([]);
  });

  it("fora do LinkedIn, o SDR nunca abre a conversa", async () => {
    const modelo = new ModeloFalso();
    await expect(abrirConversa({ entrada: entrada({ canal: "telegram" }), modelo, consumo: { modelos: {}, uso: {} } })).rejects.toThrow(
      "Fora do LinkedIn, o SDR nunca abre a conversa (§4.3).",
    );
    expect(modelo.chamadas).toEqual([]);
  });
});
