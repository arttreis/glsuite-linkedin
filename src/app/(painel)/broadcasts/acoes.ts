"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { instanteLocal } from "@/domain/calendario";
import { CANAIS_DE_DISPARO, type CanalDeDisparo } from "@/domain/canais";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterEnviadores } from "@/server/dependencias";
import {
  cancelarDisparo,
  confirmarDisparo,
  contatosDoSegmento,
  obterDisparo,
  pausarDisparo,
  planejarEnvios,
  retomarDisparo,
  salvarRascunho,
  tentarDeNovoAsFalhas,
} from "@/server/disparos/disparos";
import { processarDisparos } from "@/server/disparos/fila";
import type { Resultado } from "@/server/publicos/publicos";
import { obterCofre } from "@/server/segredos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

const ROTA = "/broadcasts";

function voltar(disparoId: string, mensagem: string): never {
  revalidatePath(ROTA, "layout");
  redirect(`${ROTA}/${disparoId}?msg=${encodeURIComponent(mensagem)}`);
}

/** O disparo da organização, e o operador com o módulo do canal dele (§4.14). */
async function disparoDoOperador(valor: FormDataEntryValue | null) {
  const disparoId = z.uuid().parse(valor);
  const [linha] = await obterDb().query<{ canal_tipo: CanalDeDisparo }>("select canal_tipo from public.disparos where id = $1::uuid", [disparoId]);
  if (!linha) redirect(ROTA);
  const operador = await exigirOperadorComModuloNaAcao(linha.canal_tipo);
  const disparo = await comOperador(obterDb(), operador.id, (tx) => obterDisparo(tx, { id: disparoId, organizacaoId: operador.organizacaoId }));
  if (!disparo) redirect(ROTA);
  return { operador, disparo };
}

/** A fila roda logo depois da resposta, sem esperar o cron (§4.18). Se falhar aqui, o cron pega. */
function rodarAFilaDepois() {
  after(() => processarDisparos({ db: obterDb(), cofre: obterCofre(), agora: () => new Date(), enviadores: obterEnviadores() }).catch(() => undefined));
}

/** Cria ou salva o rascunho e abre a conferência. */
export async function salvarRascunhoDoPainel(entrada: { id: string | null; canal: string; nome: string; segmentoId: string; conteudo: unknown }): Promise<Resultado<{ id: string }>> {
  const canal = z.enum(CANAIS_DE_DISPARO).parse(entrada.canal);
  const operador = await exigirOperadorComModuloNaAcao(canal);
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarRascunho(tx, {
      organizacaoId: operador.organizacaoId,
      id: entrada.id === null ? null : z.uuid().parse(entrada.id),
      canal,
      nome: entrada.nome,
      segmentoId: z.uuid().parse(entrada.segmentoId),
      conteudo: entrada.conteudo,
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (resultado.ok) revalidatePath(ROTA, "layout");
  return resultado;
}

/**
 * "Disparar agora" ou "Agendar" (§4.18). Quem recebe é calculado com o que o
 * operador vê no segmento, na hora; a confirmação congela a lista.
 */
export async function confirmarDisparoDoPainel(formData: FormData) {
  const { operador, disparo } = await disparoDoOperador(formData.get("disparoId"));
  const agora = new Date();
  const config = await lerConfiguracao(obterDb(), "disparos");
  let quando: Date | null = null;
  if (formData.get("quando") === "agendar") {
    const valor = String(formData.get("agendadoPara") ?? "");
    const [data, hora] = valor.split("T");
    if (!data || !hora) voltar(disparo.id, "Escolha o dia e a hora do agendamento.");
    quando = instanteLocal(data, hora.slice(0, 5), config.janela.fuso);
  }
  if (!disparo.segmentoId) voltar(disparo.id, "O segmento deste disparo foi apagado. Escolha outro em \"Mudar\".");
  const contatos = await comOperador(obterDb(), operador.id, (tx) =>
    contatosDoSegmento(tx, { organizacaoId: operador.organizacaoId, filtros: disparo.filtros, canal: disparo.canalTipo, disparoId: disparo.id }),
  );
  const resultado = await confirmarDisparo(obterDb(), {
    organizacaoId: operador.organizacaoId,
    disparoId: disparo.id,
    filtros: disparo.filtros,
    envios: planejarEnvios(disparo, contatos, agora, config.intervalo_horas),
    quando,
    operadorId: operador.id,
    agora,
  });
  if (!resultado.ok) voltar(disparo.id, resultado.erro);
  if (resultado.agendadoPara.getTime() <= agora.getTime() + 60_000) rodarAFilaDepois();
  const comeca =
    resultado.agendadoPara.getTime() <= agora.getTime() + 60_000
      ? "já está saindo"
      : `começa em ${resultado.agendadoPara.toLocaleString("pt-BR", { timeZone: config.janela.fuso, dateStyle: "short", timeStyle: "short" })}`;
  voltar(disparo.id, `Confirmado para ${resultado.recebem} ${resultado.recebem === 1 ? "pessoa" : "pessoas"}: ${comeca}.`);
}

export async function pausarDisparoDoPainel(formData: FormData) {
  const { operador, disparo } = await disparoDoOperador(formData.get("disparoId"));
  const resultado = await pausarDisparo(obterDb(), { organizacaoId: operador.organizacaoId, disparoId: disparo.id, motivo: `Pausado por ${operador.nome}.`, ator: operador.id, agora: new Date() });
  voltar(disparo.id, resultado.ok ? "Disparo pausado. O que já saiu, saiu; o resto espera você retomar." : resultado.erro);
}

export async function retomarDisparoDoPainel(formData: FormData) {
  const { operador, disparo } = await disparoDoOperador(formData.get("disparoId"));
  const resultado = await retomarDisparo(obterDb(), { organizacaoId: operador.organizacaoId, disparoId: disparo.id, operadorId: operador.id, agora: new Date() });
  if (resultado.ok) rodarAFilaDepois();
  voltar(disparo.id, resultado.ok ? "Disparo retomado." : resultado.erro);
}

export async function cancelarDisparoDoPainel(formData: FormData) {
  const { operador, disparo } = await disparoDoOperador(formData.get("disparoId"));
  const resultado = await cancelarDisparo(obterDb(), { organizacaoId: operador.organizacaoId, disparoId: disparo.id, operadorId: operador.id, agora: new Date() });
  if (resultado.ok && disparo.status === "rascunho") {
    revalidatePath(ROTA, "layout");
    redirect(`${ROTA}?msg=${encodeURIComponent("Rascunho descartado.")}`);
  }
  voltar(disparo.id, resultado.ok ? `Disparo cancelado. ${resultado.cancelados} não ${resultado.cancelados === 1 ? "sai" : "saem"} mais.` : resultado.erro);
}

export async function tentarDeNovoDoPainel(formData: FormData) {
  const { operador, disparo } = await disparoDoOperador(formData.get("disparoId"));
  const resultado = await tentarDeNovoAsFalhas(obterDb(), { organizacaoId: operador.organizacaoId, disparoId: disparo.id, operadorId: operador.id, agora: new Date() });
  if (resultado.ok) rodarAFilaDepois();
  voltar(disparo.id, resultado.ok ? `${resultado.voltaram} ${resultado.voltaram === 1 ? "envio voltou" : "envios voltaram"} para a fila, com nova conferência.` : resultado.erro);
}
