import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { podeAbrir, type IdDoPassoInicial } from "@/domain/primeiro-acesso";
import { estadoDoPrimeiroAcesso, type EstadoDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { obterDb } from "@/server/db";
import { comOperador, type Operador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";

/**
 * Operador ainda no primeiro acesso. Quem já terminou vai para o app. Uma
 * consulta por requisição: o layout e a página pedem o mesmo estado.
 */
export const exigirOperadorNoPrimeiroAcesso = cache(
  async (): Promise<{ operador: Operador; estado: EstadoDoPrimeiroAcesso }> => {
    const operador = await exigirOperador();
    if (operador.primeiroAcessoConcluido) redirect("/");
    const estado = await comOperador(obterDb(), operador.id, (tx) => estadoDoPrimeiroAcesso(tx));
    return { operador, estado };
  },
);

/**
 * Abre um passo do primeiro acesso (§2.1). Passo da frente, que ainda depende
 * de outro, manda para o passo atual.
 */
export async function abrirPasso(
  passo: IdDoPassoInicial,
): Promise<{ operador: Operador; estado: EstadoDoPrimeiroAcesso }> {
  const resultado = await exigirOperadorNoPrimeiroAcesso();
  if (!podeAbrir(passo, resultado.estado.feitos)) redirect(`/comecar/${resultado.estado.atual}`);
  return resultado;
}
