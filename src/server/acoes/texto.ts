import { contextoDeValidacao } from "@/domain/campanha";
import { passoDoToque, sequencia, type PassoDaSequencia } from "@/domain/sequencia";
import { renderizarTemplate } from "@/domain/template";
import { validarMensagem, type Toque, type Violacao } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";
import { contextoDoPerfil } from "@/server/campanhas/perfil";

export type TextoPreparado =
  | { ok: true; texto: string; origem: "template" | "ia" | "humano" }
  /** `texto`: o que falhou, quando deu para montar (a fila mostra para correção). */
  | { ok: false; violacoes: Violacao[]; texto?: string };

type AcaoParaTexto = {
  tipo: "convite" | "dm";
  toque: Toque | null;
  origem: "template" | "ia" | "humano";
  texto_final: string | null;
  texto_gerado: string | null;
  perfil_id: string;
  sequencia: unknown;
  primeiro_nome: string | null;
  empresa: string | null;
};

/**
 * Texto final de uma ação de convite ou DM, já validado com o lead de verdade.
 * Ordem: texto final aprovado ou editado > texto gerado (IA) > template da
 * campanha renderizado. Qualquer violação devolve a lista e nada sai.
 */
export async function prepararTexto(db: Db, acaoId: string): Promise<TextoPreparado> {
  const [acao] = await db.query<AcaoParaTexto>(
    `select a.tipo, a.toque, a.origem, a.texto_final, a.texto_gerado, a.perfil_id,
            c.sequencia, pe.primeiro_nome, pe.empresa
       from public.acoes a
       join public.leads l on l.id = a.lead_id
       join public.campanhas c on c.id = l.campanha_id
       join public.pessoas pe on pe.id = l.pessoa_id
      where a.id = $1::uuid`,
    [acaoId],
  );
  if (!acao) return { ok: false, violacoes: [{ regra: "vazio", mensagem: "Ação não encontrada." }] };

  const passos = sequencia.safeParse(acao.sequencia);
  const passo: PassoDaSequencia | null = acao.toque && passos.success ? (passoDoToque(passos.data, acao.toque) ?? null) : null;

  let texto = acao.texto_final ?? acao.texto_gerado;
  if (texto === null) {
    if (!passo) return { ok: false, violacoes: [{ regra: "vazio", mensagem: "Sem template para este toque na campanha." }] };
    const renderizado = renderizarTemplate(passo.template, { first_name: acao.primeiro_nome, company: acao.empresa });
    if (!renderizado.ok) return { ok: false, violacoes: [{ regra: "token_nao_resolvido", mensagem: renderizado.erro }] };
    texto = renderizado.texto;
  }

  const perfil = await contextoDoPerfil(db, acao.perfil_id);
  const contexto = { ...contextoDeValidacao(perfil, passo, acao.origem), tipo: acao.tipo };
  const { ok, violacoes } = validarMensagem(texto, contexto);
  return ok ? { ok: true, texto, origem: acao.origem } : { ok: false, violacoes, texto };
}

/**
 * Falha no validador: a ação vai para a fila de revisão humana com o motivo
 * (§4.2). O texto não é corrigido automaticamente.
 */
export async function enviarParaRevisao(db: Db, acaoId: string, violacoes: Violacao[], texto?: string): Promise<void> {
  await db.query(
    `update public.acoes
        set status = 'aguardando_aprovacao', motivo_revisao = $2, validacao = $3::jsonb,
            texto_gerado = coalesce(texto_gerado, $4)
      where id = $1::uuid`,
    [acaoId, violacoes.map((v) => v.mensagem).join(" "), JSON.stringify({ ok: false, violacoes }), texto ?? null],
  );
}
