import { randomUUID } from "node:crypto";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { listarTarefas } from "@/server/tarefas/tarefas";
import { enviarPeloPainel, marcarComoFeita } from "./acoes";

const data = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export default async function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const tarefas = await comOperador(obterDb(), operador.id, (tx) => listarTarefas(tx, new Date()));

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold">Tarefas manuais</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Na Espanha, do aceite em diante cada toque é escrito à mão (§4.5). O roteiro é apoio, não texto para colar.
      </p>
      {typeof msg === "string" && <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">{msg}</p>}

      {tarefas.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nenhuma tarefa pendente.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {tarefas.map((t) => (
            <li key={t.acaoId} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a href={t.urlPublica} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
                    {t.pessoa}
                  </a>
                  <span className="ml-2 text-xs text-neutral-500">
                    {t.cargo ?? "sem cargo"} · {t.empresa ?? "sem empresa"} · {t.perfil}
                  </span>
                </div>
                <span className={`text-xs ${t.vencida ? "font-medium text-amber-700" : "text-neutral-500"}`}>
                  {t.toque} · {t.vencida ? "para hoje" : `a partir de ${data(t.agendadaPara)}`}
                </span>
              </div>
              {t.roteiro && (
                <p className="mt-2 rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  <span className="text-xs uppercase tracking-wide text-neutral-400">Roteiro de apoio</span>
                  <br />
                  {t.roteiro}
                </p>
              )}
              <form className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="leadId" value={t.leadId} />
                <input type="hidden" name="acaoId" value={t.acaoId} />
                <input type="hidden" name="chave" value={randomUUID()} />
                <textarea
                  name="texto"
                  rows={3}
                  placeholder="Escreva a mensagem com as suas palavras."
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button formAction={enviarPeloPainel} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                    Enviar pelo LinkedIn
                  </button>
                  <button formAction={marcarComoFeita} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                    Já enviei direto no LinkedIn
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
