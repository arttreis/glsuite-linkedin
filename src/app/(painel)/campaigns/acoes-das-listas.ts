"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_NOME_DA_EMPRESA, NOMES_POR_ENVIO } from "@/domain/lista-de-empresas";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterUnipileSeConfigurada } from "@/server/dependencias";
import {
  adicionarEmpresas,
  apagarLista,
  criarLista,
  escolherEmpresa,
  procurarEmpresas,
  removerEmpresa,
  renomearLista,
} from "@/server/listas/listas";
import type { Resultado } from "@/server/publicos/publicos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

const ROTA = "/campaigns/company-lists";

// O navegador manda os nomes em partes de até `NOMES_POR_ENVIO`: o corpo da server action tem limite.
const nomes = z.array(z.string().max(MAX_NOME_DA_EMPRESA * 2)).max(NOMES_POR_ENVIO);

const revalidar = (listaId?: string) => {
  revalidatePath(ROTA);
  if (listaId) revalidatePath(`${ROTA}/${listaId}`);
};

/** Cria a lista com a primeira parte dos nomes; o resto chega por `adicionarEmpresasDoPainel`. */
export async function criarListaDoPainel(entrada: { nome: string; nomes: string[] }): Promise<Resultado<{ id: string; adicionadas: number; repetidas: number }>> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const lidos = nomes.safeParse(entrada.nomes);
  if (!lidos.success) return { ok: false, erro: `Mande no máximo ${NOMES_POR_ENVIO} nomes por vez.` };
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    criarLista(tx, { organizacaoId: operador.organizacaoId, nome: entrada.nome, nomes: lidos.data, operadorId: operador.id, agora: new Date() }),
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function adicionarEmpresasDoPainel(entrada: { listaId: string; nomes: string[] }): Promise<Resultado<{ adicionadas: number; repetidas: number }>> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const listaId = z.uuid().parse(entrada.listaId);
  const lidos = nomes.safeParse(entrada.nomes);
  if (!lidos.success) return { ok: false, erro: `Mande no máximo ${NOMES_POR_ENVIO} nomes por vez.` };
  const resultado = await comOperador(obterDb(), operador.id, (tx) => adicionarEmpresas(tx, { listaId, nomes: lidos.data, agora: new Date() }));
  if (resultado.ok) revalidar(listaId);
  return resultado;
}

/** Procura no LinkedIn a próxima leva de empresas (até 20). A tela chama de novo até não faltar nenhuma. */
export async function procurarEmpresasDoPainel(entrada: { listaId: string }): Promise<Resultado<{ procuradas: number; faltam: number }>> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const listaId = z.uuid().parse(entrada.listaId);
  const unipile = obterUnipileSeConfigurada();
  if (!unipile) return { ok: false, erro: "A conexão com o LinkedIn (Unipile) não está configurada. Peça ao admin." };
  const resultado = await procurarEmpresas({ db: obterDb(), unipile, agora: () => new Date() }, { listaId, operadorId: operador.id });
  revalidar(listaId);
  return resultado;
}

export async function escolherEmpresaDoPainel(entrada: { listaId: string; empresaId: string; opcaoId: string | null }): Promise<Resultado> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const listaId = z.uuid().parse(entrada.listaId);
  const empresaId = z.uuid().parse(entrada.empresaId);
  const opcaoId = z.string().regex(/^\d+$/).nullable().parse(entrada.opcaoId);
  const resultado = await comOperador(obterDb(), operador.id, (tx) => escolherEmpresa(tx, { empresaId, opcaoId, agora: new Date() }));
  if (resultado.ok) revalidar(listaId);
  return resultado;
}

export async function removerEmpresaDoPainel(entrada: { listaId: string; empresaId: string }): Promise<Resultado> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const listaId = z.uuid().parse(entrada.listaId);
  const empresaId = z.uuid().parse(entrada.empresaId);
  const resultado = await comOperador(obterDb(), operador.id, (tx) => removerEmpresa(tx, { empresaId, agora: new Date() }));
  if (resultado.ok) revalidar(listaId);
  return resultado;
}

export async function renomearListaDoPainel(entrada: { listaId: string; nome: string }): Promise<Resultado> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const listaId = z.uuid().parse(entrada.listaId);
  const resultado = await comOperador(obterDb(), operador.id, (tx) => renomearLista(tx, { listaId, nome: entrada.nome, agora: new Date() }));
  if (resultado.ok) revalidar(listaId);
  return resultado;
}

export async function apagarListaDoPainel(entrada: { listaId: string }): Promise<Resultado> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const listaId = z.uuid().parse(entrada.listaId);
  const resultado = await comOperador(obterDb(), operador.id, (tx) => apagarLista(tx, { listaId }));
  if (resultado.ok) revalidatePath("/campaigns", "layout");
  return resultado;
}
