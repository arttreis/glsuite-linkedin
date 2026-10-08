import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { avaliarGate, type Gate } from "@/server/perfis/modo";
import { exigirOperador } from "@/server/supabase/servidor";
import {
  atualizarStatusDasContas,
  conectarLinkedIn,
  registrarResultadoDoEval,
  registrarWebhooksNaUnipile,
  trocarModoDoPerfil,
} from "./acoes";

type LinhaPerfil = {
  id: string;
  nome: string;
  praca: string;
  status: "ativo" | "pausado";
  motivo_pausa: string | null;
  conectado: boolean;
  unipile_status: string | null;
  tipo_conta: string;
  modo_resposta: string;
  acessivel: boolean;
};

const PRACAS: Record<string, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

const MODOS = ["manual", "aprovacao", "automatico"] as const;

/** O que falta para ligar o automático (gate da §7.1). */
function GateDoAutomatico({ gate }: { gate: Gate }) {
  if (gate.liberado) return <span className="text-emerald-700">Gate do automático cumprido.</span>;
  return (
    <details className="text-neutral-600">
      <summary className="cursor-pointer">Automático bloqueado ({gate.motivos.length})</summary>
      <ul className="mt-1 list-disc pl-5">
        {gate.motivos.map((motivo) => (
          <li key={motivo}>{motivo}</li>
        ))}
      </ul>
    </details>
  );
}

const AVISOS: Record<string, string> = {
  ok: "Conta conectada. O perfil segue pausado até alguém ativar.",
  falhou: "A conexão não foi concluída na Unipile. Tente de novo.",
};

export default async function PerfisPage({ searchParams }: PageProps<"/perfis">) {
  const operador = await exigirOperador();
  const params = await searchParams;
  const perfis = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<LinhaPerfil>(`
      select id, nome, praca, status, motivo_pausa, unipile_account_id is not null as conectado,
             unipile_status, tipo_conta, modo_resposta, public.pode_ver_perfil(id) as acessivel
        from public.perfis
       order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug), nome`),
  );
  const agora = new Date();
  const gates = new Map<string, Gate>();
  for (const perfil of perfis) {
    if (perfil.acessivel && perfil.modo_resposta === "aprovacao") gates.set(perfil.id, await avaliarGate(obterDb(), perfil.id, agora));
  }
  const bloqueios = typeof params.bloqueio === "string" ? [params.bloqueio] : (params.bloqueio ?? []);
  const aviso = typeof params.conexao === "string" ? AVISOS[params.conexao] : undefined;

  return (
    <section className="max-w-4xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Perfis</h1>
        <form action={atualizarStatusDasContas}>
          <button type="submit" className="text-sm text-neutral-700 underline underline-offset-2">
            Atualizar status das contas
          </button>
        </form>
      </div>
      {aviso && <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">{aviso}</p>}
      {bloqueios.length > 0 && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Não foi possível:</p>
          <ul className="mt-1 list-disc pl-5">
            {bloqueios.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        </div>
      )}
      {typeof params.eval === "string" && (
        <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">Eval registrado ({params.eval}).</p>
      )}
      {typeof params.webhooks === "string" && (
        <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">
          Webhooks conferidos na Unipile ({params.webhooks} criados agora).
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-3">
        {perfis.map((perfil) => (
          <li key={perfil.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  {perfil.nome}{" "}
                  <span className="text-sm font-normal text-neutral-500">· {PRACAS[perfil.praca]}</span>
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {perfil.conectado
                    ? `LinkedIn conectado (${perfil.unipile_status ?? "status desconhecido"}, conta ${perfil.tipo_conta})`
                    : "LinkedIn não conectado"}{" "}
                  · modo {perfil.modo_resposta}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    perfil.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {perfil.status}
                </span>
                {perfil.acessivel && (
                  <form action={conectarLinkedIn}>
                    <input type="hidden" name="perfilId" value={perfil.id} />
                    <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                      {perfil.conectado ? "Reconectar LinkedIn" : "Conectar LinkedIn"}
                    </button>
                  </form>
                )}
              </div>
            </div>
            {perfil.status === "pausado" && perfil.motivo_pausa && (
              <p className="mt-2 text-sm text-neutral-600">{perfil.motivo_pausa}</p>
            )}
            {perfil.acessivel && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3 text-sm">
                <form action={trocarModoDoPerfil} className="flex items-center gap-2">
                  <input type="hidden" name="perfilId" value={perfil.id} />
                  <label htmlFor={`modo-${perfil.id}`} className="text-neutral-600">
                    Modo de resposta
                  </label>
                  <select
                    id={`modo-${perfil.id}`}
                    name="modo"
                    defaultValue={perfil.modo_resposta}
                    className="rounded-md border border-neutral-300 px-2 py-1"
                  >
                    {MODOS.filter((modo) => modo !== "automatico" || perfil.praca !== "espanha").map((modo) => (
                      <option key={modo} value={modo}>
                        {modo}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
                    Trocar
                  </button>
                </form>
                {gates.has(perfil.id) && <GateDoAutomatico gate={gates.get(perfil.id)!} />}
              </div>
            )}
          </li>
        ))}
      </ul>

      {operador.papel === "admin" && (
        <div className="mt-6 flex items-center gap-4 text-sm">
          <form action={registrarWebhooksNaUnipile}>
            <button type="submit" className="text-neutral-700 underline underline-offset-2">
              Registrar webhooks na Unipile
            </button>
          </form>
          <a href="/integracoes" className="text-neutral-700 underline underline-offset-2">
            Integrações (RD Station)
          </a>
        </div>
      )}
      {operador.papel === "admin" && (
        <form action={registrarResultadoDoEval} className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="relatorio" className="text-neutral-600">
            Resultado do eval (relatorio.json da rodada)
          </label>
          <input id="relatorio" name="relatorio" type="file" accept="application/json,.json" className="text-sm" />
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
            Registrar eval
          </button>
        </form>
      )}
    </section>
  );
}
