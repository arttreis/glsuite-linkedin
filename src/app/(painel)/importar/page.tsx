import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { FormularioImportacao, type OpcaoDeCampanha } from "./formulario";

export default async function ImportarPage({ searchParams }: PageProps<"/importar">) {
  const operador = await exigirOperador();
  const { campanha } = await searchParams;
  const campanhas = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<OpcaoDeCampanha>(`
      select c.id, c.nome, p.nome as perfil
        from public.campanhas c join public.perfis p on p.id = c.perfil_id
       where c.status in ('rascunho', 'ativa', 'pausada')
       order by p.nome, c.nome`),
  );

  return (
    <>
      <Cabecalho
        titulo="Importar lista"
        descricao="A lista entra na triagem da campanha. Quem tem opt-out não entra; quem é de outro perfil aparece bloqueado com o motivo."
      />
      <div className="max-w-3xl">
        <FormularioImportacao campanhas={campanhas} inicial={typeof campanha === "string" ? campanha : undefined} />
      </div>
    </>
  );
}
