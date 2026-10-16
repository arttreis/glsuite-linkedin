"use server";

import { z } from "zod";
import { descreverFiltros, esquemaDosFiltros, temFiltroDeConteudo, type OpcaoDeFiltro } from "@/domain/busca";
import type { RespostaDaImportacao } from "@/components/resultado-da-importacao";
import { buscarLeads, ErroDaBusca, importarSelecionados, sugerirParametros, type Busca, type PaginaDaBusca } from "@/server/busca/busca";
import { obterDb } from "@/server/db";
import { obterUnipileSeConfigurada } from "@/server/dependencias";
import { exigirCampanhaDoOperador } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";

/** Pessoas por clique em "Buscar" ou "Carregar mais": 5 páginas da busca clássica. */
const POR_CLIQUE = 50;

const SEM_UNIPILE = "A Unipile ainda não está configurada neste ambiente: a busca no LinkedIn não roda.";

// URL de uma busca de pessoas: a comum do LinkedIn ou a do Sales Navigator (só funciona se a conta tiver o plano).
const urlDeBusca = z
  .url()
  .max(2000)
  .refine((valor) => {
    if (!URL.canParse(valor)) return false;
    const url = new URL(valor);
    return (
      url.protocol === "https:" &&
      /(^|\.)linkedin\.com$/.test(url.hostname) &&
      /^\/(search\/results\/people|sales\/search\/people)/.test(url.pathname)
    );
  });

const busca = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("filtros"), filtros: esquemaDosFiltros }),
  z.object({ modo: z.literal("url"), url: urlDeBusca }),
]);

export type BuscaDoFormulario = z.input<typeof busca>;
export type { PessoaEncontrada } from "@/server/busca/busca";

function paraBusca(entrada: z.output<typeof busca>): Busca {
  return entrada.modo === "url" ? { url: entrada.url } : { filtros: entrada.filtros };
}

const entradaDaBusca = z.object({
  campanhaId: z.uuid(),
  busca,
  cursor: z.string().min(1).max(4000).nullable().default(null),
});

export type RespostaDaBusca = ({ ok: true } & PaginaDaBusca) | { ok: false; erro: string };

export async function buscar(entrada: z.input<typeof entradaDaBusca>): Promise<RespostaDaBusca> {
  const operador = await exigirOperador();
  const dados = entradaDaBusca.safeParse(entrada);
  if (!dados.success) {
    return {
      ok: false,
      erro:
        entrada.busca?.modo === "url"
          ? "Cole a URL de uma busca de pessoas do LinkedIn (linkedin.com/search/results/people/...)."
          : "Algum filtro está fora do formato. Confira os campos.",
    };
  }
  const { campanhaId, cursor } = dados.data;
  if (dados.data.busca.modo === "filtros" && !temFiltroDeConteudo(dados.data.busca.filtros)) {
    return { ok: false, erro: "Preencha pelo menos um destes: palavras-chave, cargo, empresa, local ou setor." };
  }
  const unipile = obterUnipileSeConfigurada();
  if (!unipile) return { ok: false, erro: SEM_UNIPILE };
  try {
    await exigirCampanhaDoOperador(operador.id, campanhaId);
    const pagina = await buscarLeads(
      { db: obterDb(), unipile },
      { campanhaId, busca: paraBusca(dados.data.busca), cursor, quantidade: POR_CLIQUE, operadorId: operador.id, agora: new Date() },
    );
    return { ok: true, ...pagina };
  } catch (erro) {
    return { ok: false, erro: erro instanceof ErroDaBusca ? erro.message : (erro as Error).message };
  }
}

const entradaDaSugestao = z.object({
  campanhaId: z.uuid(),
  tipo: z.enum(["LOCATION", "INDUSTRY"]),
  texto: z.string().trim().min(2).max(100),
});

/** Autocompletar de local e setor. Qualquer falha vira lista vazia. */
export async function sugerir(entrada: z.input<typeof entradaDaSugestao>): Promise<OpcaoDeFiltro[]> {
  const operador = await exigirOperador();
  const dados = entradaDaSugestao.safeParse(entrada);
  const unipile = obterUnipileSeConfigurada();
  if (!dados.success || !unipile) return [];
  try {
    await exigirCampanhaDoOperador(operador.id, dados.data.campanhaId);
    return await sugerirParametros({ db: obterDb(), unipile }, dados.data);
  } catch {
    return [];
  }
}

const textoOuNulo = z.string().max(500).nullable();

const pessoaEncontrada = z.object({
  providerId: z.string().min(1).max(200),
  nome: textoOuNulo,
  primeiroNome: textoOuNulo,
  sobrenome: textoOuNulo,
  titulo: textoOuNulo,
  localizacao: textoOuNulo,
  publicIdentifier: textoOuNulo,
  urlPublica: z.url().max(500).nullable(),
  empresaAtual: textoOuNulo,
  cargoAtual: textoOuNulo,
  distancia: z.enum(["FIRST_DEGREE", "SECOND_DEGREE", "THIRD_DEGREE", "OUT_OF_NETWORK"]).nullable(),
  convitePendente: z.boolean(),
});

const entradaDaImportacao = z.object({
  campanhaId: z.uuid(),
  busca,
  selecionados: z.array(pessoaEncontrada).min(1).max(1000),
});

export async function importar(entrada: z.input<typeof entradaDaImportacao>): Promise<RespostaDaImportacao> {
  const operador = await exigirOperador();
  const dados = entradaDaImportacao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Selecione pelo menos uma pessoa da busca." };
  const { campanhaId, selecionados } = dados.data;
  const descricao =
    dados.data.busca.modo === "url" ? `Busca: ${dados.data.busca.url}`.slice(0, 200) : descreverFiltros(dados.data.busca.filtros);
  try {
    await exigirCampanhaDoOperador(operador.id, campanhaId);
    const { resumo } = await importarSelecionados(
      { db: obterDb(), unipile: obterUnipileSeConfigurada() },
      { campanhaId, selecionados, descricao, operadorId: operador.id, agora: new Date() },
    );
    return { ok: true, resumo };
  } catch (erro) {
    return { ok: false, erro: (erro as Error).message };
  }
}
