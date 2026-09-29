import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { FormularioImportacao, type OpcaoDeCampanha } from "./formulario";

export default async function ImportarPage() {
  const operador = await exigirOperador();
  const campanhas = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<OpcaoDeCampanha>(`
      select c.id, c.nome, p.nome as perfil
        from public.campanhas c join public.perfis p on p.id = c.perfil_id
       where c.status in ('rascunho', 'ativa', 'pausada')
       order by p.nome, c.nome`),
  );

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold">Importar lista</h1>
      <p className="mb-5 mt-1 text-sm text-neutral-600">
        A lista entra na triagem da campanha. Quem tem opt-out não entra; quem é de outro perfil aparece bloqueado com o
        motivo.
      </p>
      <FormularioImportacao campanhas={campanhas} />
    </section>
  );
}
