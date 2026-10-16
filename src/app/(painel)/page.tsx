import { ArrowRight, Bot, Rocket } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { lerFiltro } from "@/domain/filtro-de-contatos";
import { CATALOGO_DE_MODULOS, linkedinNoPrimeiroAcesso, type Modulo } from "@/domain/modulos";
import { contarContatos } from "@/server/contatos/contatos";
import { listarDisparos, type DisparoNaLista } from "@/server/disparos/disparos";
import { BarraDoDisparo, EtiquetaDoDisparo, resumoDoDisparo } from "./broadcasts/situacao";
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

/** O SDR no LinkedIn está contratado e o primeiro acesso ainda não foi feito (§4.14). */
function ConfigurarOSdr() {
  return (
    <section className="cartao flex flex-wrap items-center justify-between gap-4 p-6" aria-labelledby="titulo-configurar">
      <div className="min-w-0 max-w-2xl">
        <h2 id="titulo-configurar" className="flex items-center gap-2 text-[15px] font-semibold">
          <Rocket className="size-4 text-destaque" aria-hidden />
          Falta configurar o SDR no LinkedIn
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Seis passos: o site, a análise, o SDR no chat de teste, os leads, a abordagem e o seu LinkedIn. Dá para parar e voltar
          de onde parou.
        </p>
      </div>
      <Link href="/onboarding" className="botao botao-primario shrink-0">
        Configurar o SDR
        <ArrowRight aria-hidden />
      </Link>
    </section>
  );
}

/** Os últimos disparos e como estão indo (§2.2); o pausado diz por quê, porque espera a pessoa. */
function DisparosRecentes({ disparos }: { disparos: DisparoNaLista[] }) {
  return (
    <section className="cartao p-6" aria-labelledby="titulo-disparos">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-disparos" className="text-[15px] font-semibold">
          Disparos
        </h2>
        <Link href="/broadcasts" className="link text-sm">
          Ver todos
        </Link>
      </div>
      {disparos.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-suave">
          Nenhum disparo ainda.{" "}
          <Link href="/broadcasts/new" className="link">
            Fazer o primeiro
          </Link>
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {disparos.map((disparo) => (
            <li key={disparo.id} className="flex flex-col gap-2 rounded-xl bg-superficie-alta px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/broadcasts/${disparo.id}`} className="link text-sm font-medium">
                  {disparo.nome}
                </Link>
                <EtiquetaDoDisparo status={disparo.status} />
              </div>
              {disparo.status !== "rascunho" && (
                <>
                  <BarraDoDisparo contagem={disparo.contagem} />
                  <p className="text-xs text-tinta-suave">{resumoDoDisparo(disparo.contagem)}</p>
                </>
              )}
              {disparo.status === "pausado" && disparo.motivoPausa && <p className="text-xs text-atencao">{disparo.motivoPausa}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Sem o SDR no LinkedIn, o Dashboard mostra o que o plano da organização tem. */
function OQueOPlanoTem({ modulos, contatos }: { modulos: Modulo[]; contatos: number }) {
  const contratados = CATALOGO_DE_MODULOS.filter((modulo) => modulos.includes(modulo.id));
  return (
    <section className="cartao p-6" aria-labelledby="titulo-plano">
      <h2 id="titulo-plano" className="text-[15px] font-semibold">
        O seu plano
      </h2>
      {contratados.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-suave">
          A organização ainda não tem nenhum módulo. Contatos, tags e segmentos já estão no menu.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {contratados.map((modulo) => (
            <li key={modulo.id} className="rounded-xl bg-superficie-alta px-4 py-3">
              <p className="text-sm font-medium">{modulo.nome}</p>
              <p className="mt-0.5 text-[13px] text-tinta-suave">{modulo.resumo}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-tinta-suave">
        <Link href="/contacts" className="link">
          {contatos === 1 ? "1 contato" : `${contatos.toLocaleString("pt-BR")} contatos`}
        </Link>{" "}
        na base da organização ·{" "}
        <Link href="/settings/plan" className="link">
          Ver o plano
        </Link>
      </p>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const operador = await exigirOperadorNoApp();
  const { msg, period } = await searchParams;
  const periodo = lerPeriodo(period);
  const agora = new Date();
  // As partes do LinkedIn só existem com o módulo e depois do primeiro acesso (§4.14).
  const pendente = linkedinNoPrimeiroAcesso(operador.modulos, operador.primeiroAcessoConcluido);
  const linkedin =
    operador.modulos.includes("linkedin") && !pendente
      ? await comOperador(obterDb(), operador.id, async (tx) => ({
          contas: await saudeDosPerfis(tx, agora),
          precisa: await precisaDeVoce(tx),
          numeros: await numerosDoPeriodo(tx, { periodo, agora }),
          sdr: await resumoDoSdr(tx, operador.organizacaoId),
        }))
      : null;
  const data = agora.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" });
  const comDisparos = operador.modulos.includes("whatsapp") || operador.modulos.includes("telegram");
  const disparos = comDisparos ? await comOperador(obterDb(), operador.id, (tx) => listarDisparos(tx, operador.organizacaoId, 3)) : [];

  return (
    <>
      <header className="cabecalho pt-10 pb-8">
        <p className="text-sm text-tinta-suave first-letter:uppercase">{data}</p>
        <h1 className="titulo-vitrine mt-3 text-[clamp(1.75rem,2.6vw,2.5rem)] text-balance">
          {saudacao(agora)}, {operador.nome.split(/\s+/)[0]}. {linkedin ? fraseDoDia(linkedin.precisa) : "Tudo o que o seu plano tem está no menu."}
        </h1>
      </header>
      <div className="flex max-w-6xl flex-col gap-6">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {pendente && <ConfigurarOSdr />}
        {linkedin ? (
          <>
            <ContasDoLinkedin contas={linkedin.contas} />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <PrecisaDeVoce itens={linkedin.precisa} />
              <ResumoDoSdrNoPainel sdr={linkedin.sdr} contas={linkedin.contas} />
            </div>
            <Numeros numeros={linkedin.numeros} periodo={periodo} />
          </>
        ) : (
          <OQueOPlanoTem
            modulos={operador.modulos}
            contatos={await comOperador(obterDb(), operador.id, (tx) =>
              contarContatos(tx, { organizacaoId: operador.organizacaoId, filtro: lerFiltro({ situacao: "todos" }) }),
            )}
          />
        )}
        {comDisparos && <DisparosRecentes disparos={disparos} />}
      </div>
    </>
  );
}
