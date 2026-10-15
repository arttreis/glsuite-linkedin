import { z } from "zod";
import {
  cargosDoPedido,
  escolherParametro,
  falaDaConversa,
  listaPeloNome,
  MAX_EMPRESAS_PELA_CONVERSA,
  MAX_FALAS_NO_HISTORICO,
  MAX_MENSAGEM,
  mesmoNome,
  mudancasDaBusca,
  nomeDaListaDoPedido,
  rascunhoDaBusca,
  type MudancaNaBusca,
  type PedidoDeBusca,
  type RascunhoDaBusca,
} from "@/domain/conversa-da-busca";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { criarLista, listarListas } from "@/server/listas/listas";
import type { ClienteUnipile, ParametroDeBusca } from "@/server/unipile/cliente";
import { contaDaCampanha } from "./busca";
import type { InterpretadorDeBusca } from "./interpretador-de-busca";
import { entradaDaConversaDaBusca, promptDaConversaDaBusca, VERSAO_DO_PROMPT_DA_BUSCA } from "./prompts-da-busca";
import { obterPublico, type Resultado } from "./publicos";

type Tipo = "LOCATION" | "INDUSTRY";

/** Região ou setor que o nome não bastou para achar: a pessoa escolhe entre as opções. */
export type DuvidaDaBusca = { tipo: Tipo; texto: string; opcoes: ParametroDeBusca[] };

export type RespostaDaConversa = Resultado<{
  resposta: string;
  /** O que a conversa não conseguiu fazer, em frases para a tela. */
  avisos: string[];
  busca: RascunhoDaBusca;
  mudancas: MudancaNaBusca[];
  duvidas: DuvidaDaBusca[];
  /** A lista que a conversa criou: a tela procura as empresas dela no LinkedIn. */
  listaCriada: { id: string; nome: string; empresas: number } | null;
}>;

const historico = z.array(falaDaConversa);
const REGIAO = { um: "a região", varios: "as regiões", plural: "regiões" };
const SETOR = { um: "o setor", varios: "os setores", plural: "setores" };

/** Regiões ou setores pelo nome: os que já estão na busca ficam; os outros, a conta procura no LinkedIn. */
async function resolverParametros(
  deps: { unipile: ClienteUnipile; accountId: string },
  p: { tipo: Tipo; nomes: string[]; atuais: ParametroDeBusca[]; rotulo: { um: string; varios: string; plural: string } },
): Promise<{ itens: ParametroDeBusca[]; duvidas: DuvidaDaBusca[]; avisos: string[] }> {
  const itens: ParametroDeBusca[] = [];
  const duvidas: DuvidaDaBusca[] = [];
  const naoAchados: string[] = [];
  const avisos: string[] = [];
  const pedir = (item: ParametroDeBusca) => {
    if (!itens.some((i) => i.id === item.id)) itens.push(item);
  };
  for (const bruto of p.nomes) {
    const nome = bruto.trim().slice(0, 80);
    if (nome.length < 2) continue;
    const atual = p.atuais.find((a) => mesmoNome(a.nome, nome));
    if (atual) {
      pedir(atual);
      continue;
    }
    let opcoes: ParametroDeBusca[];
    try {
      opcoes = await deps.unipile.listarParametrosDeBusca(deps.accountId, p.tipo, nome);
    } catch (erro) {
      avisos.push(`O LinkedIn não respondeu à consulta de "${nome}": ${(erro as Error).message}`);
      continue;
    }
    const escolha = escolherParametro(nome, opcoes);
    if (escolha.tipo === "achado") pedir(escolha.item);
    else if (escolha.tipo === "duvida") duvidas.push({ tipo: p.tipo, texto: nome, opcoes: escolha.opcoes });
    else naoAchados.push(nome);
  }
  if (naoAchados.length > 0) {
    const rotulo = naoAchados.length === 1 ? p.rotulo.um : p.rotulo.varios;
    avisos.push(`Não achei no LinkedIn ${rotulo} ${naoAchados.map((n) => `"${n}"`).join(", ")}.`);
  }
  if (itens.length > 10) avisos.push(`A busca aceita até 10 ${p.rotulo.plural}: ficaram os 10 primeiros.`);
  return { itens: itens.slice(0, 10), duvidas, avisos };
}

/**
 * Um turno da conversa da busca (SDR-62): a pessoa diz quem quer achar, o
 * modelo devolve a busca como deve ficar, e o servidor acha região e setor no
 * LinkedIn pela conta da campanha (o modelo nunca escolhe id) e a lista de
 * empresas pelo nome. Não salva nem roda a busca: devolve o rascunho para o
 * formulário, e quem busca é a pessoa. A única coisa que grava é a lista de
 * empresas que a pessoa pediu para criar com os nomes que deu.
 *
 * A conversa é só da sessão: o histórico vem da tela. Lê e grava como o
 * operador; o modelo e o LinkedIn ficam fora da transação. Quem chama
 * autoriza o operador na campanha antes.
 */
