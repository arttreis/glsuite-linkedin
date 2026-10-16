import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resumoDaOferta, type Dossie } from "@/domain/dossie";
import { sdrDaIa, textoDoSdr, type CanalDoSdr, type Sdr, type SdrDaIa } from "@/domain/sdr";
import type { AjusteDoSdr } from "@/domain/teste-do-sdr";
import { estadoDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { ErroDoModelo } from "@/server/agente/modelo";
import { promptDeRascunho } from "@/server/agente/prompts";
import { comOperador } from "@/server/db/operador";
import { gravarVersaoDoSdr, obterSdr } from "@/server/sdr/sdr";
import {
  ajustarNoTeste,
  aprovarSdr,
  comecarTeste,
  desfazerAjuste,
  obterTeste,
  responderComoLead,
  type AjustadorDeSdr,
  type TesteDoSdr,
} from "@/server/sdr/teste";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao } from "../support/fixtures";
import { ModeloFalso } from "../support/modelo-falso";

const AGORA = new Date("2026-10-10T17:00:00Z");
const USO = { entrada: 2_000, saida: 500, cacheLeitura: 0, cacheEscrita: 0 };

const ANALISE: Dossie = {
  empresa: { nome: "Loja da Duda", resumo: "Moda feminina online." },
  produtos: [{ nome: "Atacado", descricao: "Venda em lote para multimarca.", para_quem: "lojas multimarca" }],
  para_quem: "Lojas multimarca de moda feminina.",
  diferenciais: [],
  provas: [],
  dores: ["Estoque parado"],
  objecoes: [],
  tom_de_voz: "Leve.",
  idioma: "pt",
  mercado: {
    segmentos: [
      { nome: "Multimarcas de moda", por_que: "Precisam de peça diferente" },
      { nome: "Boutiques de festa", por_que: "Vendem por ocasião" },
    ],
    alternativas: [],
    gatilhos: [],
  },
};

const SDR: Sdr = {
  objetivo: "marcar 20 minutos com a Duda",
  voz: "Leve e próxima.",
  abertura: "Observação sobre estoque parado.",
  qualificacao: [],
  objecoes: [],
  regras: [],
  quando_chamar_voce: ["Pedido de tabela de atacado"],
  link_agenda: "https://cal.com/duda/20min",
  cautela: "cauteloso",
};

// O esquema da IA não tem o link nem a cautela: o parse tira.
const semLink = (sdr: Sdr): SdrDaIa => sdrDaIa.parse(sdr);

