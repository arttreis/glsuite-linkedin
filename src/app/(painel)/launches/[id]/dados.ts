import "server-only";
import { cache } from "react";
import { MODULOS_DOS_LANCAMENTOS } from "@/domain/modulos";
import { obterDb } from "@/server/db";
import { comOperador, type Operador } from "@/server/db/operador";
import { obterLancamento, type Lancamento } from "@/server/lancamentos/lancamentos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O lançamento da página, lido uma vez por requisição: o layout e a página
 * pedem o mesmo. Sem nenhum dos módulos dos lançamentos, abre o Plano (§4.14);
 * id inválido ou de outra organização, null (a página dá 404).
 */
export const lancamentoDaPagina = cache(async (id: string): Promise<{ operador: Operador; lancamento: Lancamento } | null> => {
  const operador = await exigirOperadorComModulo(MODULOS_DOS_LANCAMENTOS);
  if (!UUID.test(id)) return null;
  const lancamento = await comOperador(obterDb(), operador.id, (tx) => obterLancamento(tx, { id, organizacaoId: operador.organizacaoId }));
  return lancamento ? { operador, lancamento } : null;
});
