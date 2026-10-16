import { Cabecalho } from "@/components/cabecalho";
import { FILTRO_VAZIO } from "@/domain/filtro-de-contatos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { opcoesDoEditor } from "../dados";
import { EditorDeSegmento } from "../editor-de-segmento";

/** Novo segmento (§4.17). */
export default async function NovoSegmentoPage() {
  const operador = await exigirOperadorNoApp();
  const { tags, campanhas } = await comOperador(obterDb(), operador.id, (tx) => opcoesDoEditor(tx, operador.organizacaoId));
  return (
    <>
      <Cabecalho
        titulo="Novo segmento"
        descricao="Escolha as condições. Todas valem juntas, e ao lado aparece quantos contatos cumprem agora."
        voltar={{ href: "/contacts/segments", rotulo: "Segmentos" }}
      />
      <div className="max-w-6xl">
        <EditorDeSegmento
          segmento={{ id: null, nome: "", filtros: FILTRO_VAZIO }}
          tags={tags}
          campanhas={campanhas}
          comLinkedin={operador.modulos.includes("linkedin")}
        />
      </div>
    </>
  );
}
