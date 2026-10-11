import "server-only";
import type { Praca } from "@/domain/validador";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import type { PerfilDoEditor } from "./editor";

/** Perfis que o operador opera, com o contexto que a prévia do validador usa. */
export async function dadosDoEditor(operadorId: string) {
  const db = obterDb();
  return comOperador(db, operadorId, async (tx) => {
    const perfis = await tx.query<{
      id: string;
      nome: string;
      praca: Praca;
      palavras_proibidas: string[];
      limite_nota_convite: number;
    }>(`
      select id, nome, praca, palavras_proibidas, limite_nota_convite
        from public.perfis
       where public.pode_ver_perfil(id)
       order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug)`);
    const angulos = await tx.query<{ nome: string }>("select nome from public.angulos where ativo order by nome");
    return {
      perfis: perfis.map<PerfilDoEditor>((p) => ({
        id: p.id,
        nome: p.nome,
        contexto: {
          praca: p.praca,
          palavrasProibidas: p.palavras_proibidas,
          limiteNotaConvite: p.limite_nota_convite,
        },
      })),
      angulos: angulos.map((a) => a.nome),
      exemplo: await lerConfiguracao(tx, "template_exemplo"),
    };
  });
}
