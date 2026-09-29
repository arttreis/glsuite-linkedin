import type { PessoaImportada } from "@/domain/importacao";
import { chaveDaEmpresa, primeiroNome } from "@/domain/texto";
import type { Db } from "@/server/db/tipos";
import { STATUS_SAUDAVEIS } from "@/server/perfis/status-conta";
import type { ClienteUnipile, ResultadoDeBusca } from "@/server/unipile/cliente";
import { importarPessoas } from "./importar";

export function pessoaDaBusca(item: ResultadoDeBusca): PessoaImportada {
  const nome = item.nome ?? [item.primeiroNome, item.sobrenome].filter(Boolean).join(" ");
  return {
    providerId: item.providerId,
    publicIdentifier: item.publicIdentifier,
    urlPublica:
      item.urlPublica?.split("?")[0] ?? `https://www.linkedin.com/in/${item.publicIdentifier ?? item.providerId}`,
    nome: nome || "Sem nome",
    primeiroNome: primeiroNome(nome, item.primeiroNome),
    cargo: item.cargoAtual ?? item.titulo,
    empresa: item.empresaAtual,
    empresaDominio: null,
    empresaChave: chaveDaEmpresa(item.empresaAtual),
    localizacao: item.localizacao,
    coletadoEm: null,
  };
}

/**
 * Importa o resultado de uma busca do LinkedIn feita pela conta do próprio
 * perfil da campanha. A busca usa a conta: só roda com a conta saudável.
 */
export async function importarDaBusca(
  deps: { db: Db; unipile: ClienteUnipile },
  p: { campanhaId: string; busca: { url: string } | { keywords: string }; limite: number; operadorId: string; agora: Date },
) {
  const [perfil] = await deps.db.query<{ account_id: string | null; unipile_status: string | null }>(
    `select pf.unipile_account_id as account_id, pf.unipile_status
       from public.campanhas c join public.perfis pf on pf.id = c.perfil_id
      where c.id = $1::uuid`,
    [p.campanhaId],
  );
  if (!perfil?.account_id) throw new Error("O perfil da campanha não tem LinkedIn conectado.");
  if (perfil.unipile_status && !STATUS_SAUDAVEIS.has(perfil.unipile_status)) {
    throw new Error(`A conta do perfil está com status ${perfil.unipile_status}.`);
  }

  const pessoas: PessoaImportada[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await deps.unipile.buscarPessoas(perfil.account_id, p.busca, cursor);
    pessoas.push(...pagina.itens.map(pessoaDaBusca));
    cursor = pagina.cursor ?? undefined;
  } while (cursor && pessoas.length < p.limite);

  return importarPessoas(deps, {
    campanhaId: p.campanhaId,
    fonte: "unipile_busca",
    pessoas: pessoas.slice(0, p.limite),
    arquivoNome: "url" in p.busca ? p.busca.url : `busca: ${p.busca.keywords}`,
    operadorId: p.operadorId,
    agora: p.agora,
  });
}
