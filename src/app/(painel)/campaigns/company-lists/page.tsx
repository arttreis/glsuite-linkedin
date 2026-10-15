import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { listarListas } from "@/server/listas/listas";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { NovaLista } from "./nova-lista";

/** Listas de empresas da organização (§4.11): limitam a busca de qualquer campanha a quem trabalha nelas. */
export default async function ListasDeEmpresasPage() {
  const operador = await exigirOperadorNoApp();
  const listas = await comOperador(obterDb(), operador.id, (tx) => listarListas(tx, operador.organizacaoId));

  return (
    <>
      <Cabecalho
        titulo="Listas de empresas"
        descricao='Uma lista de empresas faz a busca de uma campanha procurar só pessoas que trabalham nelas. Escolha a lista na aba Leads da campanha, em "Só nestas empresas". A mesma lista serve para várias campanhas.'
        voltar={{ href: "/campaigns", rotulo: "Campanhas" }}
      />
      <div className="flex max-w-5xl flex-col gap-6">
        {listas.length === 0 ? (
          <p className="vazio">Nenhuma lista ainda. Crie a primeira aqui embaixo.</p>
        ) : (
          <div className="tabela-moldura">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Lista</th>
                  <th className="numero">Empresas</th>
                  <th className="numero">Prontas para a busca</th>
                  <th className="numero">Esperando você escolher</th>
                  <th className="numero">Ainda não procuradas</th>
                </tr>
              </thead>
              <tbody>
                {listas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/campaigns/company-lists/${l.id}`} className="link font-medium">
                        {l.nome}
                      </Link>
                    </td>
                    <td className="numero">{l.total}</td>
                    <td className="numero">{l.achadas + l.semPagina}</td>
                    <td className="numero">{l.escolher}</td>
                    <td className="numero">{l.aProcurar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="cartao p-5" aria-labelledby="titulo-nova-lista">
          <h2 id="titulo-nova-lista" className="text-[15px] font-semibold">
            Nova lista
          </h2>
          <p className="mt-1 mb-4 text-[13px] text-tinta-suave">Só os nomes das empresas bastam. Repetidas entram uma vez.</p>
          <NovaLista />
        </section>
      </div>
    </>
  );
}
