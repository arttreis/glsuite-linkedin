"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODULOS_DOS_LANCAMENTOS } from "@/domain/modulos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import {
  criarLancamento,
  encerrarLancamento,
  pausarLancamento,
  porNoAr,
  retomarLancamento,
  salvarLancamento,
  salvarSdrDoLancamento,
} from "@/server/lancamentos/lancamentos";
import type { Resultado } from "@/server/publicos/publicos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

const ROTA = "/launches";

/**
 * As ações dos lançamentos (§4.21). Recusam sem nenhum dos módulos dos
 * lançamentos (§4.14), mesmo chamadas direto; o servidor confere de novo.
 */
async function operadorDosLancamentos() {
  return exigirOperadorComModuloNaAcao(MODULOS_DOS_LANCAMENTOS);
}

function depois<T extends Resultado<object>>(resultado: T): T {
  if (resultado.ok) revalidatePath(ROTA, "layout");
  return resultado;
}

export async function criarLancamentoDoPainel(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const operador = await operadorDosLancamentos();
  return depois(
    await comOperador(obterDb(), operador.id, (tx) =>
      criarLancamento(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, entrada, agora: new Date() }),
    ),
  );
}

export async function salvarLancamentoDoPainel(id: string, entrada: unknown): Promise<Resultado> {
  const operador = await operadorDosLancamentos();
  const lancamentoId = z.uuid().parse(id);
  return depois(
    await comOperador(obterDb(), operador.id, (tx) =>
      salvarLancamento(tx, { id: lancamentoId, organizacaoId: operador.organizacaoId, entrada, agora: new Date() }),
    ),
  );
}

export async function salvarSdrDoLancamentoDoPainel(id: string, entrada: unknown): Promise<Resultado> {
  const operador = await operadorDosLancamentos();
  const lancamentoId = z.uuid().parse(id);
  return depois(
    await comOperador(obterDb(), operador.id, (tx) =>
      salvarSdrDoLancamento(tx, { id: lancamentoId, organizacaoId: operador.organizacaoId, entrada, agora: new Date() }),
    ),
  );
}

type Transicao = typeof porNoAr;

async function mudarEstado(id: string, transicao: Transicao): Promise<Resultado> {
  const operador = await operadorDosLancamentos();
  const lancamentoId = z.uuid().parse(id);
  return depois(
    await comOperador(obterDb(), operador.id, (tx) =>
      transicao(tx, { id: lancamentoId, organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
    ),
  );
}

export async function porNoArDoPainel(id: string): Promise<Resultado> {
  return mudarEstado(id, porNoAr);
}

export async function pausarLancamentoDoPainel(id: string): Promise<Resultado> {
  return mudarEstado(id, pausarLancamento);
}

export async function retomarLancamentoDoPainel(id: string): Promise<Resultado> {
  return mudarEstado(id, retomarLancamento);
}

export async function encerrarLancamentoDoPainel(id: string): Promise<Resultado> {
  return mudarEstado(id, (tx, p) => encerrarLancamento(tx, { id: p.id, organizacaoId: p.organizacaoId, por: p.operadorId, agora: p.agora }));
}
