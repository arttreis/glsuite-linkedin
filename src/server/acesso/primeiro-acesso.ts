import { randomUUID } from "node:crypto";
import { emailLiberado, nomeDoEmail } from "@/domain/acesso";
import { passoAtual, type IdDoPassoInicial } from "@/domain/primeiro-acesso";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { dossieConfirmado, salvarDossie, type ResultadoDaEdicao } from "@/server/oferta/oferta";
import { renomearOrganizacao } from "@/server/organizacao/organizacao";

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
 * fecha a aba volta para o passo em que parou. Roda como o operador. O SDR está
 * feito quando a pessoa disse "ficou bom" no chat de teste (SDR-43); os leads,
 * quando ela seguiu com a prévia (SDR-44); a abordagem, quando ela disse "pode
 * entrar em contato" (SDR-45). O LinkedIn entra com o SDR-46.
 */
export async function estadoDoPrimeiroAcesso(db: Db): Promise<EstadoDoPrimeiroAcesso> {
  const [linha] = await db.query<{ site: boolean; analise: boolean; sdr: boolean; leads: boolean; abordagem: boolean }>(
    `select exists (select 1 from public.ofertas) as site,
            exists (select 1 from public.ofertas where dossie_confirmado is not null) as analise,
            exists (select 1 from public.sdrs where aprovado_em is not null) as sdr,
            exists (select 1 from public.previas where confirmada_em is not null) as leads,
            exists (select 1 from public.abordagens where permitida_em is not null) as abordagem`,
  );
  const feitos = new Set<IdDoPassoInicial>();
  if (linha?.site) feitos.add("site");
  if (linha?.analise) feitos.add("analise");
  if (linha?.sdr) feitos.add("sdr");
  if (linha?.leads) feitos.add("leads");
  if (linha?.abordagem) feitos.add("abordagem");
  return { feitos, atual: passoAtual(feitos) };
}

/**
 * Confirma a análise do site (§4.2). Enquanto a organização está no primeiro
 * acesso, ela ganha o nome da empresa que a análise trouxe, no lugar do
 * provisório; depois disso, o nome só muda em Configurações. Roda como o
 * operador: o RLS garante a organização, e só o admin renomeia.
 */
export async function confirmarAnalise(
  db: Db,
  p: { organizacaoId: string; dossie: unknown; operadorId: string; agora: Date },
): Promise<ResultadoDaEdicao> {
  const salvo = await salvarDossie(db, { ...p, confirmar: true });
  if (!salvo.ok) return salvo;

  const [organizacao] = await db.query<{ nome: string; no_primeiro_acesso: boolean }>(
    "select nome, primeiro_acesso_em is null as no_primeiro_acesso from public.organizacoes where id = $1::uuid",
    [p.organizacaoId],
  );
  const confirmado = await dossieConfirmado(db, p.organizacaoId);
  const nome = confirmado?.empresa.nome.trim();
  if (organizacao?.no_primeiro_acesso && nome && nome !== organizacao.nome) {
    // Nome curto demais ou operador que não é admin: fica o nome de antes, sem travar a confirmação.
    await renomearOrganizacao(db, { organizacaoId: p.organizacaoId, nome, operadorId: p.operadorId, agora: p.agora });
  }
  return { ok: true };
}
