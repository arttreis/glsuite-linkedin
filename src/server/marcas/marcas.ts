import type { CorDaTag } from "@/domain/contatos";
import { semAcentos } from "@/domain/texto";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

export type Marca = { id: string; nome: string; cor: CorDaTag; inicial: string; status: "ativa" | "pausada" | "arquivada" };

export { COOKIE_DA_MARCA } from "@/domain/marcas";

/** Recusa de uma ação feita numa janela que ficou para trás de uma troca de marca. */
export class MarcaTrocadaEmOutraJanela extends Error {
  constructor(readonly marca: string) {
    super(`Você trocou para a ${marca} em outra janela. Recarregue a página para continuar.`);
  }
}

/** A letra do selo: a primeira do nome, maiúscula e sem acento. */
export function inicial(nome: string): string {
  return semAcentos(nome.trim().charAt(0)).toUpperCase();
}

/** Por nome, como as pessoas leem: sem diferença de caixa nem de acento. */
export function porNome<T extends { id: string; nome: string }>(marcas: T[]): T[] {
  return [...marcas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

/**
 * As marcas ativas e pausadas que o operador pode ver, por nome. Admin: todas
 * as da organização. Roda pela conexão do sistema (a mesma conta que o RLS faz
 * em `pode_ver_marca`), porque é a base de `buscarOperadorAtivo`.
 */
export async function marcasDoOperador(db: Db, operadorId: string): Promise<Marca[]> {
  const linhas = await db.query<Omit<Marca, "inicial">>(
    `select m.id, m.nome, m.cor, m.status
       from public.marcas m join public.operadores o on o.organizacao_id = m.organizacao_id
      where o.id = $1::uuid and o.ativo and m.status in ('ativa', 'pausada')
        and (o.papel = 'admin' or exists (
              select 1 from public.acessos_das_marcas a where a.operador_id = o.id and a.marca_id = m.id))`,
    [operadorId],
  );
  return porNome(linhas.map((linha) => ({ ...linha, inicial: inicial(linha.nome) })));
}

/**
 * Troca a marca atual do operador (§4.30). Confere o acesso e o kill switch,
 * grava operadores.marca_atual_id e o evento 'marca_trocada'. A troca vale para
 * o app inteiro, em todas as janelas.
 */
export async function trocarDeMarca(
  db: Db,
  p: { operadorId: string; marcaId: string; agora: Date },
): Promise<{ ok: true; marca: Marca } | { ok: false; erro: string }> {
  const { ativo } = await lerConfiguracao(db, "marcas");
  if (!ativo) return { ok: false, erro: "A troca de marca está desligada." };

  const marca = (await marcasDoOperador(db, p.operadorId)).find((m) => m.id === p.marcaId);
  if (!marca) return { ok: false, erro: "Você não tem acesso a essa marca." };

  return db.transacao(async (tx) => {
    const [antes] = await tx.query<{ marca_atual_id: string | null }>(
      "select marca_atual_id from public.operadores where id = $1::uuid for update",
      [p.operadorId],
    );
    if (antes?.marca_atual_id === marca.id) return { ok: true, marca };
    await tx.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [p.operadorId, marca.id]);
    await registrarEvento(tx, {
      tipo: "marca_trocada",
      entidade: "operador",
      entidadeId: p.operadorId,
      payload: { de: antes?.marca_atual_id ?? null, para: marca.id },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true, marca };
  });
}