export async function conversarSobreABusca(
  deps: { db: Db; unipile: ClienteUnipile; interpretador: InterpretadorDeBusca },
  p: { campanhaId: string; busca: unknown; historico: unknown; mensagem: string; operadorId: string; agora: Date },
): Promise<RespostaDaConversa> {
  const mensagem = String(p.mensagem ?? "").trim();
  if (!mensagem) return { ok: false, erro: "Escreva quem você quer achar." };
  if (mensagem.length > MAX_MENSAGEM) {
    return { ok: false, erro: `Escreva em até ${MAX_MENSAGEM} caracteres. Para muitas empresas, crie a lista em Listas de empresas.` };
  }
  const atual = rascunhoDaBusca.safeParse(p.busca);
  if (!atual.success) return { ok: false, erro: "A busca da tela está num formato que não reconheço. Recarregue a página." };
  const falas = historico.safeParse(p.historico ?? []);
  if (!falas.success) return { ok: false, erro: "A conversa da tela está num formato que não reconheço. Recarregue a página." };

  const contexto = await comOperador(deps.db, p.operadorId, async (tx) => {
    const conta = await contaDaCampanha(tx, p.campanhaId);
    if (!conta?.publico_id) return null;
    return {
      conta,
      publico: await obterPublico(tx, conta.publico_id),
      listas: (await listarListas(tx, conta.organizacao_id)).map((l) => ({ id: l.id, nome: l.nome, empresas: l.total })),
    };
  });
  if (!contexto) return { ok: false, erro: "Só campanha de público tem busca." };
  const { conta, publico, listas } = contexto;
  if (!conta.account_id) return { ok: false, erro: "A conta da campanha não tem LinkedIn conectado." };

  let resposta;
  try {
    resposta = await deps.interpretador.interpretar({
      sistema: promptDaConversaDaBusca(),
      entrada: entradaDaConversaDaBusca({
        publico,
        busca: atual.data,
        listas,
        historico: falas.data.slice(-MAX_FALAS_NO_HISTORICO),
        mensagem,
      }),
    });
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("Conversa da busca falhou", erro);
    const motivo = erro instanceof ErroDoModelo ? erro.message.replace(/\.$/, "") : "a IA não respondeu";
    return { ok: false, erro: `Não consegui entender agora: ${motivo}. Tente de novo ou mexa nos filtros abaixo.` };
  }
  const pedido: PedidoDeBusca = resposta.saida;
  const avisos: string[] = [];

  const { cargos, cortados } = cargosDoPedido(pedido.cargos);
  if (cortados > 0) avisos.push("A busca aceita até 10 cargos: ficaram os 10 primeiros.");
  if (cargos.length === 0 && atual.data.cargos.length > 0) avisos.push("A busca precisa de pelo menos um cargo: os cargos ficaram como estavam.");

  const resolver = { unipile: deps.unipile, accountId: conta.account_id };
  const regioes = await resolverParametros(resolver, { tipo: "LOCATION", nomes: pedido.regioes, atuais: atual.data.regioes, rotulo: REGIAO });
  const setores = await resolverParametros(resolver, { tipo: "INDUSTRY", nomes: pedido.setores, atuais: atual.data.setores, rotulo: SETOR });
  avisos.push(...regioes.avisos, ...setores.avisos);

  let lista = atual.data.lista;
  let listaCriada: { id: string; nome: string; empresas: number } | null = null;
  if (pedido.lista.acao === "tirar") lista = null;
  else if (pedido.lista.acao === "usar") {
    const achada = listaPeloNome(pedido.lista.nome, listas);
    if (achada) lista = { id: achada.id, nome: achada.nome };
    else avisos.push(`Não achei a lista de empresas "${pedido.lista.nome.trim()}". A busca ficou com a lista que estava.`);
  } else if (pedido.lista.acao === "criar") {
    const nomes = pedido.lista.empresas.slice(0, MAX_EMPRESAS_PELA_CONVERSA);
    if (pedido.lista.empresas.length > nomes.length) {
      avisos.push(`Pela conversa entram até ${MAX_EMPRESAS_PELA_CONVERSA} empresas. Para mais, adicione na lista em Listas de empresas.`);
    }
    const nome = nomeDaListaDoPedido(pedido.lista.nome);
    const criada = await comOperador(deps.db, p.operadorId, (tx) =>
      criarLista(tx, { organizacaoId: conta.organizacao_id, nome, nomes, operadorId: p.operadorId, agora: p.agora }),
    );
    if (criada.ok) {
      lista = { id: criada.id, nome };
      listaCriada = { id: criada.id, nome, empresas: criada.adicionadas };
    } else avisos.push(`Não consegui criar a lista: ${criada.erro}`);
  }

  const busca: RascunhoDaBusca = {
    ...atual.data,
    cargos: cargos.length > 0 ? cargos : atual.data.cargos,
    palavras: pedido.palavras.trim().slice(0, 200),
    regioes: regioes.itens,
    setores: setores.itens,
    lista,
  };
  const mudancas = mudancasDaBusca(atual.data, busca);

  await comOperador(deps.db, p.operadorId, (tx) =>
    registrarEvento(tx, {
      tipo: "busca_conversada",
      entidade: "campanha",
      entidadeId: p.campanhaId,
      perfilId: conta.perfil_id,
      payload: {
        mudancas: mudancas.length,
        duvidas: regioes.duvidas.length + setores.duvidas.length,
        ...(listaCriada ? { lista_criada: listaCriada.id, empresas: listaCriada.empresas } : {}),
        modelo: resposta.modelo,
        custo_usd: Number((custoDaChamada(resposta.modelo, resposta.uso) ?? 0).toFixed(4)),
        versao_prompt: VERSAO_DO_PROMPT_DA_BUSCA,
      },
      ator: p.operadorId,
      em: p.agora,
    }),
  );

  return {
    ok: true,
    resposta: pedido.resposta.trim() || (mudancas.length > 0 ? "Pronto, mudei a busca." : "A busca ficou como estava."),
    avisos,
    busca,
    mudancas,
    duvidas: [...regioes.duvidas, ...setores.duvidas],
    listaCriada,
  };
}
