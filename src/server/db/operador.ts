import type { CorDaTag } from "@/domain/contatos";
import { ehModulo, MODULOS, type Modulo } from "@/domain/modulos";
import { marcasDoOperador, type Marca } from "@/server/marcas/marcas";
import type { Db } from "./tipos";

/**
 * Roda `fn` numa transação como o operador logado: role `authenticated` e o
 * `sub` do JWT nas claims, do mesmo jeito que o PostgREST do Supabase faz. Assim
 * o RLS vale para tudo que o painel lê e escreve.
 *
 * Use no nível mais alto da requisição: tudo dentro da transação passa a ser
 * feito como o operador.
 */
export function comOperador<T>(db: Db, operadorId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transacao(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1::text, true)", [
      JSON.stringify({ sub: operadorId, role: "authenticated" }),
    ]);
    await tx.query("set local role authenticated");
    return fn(tx);
  });
}

export type Operador = {
  id: string;
  nome: string;
  email: string;
  papel: "admin" | "operador";
  organizacaoId: string;
  organizacaoNome: string;
  /** A organização terminou o primeiro acesso (§4.1). Com só o SDR no LinkedIn, sem isso só `/onboarding` abre (§4.14). */
  primeiroAcessoConcluido: boolean;
  /** Os módulos ligados da organização, na ordem do catálogo (§4.14). */
  modulos: Modulo[];
  /**
   * A marca em que o operador está (§4.30). Com `marcas` vazia, os três vêm
   * vazios (cor `cinza`): o app abre a tela de sem marca antes de usá-los.
   */
  marcaId: string;
  marcaNome: string;
  marcaCor: CorDaTag;
  /** As marcas que o operador pode ver, por nome (`marcasDoOperador`). */
  marcas: Marca[];
};

/**
 * Operador ativo pelo id do usuário do Supabase Auth, ou null. Com
 * `marca_atual_id` nulo ou numa marca que ele não vê mais, o operador cai na
 * primeira marca ativa que pode ver, e o banco é corrigido. Roda pela conexão
 * do sistema.
 */
export async function buscarOperadorAtivo(db: Db, userId: string): Promise<Operador | null> {
  const [operador] = await db.query<
    Omit<Operador, "modulos" | "marcaId" | "marcaNome" | "marcaCor" | "marcas"> & { modulos: string[]; marcaAtualId: string | null }
  >(
    `select o.id, o.nome, o.email, o.papel, o.organizacao_id as "organizacaoId", g.nome as "organizacaoNome",
            g.primeiro_acesso_em is not null as "primeiroAcessoConcluido",
            coalesce(array(select m.modulo from public.modulos_da_organizacao m
                            where m.organizacao_id = g.id and m.ativo), '{}') as modulos,
            o.marca_atual_id as "marcaAtualId"
       from public.operadores o join public.organizacoes g on g.id = o.organizacao_id
      where o.id = $1::uuid and o.ativo`,
    [userId],
  );
  if (!operador) return null;
  const { marcaAtualId, ...dados } = operador;
  const ligados = new Set(dados.modulos.filter(ehModulo));
  const marcas = await marcasDoOperador(db, dados.id);
  const atual =
    marcas.find((marca) => marca.id === marcaAtualId) ?? marcas.find((marca) => marca.status === "ativa") ?? marcas[0];
  if (atual && atual.id !== marcaAtualId) {
    await db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [dados.id, atual.id]);
  }
  return {
    ...dados,
    modulos: MODULOS.filter((modulo) => ligados.has(modulo)),
    marcaId: atual?.id ?? "",
    marcaNome: atual?.nome ?? "",
    marcaCor: atual?.cor ?? "cinza",
    marcas,
  };
}
