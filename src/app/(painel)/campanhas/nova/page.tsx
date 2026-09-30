import { exigirOperador } from "@/server/supabase/servidor";
import { dadosDoEditor } from "../dados";
import { EditorDeCampanha } from "../editor";

export default async function NovaCampanhaPage() {
  const operador = await exigirOperador();
  const { perfis, angulos, exemplo } = await dadosDoEditor(operador.id);

  return (
    <section className="max-w-4xl">
      <h1 className="mb-5 text-xl font-semibold">Nova campanha</h1>
      {perfis.length === 0 ? (
        <p className="text-sm text-neutral-600">Você não opera nenhum perfil.</p>
      ) : (
        <EditorDeCampanha perfis={perfis} angulos={angulos} exemplo={exemplo} />
      )}
    </section>
  );
}
