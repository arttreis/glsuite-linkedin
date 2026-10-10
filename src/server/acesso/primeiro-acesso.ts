import { randomUUID } from "node:crypto";
import { emailLiberado, nomeDoEmail } from "@/domain/acesso";
import { passoAtual, type IdDoPassoInicial } from "@/domain/primeiro-acesso";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

export type ResultadoDoPrimeiroAcesso = { operadorId: string; criouOrganizacao: boolean } | null;

/**
 * Garante o operador de quem acabou de entrar (§4.1). Quem já é operador segue
 * como está, inclusive o desativado, que não ganha organização nova. E-mail de
 * domínio liberado sem operador ganha uma organização própria e vira admin
 * dela. Os outros ficam sem operador e voltam para o login.
 *
 * Roda com a conexão do sistema: quem ainda não é operador não passa no RLS. O
 * lock pelo id do usuário faz dois callbacks ao mesmo tempo criarem uma
 * organização só.
 */
export async function garantirOperadorDoPrimeiroAcesso(
  db: Db,
  p: { userId: string; email: string | null; dominios: readonly string[]; agora: Date },
): Promise<ResultadoDoPrimeiroAcesso> {
  return db.transacao(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`primeiro-acesso:${p.userId}`]);
    const [existente] = await tx.query<{ id: string; ativo: boolean }>(
      "select id, ativo from public.operadores where id = $1::uuid",
      [p.userId],
    );
    if (existente) return existente.ativo ? { operadorId: existente.id, criouOrganizacao: false } : null;

    const email = p.email?.trim().toLowerCase();
    if (!email || !emailLiberado(email, p.dominios)) return null;

    // E-mail já usado por outro operador (outro usuário do Auth): não duplica.
    const [mesmoEmail] = await tx.query("select 1 from public.operadores where lower(email) = $1", [email]);
    if (mesmoEmail) return null;

    const nome = nomeDoEmail(email);
    const [organizacao] = await tx.query<{ id: string }>(
      "insert into public.organizacoes (slug, nome, criado_em, atualizado_em) values ($1, $2, $3, $3) returning id",
      [`org-${randomUUID().slice(0, 8)}`, `Empresa de ${nome}`.slice(0, 80), p.agora],
    );
    await tx.query(
      `insert into public.operadores (id, nome, email, papel, ativo, organizacao_id, criado_em)
       values ($1::uuid, $2, $3, 'admin', true, $4::uuid, $5)`,
      [p.userId, nome, email, organizacao!.id, p.agora],
    );
    await registrarEvento(tx, {
      tipo: "organizacao_criada",
      entidade: "organizacao",
      entidadeId: organizacao!.id,
      payload: { email, origem: "primeiro_acesso" },
      ator: p.userId,
      em: p.agora,
    });
    return { operadorId: p.userId, criouOrganizacao: true };
  });
}

export type EstadoDoPrimeiroAcesso = { feitos: Set<IdDoPassoInicial>; atual: IdDoPassoInicial };

/**
 * Onde a organização está no primeiro acesso, tirado dos próprios dados: quem
 * fecha a aba volta para o passo em que parou. Roda como o operador. Os passos
 * do SDR em diante entram com os tickets que os constroem (SDR-42 a SDR-46).
 */
export async function estadoDoPrimeiroAcesso(db: Db): Promise<EstadoDoPrimeiroAcesso> {
  const [linha] = await db.query<{ site: boolean; analise: boolean }>(
    `select exists (select 1 from public.ofertas) as site,
            exists (select 1 from public.ofertas where dossie_confirmado is not null) as analise`,
  );
  const feitos = new Set<IdDoPassoInicial>();
  if (linha?.site) feitos.add("site");
  if (linha?.analise) feitos.add("analise");
  return { feitos, atual: passoAtual(feitos) };
}
