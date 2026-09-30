import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { calcularFunil, referencia, type LinhaDoFunil } from "@/server/metricas/funil";
import { exigirOperador } from "@/server/supabase/servidor";

const pct = (valor: number) => `${Math.round(valor * 100)}%`;

function Taxa({ valor, faixa }: { valor: number | null; faixa: { minimo: number; maximo: number } }) {
  if (valor === null) return <span className="text-neutral-400">sem amostra</span>;
  const cor = valor < faixa.minimo ? "text-amber-700" : valor > faixa.maximo ? "text-emerald-700" : "text-neutral-900";
  return (
    <span className={`tabular-nums ${cor}`} title={`referência ${pct(faixa.minimo)} a ${pct(faixa.maximo)}`}>
      {pct(valor)}
    </span>
  );
}

function Tabela({ titulo, linhas, colunas }: { titulo: string; linhas: LinhaDoFunil[]; colunas: ("perfil" | "campanha" | "angulo" | "variante")[] }) {
  const ROTULOS = { perfil: "Perfil", campanha: "Campanha", angulo: "Ângulo", variante: "Copy do T1" };
  return (
    <section className="mt-8">
      <h2 className="font-medium">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Sem dados ainda.</p>
      ) : (
        <table className="mt-2 w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              {colunas.map((coluna) => (
                <th key={coluna} className="p-2">
                  {ROTULOS[coluna]}
                </th>
              ))}
              <th className="p-2 text-right">Toques</th>
              <th className="p-2 text-right">Convites</th>
              <th className="p-2 text-right">Aceites</th>
              <th className="p-2 text-right">Aceite</th>
              <th className="p-2 text-right">Respostas</th>
              <th className="p-2 text-right">Resposta / aceite</th>
              <th className="p-2 text-right">Conversas</th>
              <th className="p-2 text-right">Qualificados</th>
              <th className="p-2 text-right">Reuniões</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const ref = referencia(l.praca);
              return (
                <tr key={l.chave} className="border-b border-neutral-100">
                  {colunas.map((coluna) => (
                    <td key={coluna} className="p-2">
                      {l[coluna] ?? "—"}
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">{l.toques}</td>
                  <td className="p-2 text-right tabular-nums">{l.convites}</td>
                  <td className="p-2 text-right tabular-nums">{l.aceites}</td>
                  <td className="p-2 text-right">
                    <Taxa valor={l.taxaAceite} faixa={ref.aceite} />
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.respostas}</td>
                  <td className="p-2 text-right">
                    <Taxa valor={l.taxaRespostaSobreAceite} faixa={ref.respostaSobreAceite} />
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.conversas}</td>
                  <td className="p-2 text-right tabular-nums">{l.qualificados}</td>
                  <td className="p-2 text-right tabular-nums">{l.reunioes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function MetricasPage() {
  const operador = await exigirOperador();
  const funil = await comOperador(obterDb(), operador.id, (tx) => calcularFunil(tx));

  return (
    <section className="max-w-6xl">
      <h1 className="text-xl font-semibold">Métricas</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Taxas só aparecem depois de {funil.leituraMinima} toques (marco de leitura). Referência de trabalho: aceite 25–35%,
        resposta sobre aceite 10–15% (Espanha 15–25%). A casa ainda não tem linha de base: estes números são a primeira.
      </p>
      <Tabela titulo="Por campanha" linhas={funil.porCampanha} colunas={["perfil", "campanha", "angulo", "variante"]} />
      <Tabela titulo="Por ângulo" linhas={funil.porAngulo} colunas={["angulo"]} />
      <Tabela titulo="Por perfil" linhas={funil.porPerfil} colunas={["perfil"]} />
      <Tabela titulo="Template × personalizado (T1)" linhas={funil.porVariante} colunas={["perfil", "campanha", "variante"]} />
    </section>
  );
}
