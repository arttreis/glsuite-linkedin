import type { Contagens } from "@/server/metricas/funil";

/** As etapas contam pessoas; toques contam envios e ficam fora das barras. */
const ETAPAS = [
  { chave: "convites", rotulo: "Convites" },
  { chave: "aceites", rotulo: "Aceites" },
  { chave: "respostas", rotulo: "Respostas" },
  { chave: "conversas", rotulo: "Conversas" },
  { chave: "qualificados", rotulo: "Qualificados" },
  { chave: "reunioes", rotulo: "Reuniões" },
] as const;

const pct = (valor: number) => `${Math.round(valor * 100)}%`;

/**
 * O funil de todos os perfis em barras, do convite à reunião. A barra é a
 * etapa contra os convites; o número ao lado diz quanto ela é da anterior.
 * As taxas com referência por praça ficam nas tabelas abaixo.
 */
export function FunilDaCasa({ linhas }: { linhas: Contagens[] }) {
  const total = linhas.reduce(
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

  return (
    <section className="cartao p-6" aria-labelledby="titulo-funil-da-casa">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="titulo-funil-da-casa" className="text-[15px] font-semibold">
          Funil da casa
        </h2>
        <p className="text-[13px] text-tinta-suave">
          <span className="tabular-nums text-tinta">{total.toques}</span> toques enviados
        </p>
      </div>
      <p className="mt-1 text-[13px] text-tinta-fraca">
        {total.convites === 0
          ? "O funil enche quando os primeiros convites saírem."
          : "Cada barra é a etapa contra os convites; o percentual é quanto ela é da etapa anterior."}
      </p>

      <ol className="mt-6 flex flex-col gap-3.5">
        {ETAPAS.map((etapa, indice) => {
          const valor = total[etapa.chave];
          const anterior = indice > 0 ? total[ETAPAS[indice - 1].chave] : null;
          const largura = total.convites > 0 ? (valor / total.convites) * 100 : 0;
          return (
            <li key={etapa.chave} title={`${etapa.rotulo}: ${valor}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] items-center gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_7rem]">
              <span className="text-sm text-tinta-suave">{etapa.rotulo}</span>
              <span className="funil-trilho" aria-hidden>
                {valor > 0 && <span className="funil-barra" style={{ width: `${Math.max(largura, 1.5)}%` }} />}
              </span>
              <span className="text-right text-sm tabular-nums">
                <span className="font-medium">{valor}</span>
                {anterior !== null && anterior > 0 && <span className="ml-2 text-tinta-fraca">{pct(valor / anterior)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
