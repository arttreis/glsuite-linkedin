import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { EMPRESAS_NA_TELA, obterLista } from "@/server/listas/listas";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { TelaDaLista } from "./lista";

// "Procurar no LinkedIn" consulta até 20 empresas com pausa de 1 a 3 s entre elas: até 1 minuto por chamada.
export const maxDuration = 300;

/** Uma lista de empresas: procurar no LinkedIn, escolher a página certa, adicionar, tirar, renomear e apagar. */
export default async function ListaDeEmpresasPage({ params }: PageProps<"/campaigns/company-lists/[id]">) {
  const operador = await exigirOperadorNoApp();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lista = await comOperador(obterDb(), operador.id, (tx) => obterLista(tx, id));
  if (!lista) notFound();
  const total = Object.values(lista.contagem).reduce((soma, n) => soma + n, 0);

  return (
    <>
      <Cabecalho
        titulo={lista.nome}
        descricao={`${total} ${total === 1 ? "empresa" : "empresas"}. A busca da campanha procura pessoas que trabalham nelas.`}
        voltar={{ href: "/campaigns/company-lists", rotulo: "Listas de empresas" }}
      />
      <div className="flex max-w-5xl flex-col gap-6">
        {lista.campanhas.length > 0 && (
          <p className="text-[13px] text-tinta-suave">
            Usada na busca de:{" "}
            {lista.campanhas.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/campaigns/${c.id}?tab=leads`} className="link">
                  {c.nome}
                </Link>
              </span>
            ))}
            . Quando a lista muda, a busca dessas campanhas recomeça do início da lista; quem já entrou não entra de novo.
          </p>
        )}
        <TelaDaLista lista={lista} limiteNaTela={EMPRESAS_NA_TELA} />
      </div>
    </>
  );
}
