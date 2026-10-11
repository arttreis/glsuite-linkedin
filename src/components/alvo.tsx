import type { CSSProperties } from "react";

export type AnelDoAlvo = { id: string; nome: string; valor: number; limite: number; rotulo: string };

const LADO = 240;
const CENTRO = LADO / 2;
const RAIO_EXTERNO = 112;
const RAIO_INTERNO = 40;

/**
 * O alvo do Dashboard: um anel por conta, de fora para dentro na ordem da
 * legenda, com os convites de hoje contra o limite do dia. Conta sem limite
 * hoje (pausada, não ativada) fica só com o trilho. O centro repete a marca.
 */
export function Alvo({ aneis }: { aneis: AnelDoAlvo[] }) {
  const passo = (RAIO_EXTERNO - RAIO_INTERNO) / Math.max(aneis.length, 1);
  const espessura = Math.min(10, passo * 0.6);
  // Com uma conta só, a legenda repetiria o cartão ao lado: o número vai embaixo do anel.
  const unico = aneis.length === 1 ? aneis[0]! : null;

  return (
    <div className={unico ? "flex w-fit flex-col items-center gap-4" : "flex flex-wrap items-center gap-x-8 gap-y-5"}>
      <svg viewBox={`0 0 ${LADO} ${LADO}`} className="alvo size-48 shrink-0 sm:size-56" aria-hidden>
        {aneis.map((anel, indice) => {
          const raio = RAIO_EXTERNO - espessura / 2 - indice * passo;
          const volta = 2 * Math.PI * raio;
          const fracao = anel.limite > 0 ? Math.min(1, anel.valor / anel.limite) : 0;
          return (
            <g key={anel.id}>
              <circle cx={CENTRO} cy={CENTRO} r={raio} strokeWidth={espessura} className="alvo-trilho" />
              {anel.limite > 0 && (
                <circle
                  cx={CENTRO}
                  cy={CENTRO}
                  r={raio}
                  strokeWidth={espessura}
                  strokeDasharray={`${volta * fracao} ${volta}`}
                  transform={`rotate(-90 ${CENTRO} ${CENTRO})`}
                  className={`alvo-arco ${anel.valor >= anel.limite ? "alvo-arco-cheio" : ""}`}
                  style={{ "--volta": `${volta}px` } as CSSProperties}
                />
              )}
            </g>
          );
        })}
        <circle cx={CENTRO} cy={CENTRO} r={18} className="alvo-mira" />
        <circle cx={CENTRO} cy={CENTRO} r={6.5} className="alvo-centro" />
      </svg>

      {unico ? (
        <p className="w-full text-center">
          <span className="text-2xl tabular-nums">{unico.limite > 0 ? `${unico.valor} de ${unico.limite}` : unico.valor}</span>
          <span className="mt-1 block text-xs text-tinta-fraca">
            {unico.limite > 0 ? "convites hoje" : `convites hoje, conta ${unico.rotulo}`}
          </span>
        </p>
      ) : (
        <div className="min-w-48">
          <p className="text-sm font-medium">Convites de hoje</p>
          <p className="mt-0.5 text-xs text-tinta-fraca">Um anel por conta, de fora para dentro.</p>
          <ol className="mt-3 flex flex-col gap-2">
            {aneis.map((anel) => (
              <li key={anel.id} className="flex items-baseline justify-between gap-6 text-[13px]">
                <span>{anel.nome}</span>
                <span className="tabular-nums text-tinta-suave">
                  {anel.limite > 0 ? `${anel.valor} de ${anel.limite}` : anel.rotulo}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
