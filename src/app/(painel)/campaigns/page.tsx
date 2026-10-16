import { Building2, Download, Plus } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDaCampanha } from "@/components/etiquetas";
import { listarCampanhas } from "@/server/campanhas/painel";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";

/** Campanha = público × abordagem × conta (§4.11). */
export default async function CampanhasPage({ searchParams }: PageProps<"/campaigns">) {
  const operador = await exigirOperadorComModulo("linkedin");
  const { msg } = await searchParams;
  const campanhas = await comOperador(obterDb(), operador.id, (tx) => listarCampanhas(tx));

  return (
    <>
      <Cabecalho
        titulo="Campanhas"
        descricao="Cada campanha é um público, com a abordagem dele, rodando numa conta do LinkedIn. O teto de envios é da conta, somando as campanhas."
      >
        <a href="/api/exportar/planilha?praca=domestico" className="botao" title="Planilha-espelho dos leads, em CSV">
          <Download aria-hidden />
          Planilha (CSV)
        </a>
        <Link href="/campaigns/company-lists" className="botao" title="Nomes de empresas para a busca procurar pessoas só nelas">
          <Building2 aria-hidden />
          Listas de empresas
        </Link>
        <Link href="/campaigns/new" className="botao botao-primario">
          <Plus aria-hidden />
          Nova campanha
        </Link>
      </Cabecalho>
      <div className="max-w-5xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}
        {campanhas.length === 0 ? (
          <div className="vazio">
            <p>Nenhuma campanha ainda.</p>
            <Link href="/campaigns/new" className="botao botao-primario">
              <Plus aria-hidden />
              Nova campanha
            </Link>
          </div>
        ) : (
          <div className="tabela-moldura">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Conta</th>
                  <th>Status</th>
                  <th className="numero">Para decidir</th>
                  <th className="numero">Na fila</th>
                  <th className="numero">Convites</th>
                  <th className="numero">Conversas</th>
                  <th className="numero">Reuniões</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/campaigns/${c.id}`} className="link font-medium">
                        {c.nome}
                      </Link>
                      {c.publico && <span className="block text-xs text-tinta-fraca">{c.publico}</span>}
                    </td>
                    <td>{c.conta}</td>
                    <td>
                      <EtiquetaDaCampanha status={c.status} />
                    </td>
                    <td className="numero">{c.triagem}</td>
                    <td className="numero">{c.naFila}</td>
                    <td className="numero">{c.convites}</td>
                    <td className="numero">{c.conversas}</td>
                    <td className="numero">{c.reunioes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
