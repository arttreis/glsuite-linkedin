import { z } from "zod";
import { contextoDeValidacao, type ContextoDoPerfil } from "./campanha";
import { posT4DaPraca, sequenciaPadrao, tetoDoPasso, type Sequencia } from "./sequencia";
import { renderizarTemplate, type ValoresDoTemplate } from "./template";
import { validarMensagem, type Praca, type Violacao } from "./validador";

/**
 * Fluxo da campanha (§4.1): blocos ligados por setas. O que pode existir em
 * qualquer fluxo e o que o motor faz com cada bloco:
 *
 * - inicio: o lead aprovado na triagem entra aqui;
 * - convite: pedido de conexão com nota (vazia = sem nota);
 * - esperar: N dias úteis no fuso do perfil, somados ao momento anterior;
 * - condicao "aceitou": espera o aceite do convite anterior. Saída "sim" no
 *   aceite; "nao" quando o prazo acaba e o convite é retirado;
 * - condicao "conectado": logo depois do início, decide se a pessoa já é
 *   conexão de 1º grau;
 * - mensagem: DM com template (na Espanha vira tarefa manual, §4.5);
 * - tarefa: o dono do perfil escreve à mão, com o roteiro de apoio;
 * - fim: a sequência termina sem resposta, com ou sem pausa de 60 dias.
 *
 * O id do bloco é o que vai em `acoes.toque`: no fluxo padrão, T1 a T4.
 */

const id = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, "Id de bloco inválido.");
const posicao = z.object({ x: z.number(), y: z.number() });
const comum = { id, posicao: posicao.optional() };
const teto = z.number().int().positive().max(2000).optional();

export const nodeDoFluxo = z.discriminatedUnion("tipo", [
  z.object({ ...comum, tipo: z.literal("inicio") }),
  z.object({ ...comum, tipo: z.literal("convite"), template: z.string().max(2000), max_caracteres: teto }),
  z.object({ ...comum, tipo: z.literal("esperar"), dias_uteis: z.number().int().min(0).max(60) }),
  z.object({
    ...comum,
    tipo: z.literal("condicao"),
    condicao: z.enum(["aceitou", "conectado"]),
    /** Só para "aceitou". Vazio = o padrão da casa (convite_expira_dias, em dias corridos). */
    prazo_dias_uteis: z.number().int().min(1).max(60).nullable().optional(),
  }),
  z.object({ ...comum, tipo: z.literal("mensagem"), template: z.string().max(2000), max_caracteres: teto }),
  z.object({ ...comum, tipo: z.literal("tarefa"), roteiro: z.string().max(2000) }),
  z.object({ ...comum, tipo: z.literal("fim"), resultado: z.enum(["sem_resposta", "pausa_60"]) }),
]);

export type NodeDoFluxo = z.infer<typeof nodeDoFluxo>;
export type TipoDeNode = NodeDoFluxo["tipo"];
export type Saida = "sim" | "nao";

export const arestaDoFluxo = z.object({ de: id, para: id, saida: z.enum(["sim", "nao"]).optional() });
export type ArestaDoFluxo = z.infer<typeof arestaDoFluxo>;

export const fluxo = z.object({
  versao: z.literal(1),
  nodes: z.array(nodeDoFluxo).min(1).max(60),
  arestas: z.array(arestaDoFluxo).max(120),
});

export type Fluxo = z.infer<typeof fluxo>;

type NodeDe<T extends TipoDeNode> = Extract<NodeDoFluxo, { tipo: T }>;

export const ROTULO_DO_TIPO: Record<TipoDeNode, string> = {
  inicio: "Início",
  convite: "Convite",
  esperar: "Esperar",
  condicao: "Condição",
  mensagem: "Mensagem",
  tarefa: "Tarefa manual",
  fim: "Fim",
};

export function nodePorId(f: Fluxo, nodeId: string): NodeDoFluxo | undefined {
  return f.nodes.find((node) => node.id === nodeId);
}

