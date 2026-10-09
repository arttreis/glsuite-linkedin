import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { calcularFunil, referencia, type LinhaDoFunil } from "@/server/metricas/funil";
import { exigirOperadorLiberado } from "@/server/supabase/servidor";

const pct = (valor: number) => `${Math.round(valor * 100)}%`;

/** Abaixo da faixa de referência fica âmbar; acima, verde. */
function Taxa({ valor, faixa }: { valor: number | null; faixa: { minimo: number; maximo: number } }) {
  if (valor === null) return <span className="text-tinta-fraca">sem amostra</span>;
  const cor = valor < faixa.minimo ? "text-atencao" : valor > faixa.maximo ? "text-ok" : "text-tinta";
  return (
    <span className={cor} title={`referência ${pct(faixa.minimo)} a ${pct(faixa.maximo)}`}>
      {pct(valor)}
    </span>
  );
}

function Tabela({ titulo, linhas, colunas }: { titulo: string; linhas: LinhaDoFunil[]; colunas: ("perfil" | "campanha" | "angulo" | "variante")[] }) {
  const ROTULOS = { perfil: "Perfil", campanha: "Campanha", angulo: "Ângulo", variante: "Texto do convite" };
  return (
    <section>
      <h2 className="mb-3 text-[15px] font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="vazio py-8">Sem dados ainda.</p>
      ) : (
        <div className="tabela-moldura">
          <table className="tabela">
            <thead>
              <tr>
                {colunas.map((coluna) => (
                  <th key={coluna}>{ROTULOS[coluna]}</th>
                ))}
                <th className="numero">Toques</th>
                <th className="numero">Convites</th>
                <th className="numero">Aceites</th>
                <th className="numero">Aceite</th>
                <th className="numero">Respostas</th>
                <th className="numero">Resposta / aceite</th>
                <th className="numero">Conversas</th>
                <th className="numero">Qualificados</th>
                <th className="numero">Reuniões</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const ref = referencia(l.praca);
                return (
                  <tr key={l.chave}>
                    {colunas.map((coluna) => (
                      <td key={coluna}>{l[coluna] ?? "—"}</td>
                    ))}
                    <td className="numero">{l.toques}</td>
                    <td className="numero">{l.convites}</td>
                    <td className="numero">{l.aceites}</td>
                    <td className="numero">
                      <Taxa valor={l.taxaAceite} faixa={ref.aceite} />
                    </td>
                    <td className="numero">{l.respostas}</td>
                    <td className="numero">
                      <Taxa valor={l.taxaRespostaSobreAceite} faixa={ref.respostaSobreAceite} />
                    </td>
                    <td className="numero">{l.conversas}</td>
                    <td className="numero">{l.qualificados}</td>
                    <td className="numero">{l.reunioes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function MetricasPage() {
  const operador = await exigirOperadorLiberado();
  const funil = await comOperador(obterDb(), operador.id, (tx) => calcularFunil(tx));

  return (
    <>
      <Cabecalho
        titulo="Métricas"
        descricao={`Taxas só aparecem depois de ${funil.leituraMinima} toques (marco de leitura). Referência de trabalho: aceite 25–35%, resposta sobre aceite 10–15% (Espanha 15–25%). A casa ainda não tem linha de base: estes números são a primeira.`}
      />
      <div className="flex max-w-6xl flex-col gap-9">
        <Tabela titulo="Por campanha" linhas={funil.porCampanha} colunas={["perfil", "campanha", "angulo", "variante"]} />
        <Tabela titulo="Por ângulo" linhas={funil.porAngulo} colunas={["angulo"]} />
        <Tabela titulo="Por perfil" linhas={funil.porPerfil} colunas={["perfil"]} />
        <Tabela titulo="Convite: template × personalizado pela IA" linhas={funil.porVariante} colunas={["perfil", "campanha", "variante"]} />
      </div>
    </>
  );
}
