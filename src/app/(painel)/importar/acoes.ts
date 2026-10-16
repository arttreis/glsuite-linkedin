"use server";

import { z } from "zod";
import { obterDb } from "@/server/db";
import type { RespostaDaImportacao } from "@/components/resultado-da-importacao";
import { obterUnipile } from "@/server/dependencias";
import { importarPessoas } from "@/server/importacao/importar";
import { exigirCampanhaDoOperador } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";

const pessoaImportada = z.object({
  providerId: z.string().nullable(),
  publicIdentifier: z.string().nullable(),
  urlPublica: z.url(),
  nome: z.string().min(1),
  primeiroNome: z.string().nullable(),
  cargo: z.string().nullable(),
  empresa: z.string().nullable(),
  empresaDominio: z.string().nullable(),
  empresaChave: z.string().nullable(),
  localizacao: z.string().nullable(),
  coletadoEm: z.iso.datetime().nullable(),
});

const entradaDoArquivo = z.object({
  campanhaId: z.uuid(),
  fonte: z.enum(["csv", "apify"]),
  arquivoNome: z.string().max(200),
  pessoas: z.array(pessoaImportada).max(3000),
  invalidas: z.array(z.object({ linha: z.number(), motivo: z.string() })).max(3000),
});

export async function importarArquivo(entrada: z.input<typeof entradaDoArquivo>): Promise<RespostaDaImportacao> {
  const operador = await exigirOperador();
  const dados = entradaDoArquivo.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Arquivo com dados fora do formato esperado." };
  try {
    await exigirCampanhaDoOperador(operador.id, dados.data.campanhaId);
    const { resumo } = await importarPessoas(
      { db: obterDb(), unipile: obterUnipile() },
      { ...dados.data, operadorId: operador.id, agora: new Date() },
    );
    return { ok: true, resumo };
  } catch (erro) {
    return { ok: false, erro: (erro as Error).message };
  }
}
