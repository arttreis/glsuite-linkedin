import { FileUp } from "lucide-react";
import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { BuscaDeLeads, type OpcaoDeCampanha } from "./busca";

export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  const operador = await exigirOperador();
  const params = await searchParams;
  const campanhas = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<OpcaoDeCampanha>(`
      select c.id, c.nome, p.nome as perfil
        from public.campanhas c join public.perfis p on p.id = c.perfil_id
       where c.status in ('rascunho', 'ativa', 'pausada')
       order by p.nome, c.nome`),
  );
  const pedida = typeof params.campanha === "string" ? params.campanha : null;
  const campanhaInicial = campanhas.find((c) => c.id === pedida)?.id ?? campanhas[0]?.id ?? "";

  return (
    <>
      <Cabecalho
        titulo="Buscar leads"
        descricao="Procure pessoas no LinkedIn com a conta do perfil da campanha. Nada entra na base até você escolher quem levar para a triagem."
      >
        <Link href="/importar" className="botao">
          <FileUp aria-hidden />
          Importar arquivo
        </Link>
      </Cabecalho>
      <BuscaDeLeads campanhas={campanhas} campanhaInicial={campanhaInicial} />
    </>
  );
}
