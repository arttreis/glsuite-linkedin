import { fluxoComTextos, problemasDoFluxoGerado, type EstiloDoFluxo, type ProblemaDoTexto, type TextosDoFluxo } from "@/domain/fluxo-gerado";
import { ErroDoModelo, type Resposta, type Uso } from "@/server/agente/modelo";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import { lerConfiguracao } from "@/server/configuracoes";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { salvarFluxo } from "@/server/fluxo/fluxos";
import { dossieConfirmado } from "@/server/oferta/oferta";
import type { EscritorDeFluxo } from "./escritor";
import { entradaDoFluxo, promptDoFluxo, VERSAO_DO_PROMPT_DO_FLUXO } from "./prompts-do-fluxo";
import { obterPublico, type Resultado } from "./publicos";
import { obterSdr } from "@/server/sdr/sdr";

const somar = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  saida: a.saida + b.saida,
  cacheLeitura: a.cacheLeitura + b.cacheLeitura,
  cacheEscrita: a.cacheEscrita + b.cacheEscrita,
});

/**
 * Escreve os textos e avalia; se algo foi barrado, pede uma reescrita com os
 * problemas apontados, uma vez só. O que sobrar volta marcado: nunca corrige
 * em silêncio (§4.14). Erro do modelo sobe para quem chamou.
 */
export async function escreverComRevisao<R extends { problemas: ProblemaDoTexto[] }>(
  escritor: EscritorDeFluxo,
  sistema: string,
  avaliar: (textos: TextosDoFluxo) => R,
): Promise<{ resultado: R; respostas: Resposta<TextosDoFluxo>[] }> {
  const primeira = await escritor.escrever({ sistema, entrada: entradaDoFluxo() });
  let resultado = avaliar(primeira.saida);
  const respostas = [primeira];
  if (resultado.problemas.length > 0) {
    const segunda = await escritor.escrever({ sistema, entrada: entradaDoFluxo({ anterior: primeira.saida, barrados: resultado.problemas }) });
    respostas.push(segunda);
    resultado = avaliar(segunda.saida);
  }
  return { resultado, respostas };
}

/** Uso somado de várias chamadas. */
export const usoSomado = (respostas: readonly Resposta<unknown>[]): Uso =>
  respostas.reduce((total, r) => somar(total, r.uso), { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 });

/**
 * Gera o fluxo da campanha de público (§4.14): a forma do fluxo padrão da
 * praça, com os textos escritos para o público, a oferta e a voz do perfil.
 * Valida (§4.2 e provas do público) e reescreve uma vez o que foi barrado; o
 * que sobrar chega marcado ao editor, e a campanha não ativa até alguém
 * corrigir. Nunca corrige em silêncio. Lê e grava como o operador; a chamada à
 * IA fica fora da transação.
 */
export async function gerarFluxo(
  deps: { db: Db; escritor: EscritorDeFluxo; agora: () => Date },
  p: { campanhaId: string; operadorId: string; estilo: EstiloDoFluxo },
): Promise<Resultado<{ problemas: ProblemaDoTexto[] }>> {
  const entrada = await comOperador(deps.db, p.operadorId, async (tx) => {
    const [campanha] = await tx.query<{
      publico_id: string | null;
      perfil_id: string;
      status: string;
      organizacao_id: string;
      nome: string;
      voz_md: string | null;
    }>(
      `select c.publico_id, c.perfil_id, c.status, pf.organizacao_id, pf.nome, pf.voz_md
         from public.campanhas c join public.perfis pf on pf.id = c.perfil_id
        where c.id = $1::uuid`,
      [p.campanhaId],
    );
    if (!campanha?.publico_id) return { erro: "Só campanha de público tem fluxo gerado." };
    if (campanha.status === "encerrada") return { erro: "Campanha encerrada não muda de fluxo." };
    const publico = await obterPublico(tx, campanha.publico_id);
    if (!publico) return { erro: "Público não encontrado." };
    const dossie = await dossieConfirmado(tx, campanha.organizacao_id);
    if (!dossie) return { erro: "Confirme o dossiê da oferta antes: as mensagens saem dele." };
    // Com o SDR montado, a campanha fala na voz dele (§4.11, como no primeiro acesso).
    const sdr = await obterSdr(tx, campanha.organizacao_id);
    return {
      publico,
      dossie,
      contexto: await contextoDoPerfil(tx, campanha.perfil_id),
      exemplo: await lerConfiguracao(tx, "template_exemplo"),
      nome: campanha.nome,
      voz: sdr ? `${sdr.sdr.voz}\nComo abre a conversa: ${sdr.sdr.abertura}` : campanha.voz_md,
    };
  });
  if ("erro" in entrada) return { ok: false, erro: entrada.erro! };

  const { publico, dossie, contexto, exemplo } = entrada;
  const sistema = promptDoFluxo({
    publico,
    dossie,
    estilo: p.estilo,
    perfil: {
      nome: entrada.nome,
      praca: contexto.praca,
      voz: entrada.voz,
      palavrasProibidas: contexto.palavrasProibidas,
      rodape: contexto.rodapeObrigatorio,
      limiteNotaConvite: contexto.limiteNotaConvite,
    },
  });
  const avaliar = (textos: TextosDoFluxo) => {
    const fluxo = fluxoComTextos(contexto.praca, textos);
    return { fluxo, problemas: problemasDoFluxoGerado(fluxo, contexto, exemplo, publico.provas) };
  };

  let respostas: Resposta<TextosDoFluxo>[] = [];
  let resultado: ReturnType<typeof avaliar>;
  try {
    ({ resultado, respostas } = await escreverComRevisao(deps.escritor, sistema, avaliar));
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("Fluxo gerado falhou", erro);
    const motivo = erro instanceof ErroDoModelo ? erro.message.replace(/\.$/, "") : "a IA não respondeu";
    return { ok: false, erro: `Não consegui escrever as mensagens: ${motivo}.` };
  }

  const uso = usoSomado(respostas);
  const modelo = respostas.at(-1)!.modelo;
  const agora = deps.agora();
  await comOperador(deps.db, p.operadorId, async (tx) => {
    await salvarFluxo(tx, { campanhaId: p.campanhaId, fluxo: resultado.fluxo, operadorId: p.operadorId });
    await registrarEvento(tx, {
      tipo: "fluxo_gerado",
      entidade: "campanha",
      entidadeId: p.campanhaId,
      payload: {
        estilo: p.estilo,
        tentativas: respostas.length,
        problemas: resultado.problemas.length,
        motivo: respostas.at(-1)!.saida.motivo,
        modelo,
        custo_usd: Number((custoDaChamada(modelo, uso) ?? 0).toFixed(4)),
        versao_prompt: VERSAO_DO_PROMPT_DO_FLUXO,
      },
      ator: p.operadorId,
      em: agora,
    });
  });
  return { ok: true, problemas: resultado.problemas };
}
