import type { Contagens, LinhaDoFunil } from "@/server/metricas/funil";

const ETAPAS = [
  { chave: "convites", rotulo: "Convites" },
  { chave: "aceites", rotulo: "Aceites" },
  { chave: "respostas", rotulo: "Respostas" },
  { chave: "conversas", rotulo: "Conversas" },
  { chave: "qualificados", rotulo: "Qualificados" },
  { chave: "reunioes", rotulo: "Reuniões" },
] as const;

const pct = (valor: number) => `${Math.round(valor * 100)}%`;

/** O funil da campanha, do convite à reunião (§4.11), com as variantes do convite quando houver. */
export function AbaResultados({ linhas, leituraMinima }: { linhas: LinhaDoFunil[]; leituraMinima: number }) {
  const total = linhas.reduce<Contagens>(
    (soma, l) => ({
      toques: soma.toques + l.toques,
      convites: soma.convites + l.convites,
      aceites: soma.aceites + l.aceites,
      respostas: soma.respostas + l.respostas,
      conversas: soma.conversas + l.conversas,
      qualificados: soma.qualificados + l.qualificados,
      reunioes: soma.reunioes + l.reunioes,
    }),
    { toques: 0, convites: 0, aceites: 0, respostas: 0, conversas: 0, qualificados: 0, reunioes: 0 },
  );

  if (total.convites === 0) return <p className="vazio">Os números aparecem quando o primeiro convite sair.</p>;
  return (
    <div className="flex flex-col gap-6">
      <section className="cartao p-6">
        <ol className="flex flex-col gap-3.5">
          {ETAPAS.map((etapa, indice) => {
            const valor = total[etapa.chave];
            const anterior = indice > 0 ? total[ETAPAS[indice - 1].chave] : null;
            return (
              <li key={etapa.chave} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_7rem]">
                <span className="text-sm text-tinta-suave">{etapa.rotulo}</span>
                <span className="funil-trilho" aria-hidden>
                  {valor > 0 && <span className="funil-barra" style={{ width: `${Math.max((valor / total.convites) * 100, 1.5)}%` }} />}
                </span>
                <span className="text-right">
                  <span className="text-lg tabular-nums">{valor}</span>
                  {anterior !== null && anterior > 0 && <span className="ml-2 text-xs tabular-nums text-tinta-fraca">{pct(valor / anterior)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-xs text-tinta-fraca">
          {total.toques} toques enviados. As taxas só dizem algo a partir de {leituraMinima} toques.
        </p>
      </section>
      {linhas.length > 1 && (
        <div className="tabela-moldura">
          <table className="tabela">
            <thead>
              <tr>
                <th>Convite</th>
                <th className="numero">Convites</th>
                <th className="numero">Aceite</th>
                <th className="numero">Resposta / aceite</th>
                <th className="numero">Reuniões</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave}>
                  <td>{l.variante === "personalizada" ? "Personalizado pela IA" : "Texto da campanha"}</td>
                  <td className="numero">{l.convites}</td>
                  <td className="numero">{l.taxaAceite === null ? "sem amostra" : pct(l.taxaAceite)}</td>
                  <td className="numero">{l.taxaRespostaSobreAceite === null ? "sem amostra" : pct(l.taxaRespostaSobreAceite)}</td>
                  <td className="numero">{l.reunioes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
