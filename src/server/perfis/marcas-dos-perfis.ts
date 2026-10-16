import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

/**
 * As contas do LinkedIn por marca (§4.30, SDR-108). Uma conta serve a uma ou
 * mais marcas da organização; o teto continua da conta, somando todas (§4.13).
 * Tudo aqui roda como o operador (`comOperador`): o RLS de `marcas_dos_perfis`
 * esconde as marcas que ele não vê, e a tela só conta quantas são.
 */

export type ContaDaMarca = { perfilId: string; nome: string; outrasMarcas: { visiveis: string[]; ocultas: number } };

export type ContaParaLigar = {
  perfilId: string;
  nome: string;
  status: "ativo" | "pausado";
  /** As marcas da conta que o operador vê, por nome. */
  marcas: string[];
  /** As marcas da conta que o operador não vê: só a conta, nunca o nome (LGPD). */
  ocultas: number;
  /** Admin ou quem vinculou a conta: só eles ligam e tiram. */
  podeLigar: boolean;
};

export const MOTIVO_DA_PAUSA_AO_TIRAR = "Conta tirada da marca";
export const ERRO_DA_ULTIMA_MARCA = "Esta é a única marca da conta. Para parar a conta, pause-a.";

const porNome = (nomes: string[]) => [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

/** As contas da marca, com as outras marcas de cada uma: os nomes das que o operador vê e quantas ele não vê. */
export async function perfisDaMarca(db: Db, marcaId: string): Promise<ContaDaMarca[]> {
  const linhas = await db.query<{ perfilId: string; nome: string; visiveis: string[]; total: number }>(
    `select p.id as "perfilId", p.nome,
            array(select m.nome from public.marcas_dos_perfis o join public.marcas m on m.id = o.marca_id
                   where o.perfil_id = p.id and o.marca_id <> $1::uuid) as visiveis,
            public.total_de_marcas_do_perfil(p.id) as total
       from public.marcas_dos_perfis mp join public.perfis p on p.id = mp.perfil_id
      where mp.marca_id = $1::uuid and not p.casa
      order by p.nome, p.id`,
    [marcaId],
  );
  return linhas.map((linha) => ({
    perfilId: linha.perfilId,
    nome: linha.nome,
    outrasMarcas: { visiveis: porNome(linha.visiveis), ocultas: Math.max(0, linha.total - 1 - linha.visiveis.length) },
  }));
}

/** Contas da organização que o operador pode ver, já conectadas, e que não estão na marca. */
export async function contasParaLigar(db: Db, marcaId: string): Promise<ContaParaLigar[]> {
  const linhas = await db.query<Omit<ContaParaLigar, "ocultas"> & { total: number }>(
    `select p.id as "perfilId", p.nome, p.status,
            array(select m.nome from public.marcas_dos_perfis o join public.marcas m on m.id = o.marca_id
                   where o.perfil_id = p.id) as marcas,
            public.total_de_marcas_do_perfil(p.id) as total,
            (public.eh_admin() or p.operador_id = (select auth.uid())) as "podeLigar"
       from public.perfis p
      where not p.casa and p.unipile_account_id is not null and public.pode_ver_perfil(p.id)
        and p.organizacao_id = (select m.organizacao_id from public.marcas m where m.id = $1::uuid)
        and not exists (select 1 from public.marcas_dos_perfis mp where mp.perfil_id = p.id and mp.marca_id = $1::uuid)
      order by p.nome, p.id`,
    [marcaId],
  );
  return linhas.map(({ total, ...linha }) => ({
    ...linha,
    marcas: porNome(linha.marcas),
    ocultas: Math.max(0, total - linha.marcas.length),
  }));
}

type Pedido = { perfilId: string; marcaId: string; operadorId: string; agora: Date };

/** Confere conta, marca e permissão antes de ligar ou tirar. Null quando pode. */
async function recusa(db: Db, p: Pedido): Promise<string | null> {
  const [conta] = await db.query<{ pode: boolean; marca_ok: boolean }>(
    `select exists (select 1 from public.operadores o where o.id = $3::uuid and (o.papel = 'admin' or o.id = p.operador_id)) as pode,
            exists (select 1 from public.marcas m where m.id = $2::uuid and m.organizacao_id = p.organizacao_id
                      and public.pode_ver_marca(m.id)) as marca_ok
       from public.perfis p
      where p.id = $1::uuid and not p.casa and public.pode_ver_perfil(p.id)`,
    [p.perfilId, p.marcaId, p.operadorId],
  );
  if (!conta) return "Você não opera esta conta.";
  if (!conta.marca_ok) return "Você não tem acesso a essa marca.";
  if (!conta.pode) return "Só o admin ou quem vinculou a conta muda as marcas dela.";
  return null;
}

/** "Usar uma conta já conectada": liga a conta à marca. Ligar de novo não muda nada e não retoma campanha (D36). */
export async function ligarPerfilAMarca(db: Db, p: Pedido): Promise<{ ok: true } | { ok: false; erro: string }> {
  return db.transacao(async (tx) => {
    const erro = await recusa(tx, p);
    if (erro) return { ok: false as const, erro };
    const ligadas = await tx.query(
      `insert into public.marcas_dos_perfis (perfil_id, marca_id, ligado_em, ligado_por)
       values ($1::uuid, $2::uuid, $3, $4::uuid)
       on conflict (perfil_id, marca_id) do nothing
       returning marca_id`,
      [p.perfilId, p.marcaId, p.agora, p.operadorId],
    );
    if (ligadas.length > 0) {
      await registrarEvento(tx, {
        tipo: "conta_ligada_a_marca",
        entidade: "perfil",
        entidadeId: p.perfilId,
        perfilId: p.perfilId,
        payload: { marca_id: p.marcaId, origem: "usar_conectada" },
        ator: p.operadorId,
        em: p.agora,
      });
    }
    return { ok: true as const };
  });
}

/**
 * "Tirar desta marca" (D36): pausa as campanhas ativas da marca nesta conta,
 * com o motivo; as conversas ficam como numa campanha pausada. A última marca
 * da conta não sai: para parar a conta, pausa-se a conta.
 */
export async function desligarPerfilDaMarca(
  db: Db,
  p: Pedido,
): Promise<{ ok: true; campanhasPausadas: number } | { ok: false; erro: string }> {
  return db.transacao(async (tx) => {
    // Dois "tirar" ao mesmo tempo, de marcas diferentes, não deixam a conta sem marca.
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`marcas-do-perfil:${p.perfilId}`]);
    const erro = await recusa(tx, p);
    if (erro) return { ok: false as const, erro };

    const [conta] = await tx.query<{ total: number; na_marca: boolean }>(
      `select public.total_de_marcas_do_perfil($1::uuid) as total,
              exists (select 1 from public.marcas_dos_perfis where perfil_id = $1::uuid and marca_id = $2::uuid) as na_marca`,
      [p.perfilId, p.marcaId],
    );
    if (!conta?.na_marca) return { ok: false as const, erro: "A conta não está nesta marca." };
    if (conta.total <= 1) return { ok: false as const, erro: ERRO_DA_ULTIMA_MARCA };

    const tiradas = await tx.query("delete from public.marcas_dos_perfis where perfil_id = $1::uuid and marca_id = $2::uuid returning marca_id", [
      p.perfilId,
      p.marcaId,
    ]);
    if (tiradas.length === 0) return { ok: false as const, erro: "Só o admin ou quem vinculou a conta muda as marcas dela." };

    // A marca da campanha chega com o SDR-107 (#97, campanhas.marca_id). Lida
    // pelo to_jsonb, a conta funciona antes e depois dele: sem a coluna, nenhuma
    // campanha é de marca nenhuma e nada pausa.
    const pausadas = await tx.query<{ id: string }>(
      `update public.campanhas c set status = 'pausada'
        where c.perfil_id = $1::uuid and c.status = 'ativa' and to_jsonb(c) ->> 'marca_id' = $2::text
        returning c.id`,
      [p.perfilId, p.marcaId],
    );
    for (const campanha of pausadas) {
      await registrarEvento(tx, {
        tipo: "campanha_status",
        entidade: "campanha",
        entidadeId: campanha.id,
        perfilId: p.perfilId,
        payload: { de: "ativa", para: "pausada", motivo: MOTIVO_DA_PAUSA_AO_TIRAR },
        ator: p.operadorId,
        em: p.agora,
      });
    }
    await registrarEvento(tx, {
      tipo: "conta_tirada_da_marca",
      entidade: "perfil",
      entidadeId: p.perfilId,
      perfilId: p.perfilId,
      payload: { marca_id: p.marcaId, campanhas_pausadas: pausadas.length },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true as const, campanhasPausadas: pausadas.length };
  });
}

/**
 * Só as contas que estão na marca. Pela conexão do sistema: o Dashboard mostra
 * também as contas da marca que o operador não opera (qualquer um pausa, §4.4),
 * e o RLS de `marcas_dos_perfis` só mostra as que ele vê. A marca vem do
 * operador já conferido (`buscarOperadorAtivo`).
 */
export async function soDaMarca<T extends { id: string }>(db: Db, marcaId: string, contas: T[]): Promise<T[]> {
  const linhas = await db.query<{ perfil_id: string }>("select perfil_id from public.marcas_dos_perfis where marca_id = $1::uuid", [marcaId]);
  const naMarca = new Set(linhas.map((linha) => linha.perfil_id));
  return contas.filter((conta) => naMarca.has(conta.id));
}
