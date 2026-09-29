import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { saudeDosPerfis, type SaudeDoPerfil } from "@/server/painel/saude";
import { exigirOperador } from "@/server/supabase/servidor";
import { despausarPerfilDoPainel, pausarPerfilDoPainel } from "./acoes";

const PRACAS: Record<string, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

const hora = (valor: Date | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

function Medida({ rotulo, valor, limite }: { rotulo: string; valor: number; limite?: number | null }) {
  const cheio = limite !== undefined && limite !== null && valor >= limite;
  return (
    <div className="flex flex-col">
      <span className="text-xs text-neutral-500">{rotulo}</span>
      <span className={`tabular-nums ${cheio ? "text-amber-700" : ""}`}>
        {valor}
        {limite !== undefined && limite !== null && <span className="text-neutral-400"> / {limite}</span>}
      </span>
    </div>
  );
}

function CartaoDoPerfil({ perfil }: { perfil: SaudeDoPerfil }) {
  const d = perfil.detalhes;
  const aceite = d?.aceite;
  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">
            {perfil.nome} <span className="text-sm font-normal text-neutral-500">· {PRACAS[perfil.praca]}</span>
          </p>
          <p className="text-xs text-neutral-500">
            {perfil.conectado ? `Unipile: ${perfil.unipileStatus ?? "sem status"}` : "LinkedIn não conectado"}
            {d?.semana ? ` · semana ${d.semana} da rampa` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            perfil.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {perfil.status}
        </span>
      </div>

      {perfil.status === "pausado" && perfil.motivoPausa && <p className="mt-2 text-sm text-neutral-700">{perfil.motivoPausa}</p>}

      {d && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
          <Medida rotulo="Convites hoje" valor={d.convitesHoje} limite={d.limites?.convitesDia} />
          <Medida rotulo="DMs hoje" valor={d.dmsHoje} limite={d.limites?.dmsDia} />
          <Medida rotulo="Convites 7 dias" valor={d.convites7Dias} limite={d.teto} />
          <div className="flex flex-col">
            <span className="text-xs text-neutral-500">Aceite em 3 dias úteis</span>
            <span className="tabular-nums">
              {aceite?.taxa === null || !aceite ? "sem amostra" : `${Math.round(aceite.taxa * 100)}% (${aceite.aceitos}/${aceite.amostra})`}
            </span>
          </div>
          <Medida rotulo="Erros de limite 24 h" valor={d.errosLimite24h} />
          <Medida rotulo="Na fila" valor={d.pendentes} />
        </div>
      )}
      {d && (
        <p className="mt-2 text-xs text-neutral-500">
          {d.emRevisao} em revisão · último envio {hora(d.ultimoEnvio)} · próxima ação a partir de {hora(d.proximaAcaoApos)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {perfil.status === "ativo" ? (
          <form action={pausarPerfilDoPainel} className="flex gap-2">
            <input type="hidden" name="perfilId" value={perfil.id} />
            <input
              name="motivo"
              required
              minLength={3}
              placeholder="Motivo da pausa"
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-md bg-amber-600 px-3 py-1 text-sm text-white">
              Pausar
            </button>
          </form>
        ) : (
          perfil.acessivel &&
          perfil.conectado && (
            <form action={despausarPerfilDoPainel} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="perfilId" value={perfil.id} />
              {perfil.primeiraAtivacao && (
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  <input type="checkbox" name="confirmoTravas" value="sim" required />
                  Confirmo que as travas deste perfil estão resolvidas (§8)
                </label>
              )}
              <button type="submit" className="rounded-md bg-emerald-700 px-3 py-1 text-sm text-white">
                {perfil.primeiraAtivacao ? "Ativar perfil" : "Despausar"}
              </button>
            </form>
          )
        )}
      </div>
    </li>
  );
}

export default async function InicioPage({ searchParams }: PageProps<"/">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const perfis = await comOperador(obterDb(), operador.id, (tx) => saudeDosPerfis(tx, new Date()));

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold">Saúde dos perfis</h1>
      <p className="mt-1 text-sm text-neutral-600">
        O teto é do perfil, não da campanha. Qualquer operador pode pausar; despausar fica registrado com o seu nome.
      </p>
      {typeof msg === "string" && <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">{msg}</p>}
      <ul className="mt-5 flex flex-col gap-3">
        {perfis.map((perfil) => (
          <CartaoDoPerfil key={perfil.id} perfil={perfil} />
        ))}
      </ul>
    </section>
  );
}
