import { ArrowRight, Bot } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { lerPeriodo, numerosDoPeriodo } from "@/server/painel/numeros";
import { precisaDeVoce, type ItemDoPrecisa } from "@/server/painel/precisa";
import { saudeDosPerfis, type SaudeDoPerfil } from "@/server/painel/saude";
import { resumoDoSdr, type Origem, type ResumoDoSdr } from "@/server/sdr/sdr";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { ContasDoLinkedin, MODO_DE_RESPOSTA } from "./conta";
import { Numeros } from "./numeros";

const FUSO = "America/Sao_Paulo";

const quando = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function saudacao(agora: Date) {
  const hora = Number(agora.toLocaleString("pt-BR", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function fraseDoDia(precisa: ItemDoPrecisa[]) {
  if (precisa.length === 0) return "Nada esperando por você.";
  return precisa.length === 1 ? "Uma coisa espera por você." : `${precisa.length} coisas esperando por você.`;
}

/** O que espera a pessoa; cada item leva ao lugar de resolver. A primeira é a ação principal. */
function PrecisaDeVoce({ itens }: { itens: ItemDoPrecisa[] }) {
  return (
    <section className="cartao p-6" aria-labelledby="titulo-precisa">
      <h2 id="titulo-precisa" className="text-[15px] font-semibold">
        Precisa de você
      </h2>
      {itens.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-suave">
          Nenhuma conversa esperando, nenhuma conta com problema. O SDR segue dentro do teto de cada conta.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {itens.map((item, indice) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-superficie-alta px-4 py-3">
              <div className="min-w-0 flex-1 basis-52">
                <p className="text-sm font-medium">{item.texto}</p>
                {item.detalhe && <p className="mt-0.5 line-clamp-2 text-[13px] text-tinta-suave">{item.detalhe}</p>}
              </div>
              <Link href={item.href} className={`botao botao-pequeno shrink-0 ${indice === 0 ? "botao-primario" : ""}`}>
                {item.acao}
                <ArrowRight aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MUDANCA: Record<Origem, string> = {
  ia: "Montado da análise do site",
  humano: "Editado",
  ajuste: "Ajustado no chat de teste",
  desfazer: "Ajuste desfeito",
};

/** O SDR em uma olhada: a versão, a última mudança e como cada conta responde. */
function ResumoDoSdrNoPainel({ sdr, contas }: { sdr: ResumoDoSdr | null; contas: SaudeDoPerfil[] }) {
  const modos = [...new Set(contas.map((conta) => conta.modoResposta))];
  const ultima = sdr?.ultimaMudanca;
  return (
    <section className="cartao p-6" aria-labelledby="titulo-sdr">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-sdr" className="flex items-center gap-2 text-[15px] font-semibold">
          <Bot className="size-4 text-destaque" aria-hidden />
          SDR
        </h2>
        {sdr && <span className="text-xs tabular-nums text-tinta-fraca">versão {sdr.versao}</span>}
      </div>
      {sdr ? (
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          {ultima && (
            <div>
              <dt className="text-xs text-tinta-fraca">Última mudança</dt>
              <dd className="mt-0.5">
                {MUDANCA[ultima.origem]}
                {ultima.por ? ` por ${ultima.por}` : ""}, {quando(ultima.em)}
                {ultima.resumo && <span className="mt-0.5 block text-[13px] text-tinta-suave">{ultima.resumo}</span>}
              </dd>
            </div>
          )}
          {contas.length > 0 && (
            <div>
              <dt className="text-xs text-tinta-fraca">Respostas</dt>
              <dd className="mt-0.5">
                {modos.length === 1
                  ? MODO_DE_RESPOSTA[modos[0]!]
                  : contas.map((conta) => (
                      <span key={conta.id} className="block">
                        {conta.nome}: {MODO_DE_RESPOSTA[conta.modoResposta].toLowerCase()}
                      </span>
                    ))}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-tinta-suave">
          O SDR ainda não foi montado. Até lá, cada conta responde com a voz e as regras dela.
        </p>
      )}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const operador = await exigirOperadorNoApp();
  const { msg, period } = await searchParams;
  const periodo = lerPeriodo(period);
  const agora = new Date();
  const { contas, precisa, numeros, sdr } = await comOperador(obterDb(), operador.id, async (tx) => ({
    contas: await saudeDosPerfis(tx, agora),
    precisa: await precisaDeVoce(tx, agora),
    numeros: await numerosDoPeriodo(tx, { periodo, agora }),
    sdr: await resumoDoSdr(tx, operador.organizacaoId),
  }));
  const data = agora.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <header className="cabecalho pt-10 pb-8">
        <p className="text-sm text-tinta-suave first-letter:uppercase">{data}</p>
        <h1 className="titulo-vitrine mt-3 text-[clamp(1.75rem,2.6vw,2.5rem)] text-balance">
          {saudacao(agora)}, {operador.nome.split(/\s+/)[0]}. {fraseDoDia(precisa)}
        </h1>
      </header>
      <div className="flex max-w-6xl flex-col gap-6">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        <ContasDoLinkedin contas={contas} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <PrecisaDeVoce itens={precisa} />
          <ResumoDoSdrNoPainel sdr={sdr} contas={contas} />
        </div>
        <Numeros numeros={numeros} periodo={periodo} />
      </div>
    </>
  );
}
