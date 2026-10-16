"use server";

import { z } from "zod";
import { obterDb } from "@/server/db";
import { obterUnipile } from "@/server/dependencias";
import { importarDaBusca } from "@/server/importacao/busca";
import { importarPessoas, type ResumoDaImportacao } from "@/server/importacao/importar";
import { exigirCampanhaDoOperador } from "@/server/painel/autorizacao";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

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

export type RespostaDaImportacao = { ok: true; resumo: ResumoDaImportacao } | { ok: false; erro: string };

export async function importarArquivo(entrada: z.input<typeof entradaDoArquivo>): Promise<RespostaDaImportacao> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
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

const entradaDaBusca = z.object({
  campanhaId: z.uuid(),
  consulta: z.string().trim().min(2).max(2000),
  limite: z.coerce.number().int().min(1).max(500),
});

export async function importarBuscaDaUnipile(entrada: z.input<typeof entradaDaBusca>): Promise<RespostaDaImportacao> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const dados = entradaDaBusca.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Informe a URL da busca ou as palavras-chave." };
  try {
    await exigirCampanhaDoOperador(operador.id, dados.data.campanhaId);
    const consulta = dados.data.consulta;
    const busca = /^https?:\/\//.test(consulta) ? { url: consulta } : { keywords: consulta };
    const { resumo } = await importarDaBusca(
      { db: obterDb(), unipile: obterUnipile() },
      { campanhaId: dados.data.campanhaId, busca, limite: dados.data.limite, operadorId: operador.id, agora: new Date() },
    );
    return { ok: true, resumo };
  } catch (erro) {
    return { ok: false, erro: (erro as Error).message };
  }
}