/** O bloco seguinte. Condição precisa da saída; os outros têm uma seta só. */
export function proximoNode(f: Fluxo, nodeId: string, saida?: Saida): NodeDoFluxo | undefined {
  const aresta = f.arestas.find((a) => a.de === nodeId && (saida ? a.saida === saida : true));
  return aresta ? nodePorId(f, aresta.para) : undefined;
}

export function inicioDoFluxo(f: Fluxo): NodeDe<"inicio"> | undefined {
  return f.nodes.find((node): node is NodeDe<"inicio"> => node.tipo === "inicio");
}

/** A condição "aceitou" que vem logo depois do convite `conviteId`. */
export function condicaoDoConvite(f: Fluxo, conviteId: string): NodeDe<"condicao"> | undefined {
  const proximo = proximoNode(f, conviteId);
  return proximo?.tipo === "condicao" && proximo.condicao === "aceitou" ? proximo : undefined;
}

/** Bloco com texto que sai pelo LinkedIn, no formato que o validador usa. */
export type PassoDeTexto = { toque: string; tipo: "convite" | "dm"; template: string; max_caracteres?: number };

export function passoDoNode(node: NodeDoFluxo | undefined): PassoDeTexto | null {
  if (!node) return null;
  if (node.tipo === "convite") return { toque: node.id, tipo: "convite", template: node.template, max_caracteres: node.max_caracteres };
  if (node.tipo === "mensagem") return { toque: node.id, tipo: "dm", template: node.template, max_caracteres: node.max_caracteres };
  if (node.tipo === "tarefa") return { toque: node.id, tipo: "dm", template: node.roteiro };
  return null;
}

/** Teto de caracteres do bloco: o configurado, o do toque padrão ou o padrão do tipo. */
export const tetoDoBloco = tetoDoPasso;

// ---------------------------------------------------------------------------
// Validação da forma do fluxo (§4.1)

export type ProblemaDoFluxo = { nodeId: string | null; mensagem: string };

