import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import type { Dossie } from "@/domain/dossie";
import type { TextosDoFluxo } from "@/domain/fluxo-gerado";
import { ErroDeStatus, mudarStatusDaCampanha } from "@/server/campanhas/campanhas";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { fluxoDaCampanha } from "@/server/fluxo/fluxos";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import type { EscritorDeFluxo } from "@/server/publicos/escritor";
import { gerarFluxo } from "@/server/publicos/fluxo";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import { criarCampanha, criarOperador, criarPublico, idDaOrganizacaoGuessless, idDoPerfil, type SlugPerfil } from "../support/fixtures";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);
const USO = { entrada: 8_000, saida: 1_500, cacheLeitura: 0, cacheEscrita: 0 };
const PROVA = "Margem 12% maior em 6 meses";

const DOSSIE: Dossie = {
  empresa: { nome: "GuessLess", resumo: "Consultoria de crescimento para e-commerce." },
  produtos: [{ nome: "Diagnóstico de margem", descricao: "Mapa da margem por canal.", para_quem: "e-commerce" }],
  para_quem: "E-commerces de médio porte.",
  diferenciais: [],
  provas: [{ tipo: "numero", texto: PROVA, fonte_url: null }],
  dores: ["Refém do marketplace"],
  objecoes: [],
  tom_de_voz: "Direto.",
  idioma: "pt",
  mercado: { segmentos: [], alternativas: [], gatilhos: [] },
};

const BONS: TextosDoFluxo = {
  convite: "Oi {{first_name}}, acompanho o varejo de moda e queria te ter por aqui.",
  mensagens: [
    "Obrigado por aceitar. Um padrão comum no varejo de moda: a margem some no frete do marketplace.",
    "Na {{company}}, vocês sabem a margem por canal?",
    "Fico por aqui. Se um dia fizer sentido, é só chamar.",
  ],
  motivo: "dor da margem escondida",
};

