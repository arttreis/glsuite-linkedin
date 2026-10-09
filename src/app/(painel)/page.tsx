import { Pause, Play } from "lucide-react";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDoPerfil } from "@/components/etiquetas";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
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

function CartaoDoPerfil({ perfil }: { perfil: SaudeDoPerfil }) {
  const d = perfil.detalhes;
  const aceite = d?.aceite;
  const podeAtivar = perfil.status === "pausado" && perfil.acessivel && perfil.conectado;

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
        <EtiquetaDoPerfil status={perfil.status} />
      </div>

      {perfil.status === "pausado" && perfil.motivoPausa && (
        <p className="recuo mt-4 flex items-start gap-2">
          <Pause className="mt-0.5 size-3.5 shrink-0 text-atencao" aria-hidden />
          {perfil.motivoPausa}
        </p>
      )}

      {d && (
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
          <Medida rotulo="Convites hoje" valor={d.convitesHoje} limite={d.limites?.convitesDia} />
          <Medida rotulo="DMs hoje" valor={d.dmsHoje} limite={d.limites?.dmsDia} />
          <Medida rotulo="Convites 7 dias" valor={d.convites7Dias} limite={d.teto} />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-tinta-fraca">Aceite em 3 dias úteis</span>
            {aceite?.taxa === null || !aceite ? (
              <span className="text-sm leading-none text-tinta-suave">sem amostra</span>
            ) : (
              <span className="text-lg leading-none tabular-nums">
                {Math.round(aceite.taxa * 100)}%
                <span className="text-sm text-tinta-fraca">
                  {" "}
                  ({aceite.aceitos}/{aceite.amostra})
                </span>
              </span>
            )}
          </div>
          <Medida rotulo="Erros de limite 24 h" valor={d.errosLimite24h} />
          <Medida rotulo="Na fila" valor={d.pendentes} />
        </div>
      )}
      {d && (
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
      )}

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
        podeAtivar && (
          <form
            action={despausarPerfilDoPainel}
            className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-4"
          >
            <input type="hidden" name="perfilId" value={perfil.id} />
            {perfil.primeiraAtivacao && (
              <label className="flex items-center gap-2 text-[13px] text-tinta-suave">
                <input type="checkbox" name="confirmoTravas" value="sim" required className="size-4" />
                Confirmo que as travas deste perfil estão resolvidas (§8)
              </label>
            )}
            <button type="submit" className="botao botao-primario ml-auto">
              <Play aria-hidden />
              {perfil.primeiraAtivacao ? "Ativar perfil" : "Despausar"}
            </button>
          </form>
        )
      )}
    </li>
  );
}

export default async function InicioPage({ searchParams }: PageProps<"/">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const perfis = await comOperador(obterDb(), operador.id, (tx) => saudeDosPerfis(tx, new Date()));

  const detalhes = perfis.flatMap((perfil) => (perfil.detalhes ? [perfil.detalhes] : []));
  const somar = (campo: (d: (typeof detalhes)[number]) => number) => detalhes.reduce((total, d) => total + campo(d), 0);
  const ativos = perfis.filter((perfil) => perfil.status === "ativo").length;

  return (
    <>
      <Cabecalho
        titulo="Saúde dos perfis"
        descricao="O teto é do perfil, não da campanha. Qualquer operador pode pausar; despausar fica registrado com o seu nome."
      />
      <div className="max-w-6xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}

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
