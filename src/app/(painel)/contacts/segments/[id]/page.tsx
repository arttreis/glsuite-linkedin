import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/cabecalho";
import { obterSegmento } from "@/server/contatos/segmentos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { opcoesDoEditor } from "../dados";
import { EditorDeSegmento } from "../editor-de-segmento";

/** Editar um segmento (§4.17). De outra organização, ou apagado, não abre. */
export default async function SegmentoPage({ params }: PageProps<"/contacts/segments/[id]">) {
  const operador = await exigirOperadorNoApp();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const segmento = await obterSegmento(tx, { id, organizacaoId: operador.organizacaoId });
    return segmento ? { segmento, ...(await opcoesDoEditor(tx, operador.organizacaoId)) } : null;
  });
  if (!dados) notFound();
  return (
    <>
      <Cabecalho titulo={dados.segmento.nome} voltar={{ href: "/contacts/segments", rotulo: "Segmentos" }} />
      <div className="max-w-6xl">
        <EditorDeSegmento
          segmento={{ id: dados.segmento.id, nome: dados.segmento.nome, filtros: dados.segmento.filtros }}
          tags={dados.tags}
          campanhas={dados.campanhas}
          comLinkedin={operador.modulos.includes("linkedin")}
        />
      </div>
    </>
  );
}
