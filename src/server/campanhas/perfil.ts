import type { ContextoDoPerfil } from "@/domain/campanha";
import type { Praca } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";

export async function contextoDoPerfil(db: Db, perfilId: string): Promise<ContextoDoPerfil & { idioma: string }> {
  const [perfil] = await db.query<{
    praca: Praca;
    palavras_proibidas: string[];
    limite_nota_convite: number;
    link_agenda: string | null;
    idioma: string;
  }>(
    `select praca, palavras_proibidas, limite_nota_convite, link_agenda, idioma
       from public.perfis where id = $1::uuid`,
    [perfilId],
  );
  if (!perfil) throw new Error("Perfil não encontrado");
  return {
    praca: perfil.praca,
    palavrasProibidas: perfil.palavras_proibidas,
    limiteNotaConvite: perfil.limite_nota_convite,
    linkDeAgenda: perfil.link_agenda,
    idioma: perfil.idioma,
  };
}
