"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apagarSegmento, previaDoSegmento, salvarSegmento } from "@/server/contatos/segmentos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import type { Resultado } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";

const ROTA = "/contacts/segments";

export type PreviaNaTela = {
  total: number;
  descricao: string;
  primeiros: { id: string; nome: string; empresa: string | null; whatsapp: string | null; linkedin: boolean }[];
};

/** Quantos o filtro tem agora, a descrição e os primeiros (§4.17), enquanto a pessoa monta o segmento. */
export async function previaDoSegmentoDoPainel(filtros: unknown): Promise<PreviaNaTela> {
  const operador = await exigirOperador();
  const previa = await comOperador(obterDb(), operador.id, (tx) => previaDoSegmento(tx, { organizacaoId: operador.organizacaoId, filtros }));
  return {
    total: previa.total,
    descricao: previa.descricao,
    primeiros: previa.primeiros.map((c) => ({ id: c.id, nome: c.nome, empresa: c.empresa, whatsapp: c.whatsapp, linkedin: c.linkedin })),
  };
}

export async function salvarSegmentoDoPainel(entrada: { id: string | null; nome: string; filtros: unknown }): Promise<Resultado<{ id: string }>> {
  const operador = await exigirOperador();
  const id = entrada.id === null ? null : z.uuid().parse(entrada.id);
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarSegmento(tx, { organizacaoId: operador.organizacaoId, id, nome: entrada.nome, filtros: entrada.filtros, operadorId: operador.id, agora: new Date() }),
  );
  if (resultado.ok) revalidatePath("/contacts", "layout");
  return resultado;
}

export async function apagarSegmentoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const id = z.uuid().parse(formData.get("segmentoId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    apagarSegmento(tx, { id, organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  revalidatePath("/contacts", "layout");
  redirect(`${ROTA}?msg=${encodeURIComponent(resultado.ok ? "Segmento apagado." : resultado.erro)}`);
}
