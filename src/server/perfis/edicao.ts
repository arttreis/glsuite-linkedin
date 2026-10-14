import { z } from "zod";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minutos = (texto: string) => Number(texto.slice(0, 2)) * 60 + Number(texto.slice(3, 5));

/** A janela precisa de espaço para as ações com o intervalo de 3 a 12 minutos entre elas. */
const JANELA_MINIMA_MINUTOS = 60;

const edicao = z.object({
  nome: z.string().trim().min(2).max(80),
  inicio: hora,
  fim: hora,
});

/**
 * Nome e janela de uma conta do LinkedIn (§4.12). Roda dentro de `comOperador`:
 * quem decide se pode é o RLS (o admin ou quem vinculou a conta). A janela vale
 * na próxima ação: o despachante confere a janela na hora de enviar.
 */
export async function editarConta(
  db: Db,
  p: { perfilId: string; nome: string; inicio: string; fim: string; operadorId: string; agora: Date },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const lido = edicao.safeParse(p);
  if (!lido.success) {
    const campo = lido.error.issues[0]?.path[0];
    return { ok: false, erro: campo === "nome" ? "O nome precisa ter de 2 a 80 caracteres." : "Use horários no formato 09:00." };
  }
  const { nome, inicio, fim } = lido.data;
  if (minutos(fim) - minutos(inicio) < JANELA_MINIMA_MINUTOS) {
    return { ok: false, erro: "O fim precisa ser pelo menos 1 hora depois do início." };
  }

  const [antes] = await db.query<{ nome: string; inicio: string; fim: string }>(
    "select nome, janela->>'inicio' as inicio, janela->>'fim' as fim from public.perfis where id = $1::uuid and not casa",
    [p.perfilId],
  );
  const alteradas = await db.query(
    `update public.perfis
        set nome = $2, janela = janela || jsonb_build_object('inicio', $3::text, 'fim', $4::text)
      where id = $1::uuid and not casa
      returning id`,
    [p.perfilId, nome, inicio, fim],
  );
  if (!antes || alteradas.length === 0) return { ok: false, erro: "Só o admin ou quem vinculou a conta edita." };

  await registrarEvento(db, {
    tipo: "perfil_editado",
    entidade: "perfil",
    entidadeId: p.perfilId,
    perfilId: p.perfilId,
    payload: { de: antes, para: { nome, inicio, fim } },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}
