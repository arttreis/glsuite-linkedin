import { ArrowRight, Circle, CircleCheck, Pause, Play } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDoPerfil } from "@/components/etiquetas";
import { resumoDaRampa } from "@/domain/ativacao";
import type { EtapaDaRampa } from "@/domain/rampa";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { avaliarPrimeirosPassos, type Passo } from "@/server/onboarding/primeiros-passos";
import { proximosPassos, type ProximoPasso } from "@/server/painel/proximos";
import { saudeDosPerfis, type SaudeDoPerfil } from "@/server/painel/saude";
import { exigirOperador } from "@/server/supabase/servidor";
import { despausarPerfilDoPainel, pausarPerfilDoPainel } from "./acoes";

const PRACAS: Record<string, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

const hora = (valor: Date | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

function Resumo({ rotulo, valor, complemento }: { rotulo: string; valor: number | string; complemento?: string }) {
  return (
    <div className="cartao px-5 py-4">
      <dt className="text-[13px] text-tinta-suave">{rotulo}</dt>
      <dd className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-medium tracking-tight tabular-nums">{valor}</span>
        {complemento && <span className="text-sm text-tinta-fraca">{complemento}</span>}
      </dd>
    </div>
  );
}

/** Uso do dia ou da semana contra o teto do perfil; a barra fica âmbar quando o teto é atingido. */
function Medida({ rotulo, valor, limite }: { rotulo: string; valor: number; limite?: number | null }) {
  const temLimite = limite !== undefined && limite !== null;
  const cheio = temLimite && valor >= limite;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-tinta-fraca">{rotulo}</span>
      <span className={`text-lg leading-none tabular-nums ${cheio ? "text-atencao" : ""}`}>
        {valor}
        {temLimite && <span className="text-sm text-tinta-fraca"> / {limite}</span>}
      </span>
      {temLimite && limite > 0 && (
        <span className="mt-0.5 h-1 overflow-hidden rounded-full bg-linha" aria-hidden>
          <span
            className={`block h-full rounded-full ${cheio ? "bg-atencao" : "bg-tinta-suave"}`}
            style={{ width: `${Math.min(100, (valor / limite) * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

/** Antes da primeira ativação: o que falta, quem resolve e o que acontece ao ativar. */
function ChecklistDeAtivacao({ perfil, rampa, teto }: { perfil: SaudeDoPerfil; rampa: EtapaDaRampa[]; teto: number }) {
  const dmsManuais = rampa.every((etapa) => etapa.dms_dia === 0);
  return (
    <form action={despausarPerfilDoPainel} className="mt-5 flex flex-1 flex-col gap-4">
      <input type="hidden" name="perfilId" value={perfil.id} />
      <p className="text-sm font-medium">Para ativar este perfil</p>
      <ol className="flex flex-col gap-3 text-sm">
        <li className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {perfil.contaPronta ? (
            <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
          ) : (
            <Circle className="size-4 shrink-0 text-tinta-fraca" aria-hidden />
          )}
          <span className={`flex-1 ${perfil.contaPronta ? "text-tinta-suave" : ""}`}>
            {perfil.contaPronta
              ? "LinkedIn conectado na Unipile"
              : perfil.conectado
                ? `Reconectar o LinkedIn (a Unipile informa ${perfil.unipileStatus})`
                : "Conectar o LinkedIn na Unipile"}
          </span>
          {!perfil.contaPronta && (
            <Link href={`/perfis#perfil-${perfil.id}`} className="botao botao-pequeno">
              Ir para Perfis
              <ArrowRight aria-hidden />
            </Link>
          )}
        </li>
        {perfil.travas.map((trava) => (
          <li key={trava.id}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" name="travas" value={trava.id} required className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{trava.texto}</span>
              <span className="text-xs text-tinta-fraca">Responsável: {trava.dono}</span>
            </label>
          </li>
        ))}
      </ol>
      <p className="recuo text-[13px]">
        Ao ativar começa a semana 1 da rampa. Convites por dia: {resumoDaRampa(rampa, "convites_dia")}
        {dmsManuais ? "; DMs escritas à mão" : `; DMs por dia: ${resumoDaRampa(rampa, "dms_dia")}`}; no máximo {teto}{" "}
        convites por semana.
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-linha pt-4">
        {!perfil.contaPronta && <span className="text-[13px] text-tinta-fraca">Conecte o LinkedIn para liberar.</span>}
        <button type="submit" className="botao botao-primario" disabled={!perfil.contaPronta}>
          <Play aria-hidden />
          Ativar perfil
        </button>
      </div>
    </form>
  );
}

function MetricasDoPerfil({ d }: { d: NonNullable<SaudeDoPerfil["detalhes"]> }) {
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
        <Medida rotulo="Convites hoje" valor={d.convitesHoje} limite={d.limites?.convitesDia} />
        <Medida rotulo="DMs hoje" valor={d.dmsHoje} limite={d.limites?.dmsDia} />
        <Medida rotulo="Convites 7 dias" valor={d.convites7Dias} limite={d.teto} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-tinta-fraca">Aceite em 3 dias úteis</span>
          {d.aceite.taxa === null ? (
            <span className="text-sm leading-none text-tinta-suave">sem amostra</span>
          ) : (
            <span className="text-lg leading-none tabular-nums">
              {Math.round(d.aceite.taxa * 100)}%
              <span className="text-sm text-tinta-fraca">
                {" "}
                ({d.aceite.aceitos}/{d.aceite.amostra})
              </span>
            </span>
          )}
        </div>
        <Medida rotulo="Erros de limite 24 h" valor={d.errosLimite24h} />
        <Medida rotulo="Na fila" valor={d.pendentes} />
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
        <div className="flex gap-1.5">
          <dt className="text-tinta-fraca">Em revisão</dt>
          <dd className="tabular-nums text-tinta-suave">{d.emRevisao}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-tinta-fraca">Último envio</dt>
          <dd className="text-tinta-suave">{hora(d.ultimoEnvio)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-tinta-fraca">Próxima ação a partir de</dt>
          <dd className="text-tinta-suave">{hora(d.proximaAcaoApos)}</dd>
        </div>
      </dl>
    </>
  );
}

function CartaoDoPerfil({ perfil }: { perfil: SaudeDoPerfil }) {
  const d = perfil.detalhes;
  const nuncaAtivado = perfil.primeiraAtivacao && perfil.status === "pausado";

  return (
    <li className="cartao flex flex-col p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={perfil.nome} />
          <div className="min-w-0">
            <p className="font-medium">
              {perfil.nome} <span className="ml-1 text-sm font-normal text-tinta-fraca">{PRACAS[perfil.praca]}</span>
            </p>
            <p className="text-xs text-tinta-suave">
              {perfil.conectado ? `Unipile: ${perfil.unipileStatus ?? "sem status"}` : "LinkedIn não conectado"}
              {d?.semana ? `, semana ${d.semana} da rampa` : ""}
            </p>
          </div>
        </div>
        <EtiquetaDoPerfil status={perfil.status} nuncaAtivado={nuncaAtivado} />
      </div>

      {nuncaAtivado ? (
        d ? (
          <ChecklistDeAtivacao perfil={perfil} rampa={d.rampa} teto={d.teto} />
        ) : (
          <p className="mt-4 text-[13px] text-tinta-suave">Ainda não ativado. Só quem opera este perfil pode ativá-lo.</p>
        )
      ) : (
        <>
          {perfil.status === "pausado" && perfil.motivoPausa && (
            <p className="recuo mt-4 flex items-start gap-2">
              <Pause className="mt-0.5 size-3.5 shrink-0 text-atencao" aria-hidden />
              {perfil.motivoPausa}
            </p>
          )}
          {d && <MetricasDoPerfil d={d} />}
          {perfil.status === "ativo" ? (
            <form action={pausarPerfilDoPainel} className="mt-5 flex flex-wrap gap-2 border-t border-linha pt-4">
              <input type="hidden" name="perfilId" value={perfil.id} />
              <input
                name="motivo"
                required
                minLength={3}
                placeholder="Motivo da pausa"
                aria-label={`Motivo da pausa de ${perfil.nome}`}
                className="campo min-w-0 flex-1 basis-48"
              />
              <button type="submit" className="botao">
                <Pause aria-hidden />
                Pausar
              </button>
            </form>
          ) : (
            d && (
              <form
                action={despausarPerfilDoPainel}
                className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-4"
              >
                <input type="hidden" name="perfilId" value={perfil.id} />
                <p className="min-w-0 flex-1 basis-56 text-[13px] text-tinta-suave">
                  {perfil.contaPronta ? (
                    "Resolva o motivo acima antes de despausar. As guardas recomeçam a contar a partir daqui."
                  ) : (
                    <>
                      Reconecte o LinkedIn em{" "}
                      <Link href={`/perfis#perfil-${perfil.id}`} className="underline underline-offset-2">
                        Perfis
                      </Link>{" "}
                      para poder despausar.
                    </>
                  )}
                </p>
                <button type="submit" className="botao botao-primario" disabled={!perfil.contaPronta}>
                  <Play aria-hidden />
                  Despausar
                </button>
              </form>
            )
          )}
        </>
      )}
    </li>
  );
}

/** Enquanto não há campanha pronta (§4.10): o que falta, na ordem, com o próximo passo em destaque. */
function PrimeirosPassos({ passos }: { passos: Passo[] }) {
  const atual = passos.find((passo) => !passo.feito);
  const feitos = passos.filter((passo) => passo.feito).length;
  return (
    <section className="cartao mb-6 p-5" aria-labelledby="titulo-primeiros-passos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-primeiros-passos" className="text-[15px] font-semibold">
          Primeiros passos
        </h2>
        <span className="text-xs tabular-nums text-tinta-fraca">
          {feitos} de {passos.length} feitos
        </span>
      </div>
      <p className="mt-1 text-[13px] text-tinta-suave">
        Inbox, Aprovação, Tarefas e Métricas liberam quando a sua primeira campanha estiver rodando: campanha ativa, perfil
        ativo e pelo menos uma pessoa aprovada na triagem.
      </p>
      <ol className="mt-4 flex flex-col gap-1">
        {passos.map((passo, indice) => {
          const eAtual = passo === atual;
          return (
            <li
              key={passo.id}
              aria-current={eAtual ? "step" : undefined}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 ${eAtual ? "bg-superficie-alta" : ""}`}
            >
              {passo.feito ? (
                <CircleCheck className="size-5 shrink-0 text-ok" aria-label="Feito" />
              ) : (
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-linha text-[11px] tabular-nums text-tinta-suave">
                  {indice + 1}
                </span>
              )}
              <div className="min-w-0 flex-1 basis-60">
                <p className={`text-sm ${passo.feito ? "text-tinta-suave" : "font-medium"}`}>{passo.titulo}</p>
                {eAtual && <p className="mt-0.5 text-[13px] text-tinta-suave">{passo.explicacao}</p>}
              </div>
              {!passo.feito &&
                (eAtual ? (
                  <Link href={passo.href} className="botao botao-primario botao-pequeno">
                    {passo.acao}
                    <ArrowRight aria-hidden />
                  </Link>
                ) : (
                  <Link href={passo.href} className="link text-[13px]">
                    {passo.acao}
                  </Link>
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ParaAgora({ itens }: { itens: ProximoPasso[] }) {
  return (
    <section className="mb-6" aria-labelledby="titulo-para-agora">
      <h2 id="titulo-para-agora" className="text-[15px] font-semibold">
        Para agora
      </h2>
      {itens.length === 0 ? (
        <p className="mt-2 text-[13px] text-tinta-suave">Nada esperando por você. Os envios seguem sozinhos dentro dos limites de cada perfil.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {itens.map((item) => (
            <li key={item.id} className="cartao flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm">
                <span className="mr-1.5 text-lg font-medium tabular-nums">{item.quantidade}</span>
                {item.texto}
              </p>
              <Link href={item.href} className="botao botao-pequeno shrink-0">
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

export default async function InicioPage({ searchParams }: PageProps<"/">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const agora = new Date();
  const primeirosPassos = await avaliarPrimeirosPassos(obterDb(), operador.id, agora);
  const { perfis, proximos } = await comOperador(obterDb(), operador.id, async (tx) => ({
    perfis: await saudeDosPerfis(tx, agora),
    proximos: primeirosPassos.concluido ? await proximosPassos(tx, agora) : [],
  }));

  const detalhes = perfis.flatMap((perfil) => (perfil.detalhes ? [perfil.detalhes] : []));
  const somar = (campo: (d: (typeof detalhes)[number]) => number) => detalhes.reduce((total, d) => total + campo(d), 0);
  const ativos = perfis.filter((perfil) => perfil.status === "ativo").length;

  return (
    <>
      <Cabecalho
        titulo="Início"
        descricao="O que precisa de você agora e a situação de cada perfil do LinkedIn."
      />
      <div className="max-w-6xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}

        {primeirosPassos.concluido ? <ParaAgora itens={proximos} /> : <PrimeirosPassos passos={primeirosPassos.passos} />}

        <h2 id="perfis" className="mb-1 scroll-mt-6 text-[15px] font-semibold">
          Perfis
        </h2>
        <p className="mb-4 text-[13px] text-tinta-suave">
          Qualquer operador pode pausar um perfil; ativar e despausar ficam registrados com o seu nome.
        </p>

        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Resumo rotulo="Perfis ativos" valor={ativos} complemento={`de ${perfis.length}`} />
          <Resumo rotulo="Convites hoje" valor={somar((d) => d.convitesHoje)} />
          <Resumo rotulo="DMs hoje" valor={somar((d) => d.dmsHoje)} />
          <Resumo rotulo="Na fila" valor={somar((d) => d.pendentes)} complemento={`${somar((d) => d.emRevisao)} em revisão`} />
        </dl>

        <ul className="mt-6 grid gap-4 xl:grid-cols-2">
          {perfis.map((perfil) => (
            <CartaoDoPerfil key={perfil.id} perfil={perfil} />
          ))}
        </ul>
      </div>
    </>
  );
}
