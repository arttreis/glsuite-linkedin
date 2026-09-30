import Link from "next/link";
import { listarFila, taxaDeEdicao } from "@/server/aprovacao/fila";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { aprovarComEdicao, aprovarComoEsta, rejeitar } from "./acoes";

const hora = (valor: Date | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";

const SUGESTOES: Record<string, string> = {
  responder: "responder",
  propor_reuniao: "propor reunião",
  encerrar: "encerrar (disse não)",
};

export default async function AprovacaoPage({ searchParams }: PageProps<"/aprovacao">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const { itens, taxas } = await comOperador(obterDb(), operador.id, async (tx) => ({
    itens: await listarFila(tx),
    taxas: await taxaDeEdicao(tx, { agora: new Date() }),
  }));

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold">Fila de aprovação</h1>
      <p className="mt-1 text-sm text-neutral-600">
        No modo aprovação, nada da IA sai sem passar por aqui. A edição guarda o texto original e o final.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {taxas.map((t) => (
          <span key={t.perfilId} className="rounded-full border border-neutral-300 bg-white px-3 py-1">
            {t.perfil}: {t.taxa === null ? "sem decisões em 14 dias" : `${Math.round(t.taxa * 100)}% editados ou rejeitados`}
            {t.decididas > 0 && ` (${t.editadas} editados, ${t.rejeitadas} rejeitados de ${t.decididas})`}
          </span>
        ))}
      </div>

      {typeof msg === "string" && <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm">{msg}</p>}

      {itens.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Fila vazia.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {itens.map((item) => (
            <li key={item.acaoId} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link href={`/inbox/${item.leadId}`} className="font-medium underline-offset-2 hover:underline">
                    {item.pessoa}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-500">
                    {item.empresa ?? "sem empresa"} · {item.perfil} · {item.estadoLead}
                  </span>
                </div>
                <span className="text-xs text-neutral-500">
                  {item.toque ? `${item.toque} da régua (${item.origem})` : "resposta da IA"}
                  {item.acaoSugerida && ` · ${SUGESTOES[item.acaoSugerida] ?? item.acaoSugerida}`}
                  {item.confianca !== null && ` · confiança ${Math.round(item.confianca * 100)}%`}
                </span>
              </div>

              {item.ultimaEntrada && (
                <p className="mt-2 rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  <span className="text-xs text-neutral-400">A pessoa, {hora(item.ultimaEntradaEm)}: </span>
                  {item.ultimaEntrada}
                </p>
              )}
              {item.motivoRevisao && <p className="mt-2 text-sm text-red-700">Atenção: {item.motivoRevisao}</p>}
              {item.motivoDoAgente && <p className="mt-1 text-xs text-neutral-500">Motivo do agente: {item.motivoDoAgente}</p>}

              <form className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="acaoId" value={item.acaoId} />
                <textarea
                  name="texto"
                  defaultValue={item.textoFinal ?? item.textoGerado ?? ""}
                  rows={4}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button formAction={aprovarComoEsta} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                    Aprovar como está
                  </button>
                  <button formAction={aprovarComEdicao} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                    Aprovar com a edição
                  </button>
                  <button formAction={rejeitar} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700">
                    Rejeitar
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
