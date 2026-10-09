import { Cabecalho } from "@/components/cabecalho";
import { exigirOperador } from "@/server/supabase/servidor";
import { dadosDoEditor } from "../dados";
import { EditorDeCampanha } from "../editor";

export default async function NovaCampanhaPage() {
  const operador = await exigirOperador();
  const { perfis, angulos, exemplo } = await dadosDoEditor(operador.id);

  return (
    <>
      <Cabecalho
        titulo="Nova campanha"
        descricao="Os textos passam pelo validador enquanto você escreve. A campanha nasce como rascunho."
        voltar={{ href: "/campanhas", rotulo: "Campanhas" }}
      />
      <div className="max-w-6xl">
        {perfis.length === 0 ? (
          <p className="vazio">Você não opera nenhum perfil. Peça acesso a um perfil para criar campanhas.</p>
        ) : (
          <EditorDeCampanha perfis={perfis} angulos={angulos} exemplo={exemplo} />
        )}
      </div>
    </>
  );
}