function ajustadorFalso(saidas: AjusteDoSdr[]): AjustadorDeSdr & { chamadas: { sistema: string; entrada: string }[] } {
  const chamadas: { sistema: string; entrada: string }[] = [];
  return {
    chamadas,
    async ajustar(p) {
      chamadas.push(p);
      return { saida: saidas.shift()!, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

describe("chat de teste do SDR (SDR-43)", () => {
  let banco: BancoDeTeste;
  let modelo: ModeloFalso;
  let organizacao: string;
  let duda: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    modelo = new ModeloFalso();
    organizacao = await criarOrganizacao(banco.db, { nome: "Loja da Duda" });
    duda = await criarOperador(banco.db, { nome: "Duda", papel: "admin", organizacaoId: organizacao });
    await banco.db.query(
      `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
       values ($1::uuid, 'https://duda.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3)`,
      [organizacao, JSON.stringify(ANALISE), AGORA],
    );
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr: SDR, origem: "ia", por: null, agora: AGORA });
  });

  const deps = () => ({ db: banco.db, modelo, agora: AGORA });
  const base = () => ({ organizacaoId: organizacao, nome: "Duda" });
  const comecar = async (segmento?: string, canal?: CanalDoSdr) => {
    const resultado = await comecarTeste(deps(), { ...base(), segmento, canal });
    if (!resultado.ok) throw new Error(resultado.erro);
    return resultado.teste;
  };
  const responder = async (texto: string): Promise<TesteDoSdr> => {
    const resultado = await responderComoLead(deps(), { ...base(), texto });
    if (!resultado.ok) throw new Error(resultado.erro);
    return resultado.teste;
  };
  const ajustar = (ajustador: AjustadorDeSdr, pedido: string, referenciaId: string | null = null) =>
    ajustarNoTeste({ ...deps(), ajustador }, { ...base(), pedido, referenciaId, operadorId: duda });
  const rascunhos = () => modelo.chamadas.filter((c) => c.etapa === "rascunhar");

  it("o SDR abre como depois de um convite aceito, com o prompt de sistema da produção", async () => {
    const teste = await comecar();

    expect(teste).toMatchObject({ segmento: "Multimarcas de moda", lead: "Marina", sdrVersao: 1, podeDesfazer: false });
    expect(teste.segmentos).toEqual(["Multimarcas de moda", "Boutiques de festa"]);
    expect(teste.mensagens).toEqual([expect.objectContaining({ tipo: "sdr", texto: modelo.decisaoPadrao.mensagem, aviso: null })]);
    const [abertura] = rascunhos();
    expect(abertura!.entrada).toContain("acabou de aceitar o seu convite de conexão");
    expect(abertura!.sistema).toContain(textoDoSdr(SDR, "Duda"));
    expect(abertura!.sistema).toContain("Regras da casa (valem sempre, acima do SDR");
    expect(abertura!.sistema).toContain("Loja da Duda: Moda feminina online.");
  });

  it("cada mensagem do lead passa pela decisão da produção: classifica e rascunha com o mesmo prompt", async () => {
    await comecar();
    const teste = await responder("Oi! Me conta mais?");

    expect(modelo.chamadas.map((c) => c.etapa)).toEqual(["rascunhar", "classificar", "rascunhar"]);
    const [abertura, resposta] = rascunhos();
    expect(resposta!.sistema).toBe(abertura!.sistema);
    expect(resposta!.entrada).toContain("Prospect: Oi! Me conta mais?");
    expect(teste.mensagens.map((m) => m.tipo)).toEqual(["sdr", "lead", "sdr"]);
    expect(await obterTeste(banco.db, base())).toEqual(teste);
  });

  it("o que não é resposta comum vira nota: chamar a pessoa (também por preço) e opt-out", async () => {
    await comecar();
    modelo.decisoes.push({ acao: "escalar_humano", mensagem: null, motivo: "pediu tabela de atacado", estagio_sugerido: null, confianca: 0.9 });
    let teste = await responder("Me manda a tabela de atacado?");
    expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "nota", nota: "desfecho", texto: "Aqui o SDR pararia e chamaria Duda: pediu tabela de atacado." });

    modelo.classificacoes.push({ categoria: "pergunta", confianca: 0.9, sinais: { preco: true, reclamacao: false, idioma: "pt" } });
    teste = await responder("Quanto custa?");
    expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "nota", nota: "desfecho", texto: "Aqui o SDR pararia e chamaria Duda: pergunta de preço." });

    const chamadasAntes = modelo.chamadas.length;
    teste = await responder("Pare de me mandar mensagem");
    expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "nota", nota: "desfecho", texto: expect.stringContaining("opt-out") });
    expect(modelo.chamadas).toHaveLength(chamadasAntes);
  });

  it("o nível de cautela do SDR decide quando a dúvida chama a pessoa (SDR-60)", async () => {
    await comecar();
    // Cauteloso (0,8): uma resposta com 0,75 de certeza passa a conversa.
    modelo.decisoes.push({ ...modelo.decisaoPadrao, confianca: 0.75 });
    let teste = await responder("Como funciona?");
    expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "nota", texto: "Aqui o SDR pararia e chamaria Duda: baixa confiança." });

    // Mais solto (0,6): a mesma certeza vira resposta.
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr: { ...SDR, cautela: "solto" }, origem: "humano", por: duda, agora: AGORA });
    modelo.decisoes.push({ ...modelo.decisaoPadrao, confianca: 0.75 });
    teste = await responder("E na prática?");
    expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "sdr", texto: modelo.decisaoPadrao.mensagem });

    // Sem cautela gravada (SDR antigo) vale o equilibrado (0,7).
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr: { ...SDR, cautela: undefined }, origem: "humano", por: duda, agora: AGORA });
    modelo.decisoes.push({ ...modelo.decisaoPadrao, confianca: 0.65 });
    teste = await responder("Hum.");
    expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "nota", texto: "Aqui o SDR pararia e chamaria Duda: baixa confiança." });
  });

  it("falha da IA não grava a mensagem do lead", async () => {
    const comecado = await comecar();
    modelo.falhas.push(new ErroDoModelo("fora do formato"));
    expect(await responderComoLead(deps(), { ...base(), texto: "Oi" })).toEqual({ ok: false, erro: "O SDR não respondeu agora. Tente de novo." });
    expect((await obterTeste(banco.db, base()))!.mensagens).toEqual(comecado.mensagens);
  });

  it("ajustar grava a versão com o pedido e o resumo, mostra o resumo e refaz a última resposta com o SDR novo", async () => {
    await comecar();
    const antes = await responder("Me conta mais?");
    const respostaAntiga = antes.mensagens.at(-1)!;
    const ajustador = ajustadorFalso([{ sdr: { ...semLink(SDR), voz: "Bem informal, com gíria leve." }, resumo: "Deixei a voz mais informal.", recusa: null }]);

    const resultado = await ajustar(ajustador, "mais informal", respostaAntiga.id);
    expect(resultado.ok).toBe(true);
    const teste = (resultado as { teste: TesteDoSdr }).teste;

    expect(ajustador.chamadas[0]!.entrada).toContain("<pedido>\nmais informal\n</pedido>");
    expect(ajustador.chamadas[0]!.entrada).toContain(`Resposta do SDR que o pedido aponta:\n"${respostaAntiga.tipo === "sdr" ? respostaAntiga.texto : ""}"`);
    expect(ajustador.chamadas[0]!.entrada).not.toContain("cal.com");
    expect(ajustador.chamadas[0]!.entrada).not.toContain("cauteloso");
    expect(teste.mensagens.map((m) => (m.tipo === "nota" ? m.nota : m.tipo))).toEqual(["sdr", "lead", "ajuste", "sdr"]);
    expect(teste.mensagens.find((m) => m.id === respostaAntiga.id)).toBeUndefined();
    expect(teste).toMatchObject({ sdrVersao: 2, podeDesfazer: true });
    expect(rascunhos().at(-1)!.sistema).toContain("Bem informal, com gíria leve.");

    const sdr = await obterSdr(banco.db, organizacao);
    expect(sdr!.sdr).toMatchObject({ link_agenda: SDR.link_agenda, cautela: "cauteloso" });
    const [versao] = await banco.db.query<{ origem: string; pedido: string; resumo: string }>(
      "select origem, pedido, resumo from public.sdr_versoes where versao = 2",
    );
    expect(versao).toEqual({ origem: "ajuste", pedido: "mais informal", resumo: "Deixei a voz mais informal." });
  });

  it("o ajuste nunca tira uma regra da casa, nem quando o SDR diz o contrário", async () => {
    await comecar();
    await responder("Me conta mais?");
    await ajustar(ajustadorFalso([{ sdr: { ...semLink(SDR), regras: ["Pode usar travessão"] }, resumo: "Liberei o travessão.", recusa: null }]), "pode usar travessão");
    const sistema = rascunhos().at(-1)!.sistema;
    expect(sistema).toContain("Pode usar travessão");
    expect(sistema).toContain("Nunca use travessão (—) nem meia-risca (–).");
    expect(sistema.indexOf("Regras da casa")).toBeGreaterThan(sistema.indexOf("Pode usar travessão"));
  });

  it("pedido contra uma regra da casa é recusado com o motivo e nada muda", async () => {
    await comecar();
    const resultado = await ajustar(
      ajustadorFalso([{ sdr: semLink(SDR), resumo: "Nada mudou.", recusa: "Prometer resultado fere uma regra da casa." }]),
      "promete que dobra as vendas",
    );
    expect(resultado).toMatchObject({ ok: true, teste: { sdrVersao: 1 } });
    expect((resultado as { teste: TesteDoSdr }).teste.mensagens.at(-1)).toMatchObject({ nota: "recusa", texto: "Prometer resultado fere uma regra da casa." });
    expect((await obterSdr(banco.db, organizacao))!.versao).toBe(1);
    expect(rascunhos()).toHaveLength(1);
  });

  it("desfazer grava de novo exatamente o SDR de antes e refaz a resposta", async () => {
    await comecar();
    await ajustar(ajustadorFalso([{ sdr: { ...semLink(SDR), objetivo: "outro objetivo" }, resumo: "Troquei o objetivo.", recusa: null }]), "troca o objetivo");

    const resultado = await desfazerAjuste(deps(), { ...base(), operadorId: duda });
    expect(resultado.ok).toBe(true);
    const sdr = await obterSdr(banco.db, organizacao);
    expect(sdr).toMatchObject({ versao: 3, sdr: SDR });
    const teste = (resultado as { teste: TesteDoSdr }).teste;
    expect(teste.mensagens.map((m) => (m.tipo === "nota" ? m.nota : m.tipo))).toEqual(["ajuste", "desfeito", "sdr"]);
    expect(teste.mensagens.at(-2)).toMatchObject({ texto: "Desfiz: Troquei o objetivo." });
  });

  it("recomeçar limpa a conversa sem mexer no SDR, com outro tipo de lead", async () => {
    await comecar();
    await responder("Oi");
    const teste = await comecar("Boutiques de festa");
    expect(teste).toMatchObject({ segmento: "Boutiques de festa", sdrVersao: 1 });
    expect(teste.mensagens).toHaveLength(1);
    expect(rascunhos().at(-1)!.entrada).toContain("nicho: Boutiques de festa");
  });

  it("'ficou bom' aprova o SDR e o primeiro acesso segue para a abordagem", async () => {
    await comecar();
    expect(await comOperador(banco.db, duda, (tx) => aprovarSdr(tx, { organizacaoId: organizacao, operadorId: duda, agora: AGORA }))).toEqual({ ok: true });
    const estado = await comOperador(banco.db, duda, (tx) => estadoDoPrimeiroAcesso(tx));
    expect(estado.atual).toBe("abordagem");
  });

  it("sem SDR não há teste", async () => {
    const outra = await criarOrganizacao(banco.db, { slug: `org-${randomUUID().slice(0, 8)}` });
    expect(await comecarTeste(deps(), { organizacaoId: outra, nome: "X" })).toMatchObject({ ok: false });
  });

  describe("o canal do teste (SDR-75)", () => {
    it("sem canal, o teste é no LinkedIn", async () => {
      expect(await comecar()).toMatchObject({ canal: "linkedin" });
    });

    it("no Instagram, a conversa começa sem o SDR: só a nota, sem chamar o modelo", async () => {
      const teste = await comecar(undefined, "instagram");
      expect(modelo.chamadas).toEqual([]);
      expect(teste.canal).toBe("instagram");
      expect(teste.mensagens).toEqual([
        expect.objectContaining({
          tipo: "nota",
          nota: "desfecho",
          texto: "No Instagram, quem começa a conversa é a pessoa. Escreva a primeira mensagem como Marina.",
        }),
      ]);
    });

    it("no Instagram, a resposta passa pela decisão da produção com o prompt do canal", async () => {
      await comecar(undefined, "instagram");
      const teste = await responder("Oi, vi o post de vocês");

      const [rascunho] = rascunhos();
      expect(rascunho!.sistema).toBe(
        promptDeRascunho({
          perfil: { nome: "Duda", praca: "domestico", idioma: "pt", voz: null, regras: null, palavrasProibidas: [] },
          linkDeAgenda: SDR.link_agenda,
          responsavelDiscovery: "Duda",
          oferta: resumoDaOferta(ANALISE),
          sdr: SDR,
          canal: "instagram",
        }),
      );
      expect(teste.mensagens.map((m) => m.tipo)).toEqual(["nota", "lead", "sdr"]);
      expect(teste.mensagens.at(-1)).toMatchObject({ tipo: "sdr", texto: modelo.decisaoPadrao.mensagem, aviso: null });
    });

    it("no Instagram, link fora da lista vira o aviso do validador no balão", async () => {
      await comecar(undefined, "instagram");
      modelo.decisoes.push({ ...modelo.decisaoPadrao, mensagem: "Dá uma olhada: https://outro.com/oferta" });
      const teste = await responder("Tem link?");
      expect(teste.mensagens.at(-1)).toMatchObject({
        tipo: "sdr",
        aviso: "validador: A IA só pode mandar os links do lançamento e o de agenda (achei https://outro.com/oferta).",
      });
    });

    it("quem volta encontra o canal onde parou", async () => {
      await comecar(undefined, "telegram");
      expect(await obterTeste(banco.db, base())).toMatchObject({ canal: "telegram" });
    });

    it("no Messenger, o ajuste antes de a pessoa escrever não faz o SDR abrir a conversa", async () => {
      await comecar(undefined, "facebook");
      const resultado = await ajustar(
        ajustadorFalso([{ sdr: { ...semLink(SDR), voz: "Bem informal." }, resumo: "Deixei a voz mais informal.", recusa: null }]),
        "mais informal",
      );
      expect(resultado.ok).toBe(true);
      const teste = (resultado as { teste: TesteDoSdr }).teste;
      expect(teste.mensagens.map((m) => (m.tipo === "nota" ? m.nota : m.tipo))).toEqual(["desfecho", "ajuste"]);
      expect(teste.mensagens[0]).toMatchObject({ texto: expect.stringMatching(/^No Messenger, quem começa a conversa é a pessoa\./) });
      expect(rascunhos()).toEqual([]);
      expect(teste).toMatchObject({ canal: "facebook", sdrVersao: 2 });
    });

    it("o banco recusa um canal inventado", async () => {
      await comecar();
      await expect(banco.db.query("update public.sdr_testes set canal = 'whatsapp' where organizacao_id = $1::uuid", [organizacao])).rejects.toThrow(
        /sdr_testes_canal_check/,
      );
    });
  });
});