export function validarFluxo(f: Fluxo): ProblemaDoFluxo[] {
  const problemas: ProblemaDoFluxo[] = [];
  const erro = (nodeId: string | null, mensagem: string) => problemas.push({ nodeId, mensagem });

  const ids = new Set<string>();
  for (const node of f.nodes) {
    if (ids.has(node.id)) erro(node.id, "Dois blocos com o mesmo id.");
    ids.add(node.id);
  }
  for (const aresta of f.arestas) {
    if (!ids.has(aresta.de) || !ids.has(aresta.para)) erro(null, "Há uma seta ligada a um bloco que não existe.");
  }
  const inicios = f.nodes.filter((node) => node.tipo === "inicio");
  if (inicios.length !== 1) erro(null, inicios.length === 0 ? "O fluxo precisa de um bloco Início." : "O fluxo só pode ter um Início.");
  if (problemas.length > 0) return problemas;

  const saindo = (nodeId: string) => f.arestas.filter((a) => a.de === nodeId);
  const chegando = (nodeId: string) => f.arestas.filter((a) => a.para === nodeId);

  for (const node of f.nodes) {
    const saidas = saindo(node.id);
    const nome = ROTULO_DO_TIPO[node.tipo];
    if (node.tipo === "fim") {
      if (saidas.length > 0) erro(node.id, "O Fim não tem seta de saída.");
    } else if (node.tipo === "condicao") {
      const sim = saidas.filter((a) => a.saida === "sim").length;
      const nao = saidas.filter((a) => a.saida === "nao").length;
      if (sim !== 1 || nao !== 1 || saidas.length !== 2) erro(node.id, "A condição precisa de uma saída \"sim\" e uma \"não\".");
    } else if (saidas.length !== 1) {
      erro(node.id, saidas.length === 0 ? `${nome} sem seta de saída: ligue ao próximo bloco ou a um Fim.` : `${nome} só pode ter uma seta de saída.`);
    }
    if (node.tipo === "inicio" && chegando(node.id).length > 0) erro(node.id, "Nenhuma seta pode chegar no Início.");
    if (node.tipo !== "inicio" && chegando(node.id).length === 0) erro(node.id, `${nome} solto: nenhuma seta chega nele.`);

    if (node.tipo === "mensagem" && node.template.trim() === "") erro(node.id, "A mensagem precisa de texto.");
    if (node.tipo === "tarefa" && node.roteiro.trim() === "") erro(node.id, "A tarefa manual precisa de um roteiro.");
    if (node.tipo === "convite" && !condicaoDoConvite(f, node.id)) {
      erro(node.id, "Depois de um convite vem a condição \"Aceitou o convite?\".");
    }
    if (node.tipo === "condicao" && node.condicao === "aceitou") {
      const anteriores = chegando(node.id).map((a) => nodePorId(f, a.de));
      if (anteriores.some((anterior) => anterior?.tipo !== "convite")) {
        erro(node.id, "\"Aceitou o convite?\" só pode vir logo depois de um convite.");
      }
    }
    if (node.tipo === "condicao" && node.condicao === "conectado") {
      const anteriores = chegando(node.id).map((a) => nodePorId(f, a.de));
      if (anteriores.some((anterior) => anterior?.tipo !== "inicio")) {
        erro(node.id, "\"Já é conexão?\" só pode vir logo depois do Início.");
      }
    }
  }

  // Caminhos a partir do início: sem ciclos, todo bloco alcançável, DM só
  // para 1º grau e no máximo um convite por caminho. O estado de cada bloco
  // (já é conexão? quantos convites?) é pequeno, então cada combinação é
  // visitada uma vez só, sem enumerar todos os caminhos.
  const inicio = inicios[0]!;
  const alcancados = new Set<string>();
  const emAndamento = new Set<string>();
  const concluidos = new Set<string>();
  let temAcao = false;
  const visitar = (nodeId: string, conectado: boolean, convites: number): void => {
    const estado = `${nodeId}|${conectado}|${Math.min(convites, 2)}`;
    if (emAndamento.has(estado)) {
      erro(nodeId, "O fluxo volta para um bloco anterior. Ciclos não são permitidos.");
      return;
    }
    if (concluidos.has(estado)) return;
    emAndamento.add(estado);
    const node = nodePorId(f, nodeId)!;
    alcancados.add(nodeId);
    if (node.tipo === "convite" || node.tipo === "mensagem" || node.tipo === "tarefa") temAcao = true;
    if (node.tipo === "mensagem" && !conectado) {
      erro(nodeId, "Mensagem só depois de \"Aceitou o convite?\" (sim) ou \"Já é conexão?\" (sim): DM só vai para conexão de 1º grau.");
    }
    if (node.tipo === "convite" && (convites > 0 || conectado)) {
      erro(nodeId, conectado ? "Quem já é conexão não recebe convite." : "Só pode haver um convite em cada caminho.");
    }
    for (const aresta of saindo(nodeId)) {
      const vira = node.tipo === "condicao" ? (aresta.saida === "sim" ? true : node.condicao === "conectado" ? false : conectado) : conectado;
      visitar(aresta.para, vira, convites + (node.tipo === "convite" ? 1 : 0));
    }
    emAndamento.delete(estado);
    concluidos.add(estado);
  };
  visitar(inicio.id, false, 0);
  for (const node of f.nodes) {
    if (!alcancados.has(node.id) && node.tipo !== "inicio") erro(node.id, `${ROTULO_DO_TIPO[node.tipo]} fora do caminho do Início.`);
  }
  if (!temAcao) erro(null, "O fluxo precisa de pelo menos um convite, mensagem ou tarefa.");

  // Um problema por bloco e mensagem basta.
  const vistos = new Set<string>();
  return problemas.filter((p) => {
    const chave = `${p.nodeId}|${p.mensagem}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Copy dos blocos

/** `toque` é o id do bloco: no fluxo padrão, T1 a T4. */
export type ProblemaDoBloco = { toque: string; previa: string | null; violacoes: Violacao[] };

/**
 * Valida o texto de cada convite e mensagem com valores de exemplo longos,
 * como `validarCopyDaSequencia` fazia com os toques. Roteiro de tarefa não sai
 * pelo sistema e não passa por aqui.
 */
export function validarCopyDoFluxo(
  f: Fluxo,
  perfil: ContextoDoPerfil,
  exemplo: ValoresDoTemplate,
): ProblemaDoBloco[] {
  return f.nodes.flatMap((node): ProblemaDoBloco[] => {
    if (node.tipo !== "convite" && node.tipo !== "mensagem") return [];
    // Convite sem texto sai sem nota (ou com a nota da IA, na campanha personalizada).
    if (node.tipo === "convite" && node.template.trim() === "") return [{ toque: node.id, previa: null, violacoes: [] }];
    const renderizado = renderizarTemplate(node.template, exemplo);
    if (!renderizado.ok) {
      return [{ toque: node.id, previa: null, violacoes: [{ regra: "token_nao_resolvido", mensagem: renderizado.erro }] }];
    }
    const { violacoes } = validarMensagem(renderizado.texto, contextoDeValidacao(perfil, passoDoNode(node), "template"));
    return [{ toque: node.id, previa: renderizado.texto, violacoes }];
  });
}

// ---------------------------------------------------------------------------
// Fluxo padrão e campanhas de antes do SDR-21

/**
 * A sequência linear de toques (§4.1 original) como fluxo: convite, aceite,
 * esperas e mensagens, com o fim que a praça pede (pós-T4). O id de cada bloco
 * de texto é o próprio toque, então as ações que já existem continuam
 * apontando para o bloco certo.
 */
export function sequenciaParaFluxo(passos: Sequencia, posT4: "conexao" | "pausa_60_novo_angulo"): Fluxo {
  const nodes: NodeDoFluxo[] = [{ id: "inicio", tipo: "inicio", posicao: { x: 0, y: 0 } }];
  const arestas: ArestaDoFluxo[] = [];
  let y = 0;
  const posicao = (x = 0) => {
    y += 120;
    return { x, y };
  };
  let anterior = "inicio";
  let saidaAnterior: Saida | undefined;
  const ligar = (para: string) => {
    arestas.push({ de: anterior, para, ...(saidaAnterior ? { saida: saidaAnterior } : {}) });
    anterior = para;
    saidaAnterior = undefined;
  };

  for (const passo of passos) {
    if (passo.tipo === "convite") {
      nodes.push({ id: passo.toque, tipo: "convite", template: passo.template, max_caracteres: passo.max_caracteres, posicao: posicao() });
      ligar(passo.toque);
      nodes.push({ id: "aceite", tipo: "condicao", condicao: "aceitou", prazo_dias_uteis: null, posicao: posicao() });
      ligar("aceite");
      nodes.push({ id: "fim-sem-aceite", tipo: "fim", resultado: "sem_resposta", posicao: { x: 320, y: y + 120 } });
      arestas.push({ de: "aceite", para: "fim-sem-aceite", saida: "nao" });
      saidaAnterior = "sim";
      continue;
    }
    const espera = `espera-${passo.toque}`;
    nodes.push({ id: espera, tipo: "esperar", dias_uteis: passo.offset_dias_uteis, posicao: posicao() });
    ligar(espera);
    nodes.push({ id: passo.toque, tipo: "mensagem", template: passo.template, max_caracteres: passo.max_caracteres, posicao: posicao() });
    ligar(passo.toque);
  }
  nodes.push({ id: "fim", tipo: "fim", resultado: posT4 === "pausa_60_novo_angulo" ? "pausa_60" : "sem_resposta", posicao: posicao() });
  ligar("fim");
  return { versao: 1, nodes, arestas };
}

/** O fluxo de uma campanha nova: os 4 toques da §4.1, com o fim da praça. */
export function fluxoPadrao(praca: Praca): Fluxo {
  return sequenciaParaFluxo(sequenciaPadrao(), posT4DaPraca(praca));
}
