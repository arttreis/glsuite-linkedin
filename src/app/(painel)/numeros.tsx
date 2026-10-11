import Link from "next/link";
import { PERIODOS, type NumerosDoPeriodo, type Periodo } from "@/server/painel/numeros";

const ETAPAS = [
  { chave: "convites", rotulo: "Convites" },
  { chave: "aceites", rotulo: "Aceites" },
  { chave: "conversas", rotulo: "Conversas" },
  { chave: "qualificados", rotulo: "Qualificados" },
  { chave: "reunioes", rotulo: "Reuniões" },
] as const;

const pct = (valor: number) => `${Math.round(valor * 100)}%`;

/**
 * Os números do período em funil (§4.9): cada barra é a etapa contra os
 * convites; ao lado, quanto ela é da anterior. Conta o que aconteceu no
 * período, não uma turma de convites: um aceite de hoje pode ser de um convite
 * da semana passada.
 */
export function Numeros({ numeros, periodo }: { numeros: NumerosDoPeriodo; periodo: Periodo }) {
  return (
    <section className="cartao p-6" aria-labelledby="titulo-numeros">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-numeros" className="text-[15px] font-semibold">
          Números
        </h2>
        <nav aria-label="Período" className="flex gap-1 rounded-full border border-linha p-1">
          {(Object.keys(PERIODOS) as Periodo[]).map((chave) => (
            <Link
              key={chave}
              href={chave === "7d" ? "/" : `/?period=${chave}`}
              scroll={false}
              aria-current={chave === periodo ? "page" : undefined}
              className="rounded-full px-3 py-1 text-[13px] text-tinta-suave aria-[current=page]:bg-superficie-alta aria-[current=page]:text-tinta"
            >
              {PERIODOS[chave].rotulo}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mt-1 text-[13px] text-tinta-fraca">
        {numeros.convites === 0
          ? `Nenhum convite saiu nos últimos ${PERIODOS[periodo].rotulo}.`
          : `O que aconteceu nos últimos ${PERIODOS[periodo].rotulo}, em todas as contas que você opera.`}
      </p>

      <ol className="mt-6 flex flex-col gap-3.5">
        {ETAPAS.map((etapa, indice) => {
          const valor = numeros[etapa.chave];
          const anterior = indice > 0 ? numeros[ETAPAS[indice - 1].chave] : null;
          const largura = numeros.convites > 0 ? Math.min(100, (valor / numeros.convites) * 100) : 0;
          return (
            <li
              key={etapa.chave}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_7rem]"
            >
              <span className="text-sm text-tinta-suave">{etapa.rotulo}</span>
              <span className="funil-trilho" aria-hidden>
                {valor > 0 && <span className="funil-barra" style={{ width: `${Math.max(largura, 1.5)}%` }} />}
              </span>
              <span className="text-right">
                <span className="text-lg tabular-nums">{valor}</span>
                {anterior !== null && anterior > 0 && (
                  <span className="ml-2 text-xs tabular-nums text-tinta-fraca">{pct(valor / anterior)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 text-right text-[13px]">
        <Link href="/campaigns" className="link">
          Resultados de cada campanha
        </Link>
      </p>
    </section>
  );
}