/** Escritor falso: devolve as respostas na ordem, uma por chamada. */
function escritorFalso(...saidas: TextosDoFluxo[]): EscritorDeFluxo & { chamadas: { sistema: string; entrada: string }[] } {
  const chamadas: { sistema: string; entrada: string }[] = [];
  return {
    chamadas,
    async escrever(p) {
      chamadas.push(p);
      const saida = saidas[Math.min(chamadas.length - 1, saidas.length - 1)]!;
      return { saida, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

async function confirmarDossie(db: Db) {
  await db.query(
    `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em, gerado_em)
     values ($1::uuid, 'https://guessless.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3, $3)`,
    [await idDaOrganizacaoGuessless(db), JSON.stringify(DOSSIE), AGORA],
  );
}

describe("fluxo gerado pelo público (SDR-29)", () => {
  let banco: BancoDeTeste;
  let operador: string;

  async function campanhaDoPublico(perfil: SlugPerfil, praca: "domestico" | "canada" | "espanha" = "domestico") {
    const publicoId = await criarPublico(banco.db, { praca });
    await banco.db.query("update public.publicos set provas = $2::jsonb where id = $1::uuid", [publicoId, JSON.stringify([PROVA])]);
    const criada = await comOperador(banco.db, operador, async (tx) =>
      comecarAAbordar(tx, { publicoId, perfilId: await idDoPerfil(tx, perfil), operadorId: operador, agora: AGORA }),
    );
    return (criada as { campanhaId: string }).campanhaId;
  }

  const gerar = (campanhaId: string, escritor: EscritorDeFluxo, estilo: "casa" | "pergunta" = "casa") =>
    gerarFluxo({ db: banco.db, escritor, agora: () => AGORA }, { campanhaId, operadorId: operador, estilo });

  const textos = async (campanhaId: string) => {
    const fluxo = await fluxoDaCampanha(banco.db, campanhaId);
    return Object.fromEntries(
      fluxo!.nodes.flatMap((n) =>
        n.tipo === "convite" || n.tipo === "mensagem" ? [[n.id, n.template]] : n.tipo === "tarefa" ? [[n.id, `tarefa: ${n.roteiro}`]] : [],
      ),
    );
  };

  const ativar = (campanhaId: string) =>
    mudarStatusDaCampanha(banco.db, { campanhaId, status: "ativa", operadorId: operador, agora: AGORA });

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    await confirmarDossie(banco.db);
  });

  it("escreve os quatro textos para o público, passa no validador e a campanha pode ativar", async () => {
    const campanhaId = await campanhaDoPublico("arthur");
    const escritor = escritorFalso(BONS);

    expect(await gerar(campanhaId, escritor)).toEqual({ ok: true, problemas: [] });

    expect(await textos(campanhaId)).toEqual({ T1: BONS.convite, T2: BONS.mensagens[0], T3: BONS.mensagens[1], T4: BONS.mensagens[2] });
    // O prompt leva o público, a prova dele e a régua da casa.
    expect(escritor.chamadas[0]!.sistema).toContain("A margem que o marketplace esconde");
    expect(escritor.chamadas[0]!.sistema).toContain(`"${PROVA}"`);
    expect(escritor.chamadas[0]!.sistema).toContain("Não pergunta nada.");
    await ativar(campanhaId);
    const [campanha] = await banco.db.query<{ status: string }>("select status from public.campanhas where id = $1::uuid", [campanhaId]);
    expect(campanha!.status).toBe("ativa");
  });

  it("texto barrado ganha uma reescrita; se continuar barrado, chega marcado e a campanha não ativa", async () => {
    const campanhaId = await campanhaDoPublico("arthur");
    const ruim = { ...BONS, mensagens: ["Somos uma agência — e ajudamos lojas.", ...BONS.mensagens.slice(1)] };
    const escritor = escritorFalso(ruim, ruim);

    const resultado = await gerar(campanhaId, escritor);

    expect(resultado).toMatchObject({ ok: true });
    const problemas = (resultado as { problemas: { toque: string }[] }).problemas;
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas.every((p) => p.toque === "T2")).toBe(true);
    expect(escritor.chamadas).toHaveLength(2);
    expect(escritor.chamadas[1]!.entrada).toContain("Sua versão anterior foi barrada");
    expect(escritor.chamadas[1]!.entrada).toContain("Somos uma agência");
    expect((await textos(campanhaId)).T2).toBe(ruim.mensagens[0]);
    await expect(ativar(campanhaId)).rejects.toBeInstanceOf(ErroDeStatus);
  });

  it("a reescrita que corrige chega limpa", async () => {
    const campanhaId = await campanhaDoPublico("arthur");
    const escritor = escritorFalso({ ...BONS, mensagens: ["Fazemos marketing — muito bom.", ...BONS.mensagens.slice(1)] }, BONS);
    expect(await gerar(campanhaId, escritor)).toEqual({ ok: true, problemas: [] });
    expect((await textos(campanhaId)).T2).toBe(BONS.mensagens[0]);
  });

  it("nenhuma prova fora do dossiê: número inventado barra a ativação", async () => {
    const campanhaId = await campanhaDoPublico("arthur");
    const inventado = { ...BONS, mensagens: ["Um cliente cresceu 40% em 30 dias.", ...BONS.mensagens.slice(1)] };

    const resultado = await gerar(campanhaId, escritorFalso(inventado, inventado));

    expect(resultado).toMatchObject({ ok: true, problemas: [{ toque: "T2", mensagem: "Cita 40%, 30, que não está nas provas do público." }] });
    await expect(ativar(campanhaId)).rejects.toThrow("T2: Cita 40%, 30, que não está nas provas do público.");
  });

  it("no Canadá, toda mensagem termina com a saída", async () => {
    const campanhaId = await campanhaDoPublico("luiz", "canada");
    const saida = "or tell me to stop and I will";
    const ingles = {
      convite: "Hi {{first_name}}, I follow fashion retail and would like to connect.",
      mensagens: ["Thanks for connecting. Margins often vanish in marketplace fees.", "Does {{company}} track margin per channel?", "I will leave it here."],
      motivo: "margin",
    };
    const comSaida = { ...ingles, mensagens: ingles.mensagens.map((m) => `${m} ${saida}`) };
    const escritor = escritorFalso(ingles, comSaida);

    expect(await gerar(campanhaId, escritor)).toEqual({ ok: true, problemas: [] });
    expect(escritor.chamadas[0]!.sistema).toContain(`termina exatamente com a frase de saída: "${saida}"`);
    const t = await textos(campanhaId);
    for (const toque of ["T2", "T3", "T4"]) expect(t[toque]).toMatch(new RegExp(`${saida}$`));
  });

  it("na Espanha, nenhuma mensagem automática: as três viram tarefa manual com roteiro", async () => {
    const campanhaId = await campanhaDoPublico("jp", "espanha");
    const espanhol = {
      convite: "Hola {{first_name}}, sigo el comercio de moda y me gustaría conectar.",
      mensagens: ["Gracias por aceptar.", "¿En {{company}} miden el margen por canal?", "Lo dejo aquí."],
      motivo: "margen",
    };

    expect(await gerar(campanhaId, escritorFalso(espanhol))).toEqual({ ok: true, problemas: [] });

    const fluxo = await fluxoDaCampanha(banco.db, campanhaId);
    expect(fluxo!.nodes.some((n) => n.tipo === "mensagem")).toBe(false);
    expect((await textos(campanhaId)).T2).toBe("tarefa: Gracias por aceptar.");
  });

  it("a variante do prompt de referência pede pergunta já na primeira mensagem", async () => {
    const campanhaId = await campanhaDoPublico("arthur");
    const escritor = escritorFalso(BONS);
    await gerar(campanhaId, escritor, "pergunta");
    expect(escritor.chamadas[0]!.sistema).toContain("uma pergunta curta e direta que faz a pessoa parar para pensar");
  });

  it("sem dossiê confirmado ou em campanha criada à mão, não gera", async () => {
    const manual = await criarCampanha(banco.db, { perfil: "arthur" });
    expect(await gerar(manual, escritorFalso(BONS))).toEqual({ ok: false, erro: "Só campanha de público tem fluxo gerado." });

    const campanhaId = await campanhaDoPublico("arthur");
    await banco.db.query("update public.ofertas set dossie_confirmado = null");
    expect(await gerar(campanhaId, escritorFalso(BONS))).toEqual({ ok: false, erro: "Confirme o dossiê da oferta antes: as mensagens saem dele." });
  });
});
