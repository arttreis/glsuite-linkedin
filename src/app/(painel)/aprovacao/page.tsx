import { Check, X } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { Cabecalho } from "@/components/cabecalho";
import { ROTULO_DO_ESTADO, type EstadoDoLead } from "@/domain/estados";
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
    <>
      <Cabecalho
        titulo="Fila de aprovação"
        descricao="No modo aprovação, nada da IA sai sem passar por aqui. A edição guarda o texto original e o final."
      />
      <div className="max-w-4xl">
        <h2 className="text-[13px] font-medium text-tinta-suave">Edição ou rejeição nos últimos 14 dias</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {taxas.map((t) => (
            <div key={t.perfilId} className="cartao px-4 py-3">
              <dt className="text-xs text-tinta-suave">{t.perfil}</dt>
              <dd className="mt-1.5 text-lg leading-none tabular-nums">{t.taxa === null ? "—" : `${Math.round(t.taxa * 100)}%`}</dd>
              <dd className="mt-1.5 text-xs text-tinta-fraca">
                {t.decididas > 0
                  ? `${t.editadas} editados e ${t.rejeitadas} rejeitados de ${t.decididas}`
                  : "sem decisões no período"}
              </dd>
            </div>
          ))}
        </dl>

        {typeof msg === "string" && <Aviso className="mt-6">{msg}</Aviso>}

        {itens.length === 0 ? (
          <p className="vazio mt-8">A fila está vazia. Os rascunhos da IA aparecem aqui quando alguém responder.</p>
        ) : (
          <ul className="mt-8 flex flex-col gap-4">
            {itens.map((item) => (
              <li key={item.acaoId} className="cartao p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar nome={item.pessoa} />
                    <div className="min-w-0">
                      <Link href={`/inbox/${item.leadId}`} className="link font-medium">
                        {item.pessoa}
                      </Link>
                      <p className="text-xs text-tinta-fraca">
                        {item.empresa ?? "sem empresa"}, {item.perfil}, {ROTULO_DO_ESTADO[item.estadoLead as EstadoDoLead] ?? item.estadoLead}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="etiqueta">
                      {item.toque
                        ? item.toque === "T1" && item.origem === "ia"
                          ? "T1 personalizado"
                          : `${item.toque} da régua (${item.origem})`
                        : "Resposta da IA"}
                    </span>
                    {item.acaoSugerida && <span className="etiqueta">{SUGESTOES[item.acaoSugerida] ?? item.acaoSugerida}</span>}
                    {item.confianca !== null && <span className="etiqueta tabular-nums">confiança {Math.round(item.confianca * 100)}%</span>}
                  </div>
                </div>

                {item.ultimaEntrada && (
                  <div className="recuo mt-4">
                    <p className="text-xs text-tinta-fraca">A pessoa, {hora(item.ultimaEntradaEm)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-tinta">{item.ultimaEntrada}</p>
                  </div>
                )}
                {item.motivoRevisao && (
                  <Aviso tom="atencao" className="mt-3">
                    {item.motivoRevisao}
                  </Aviso>
                )}
                {item.motivoDoAgente && (
                  <p className="mt-3 text-xs text-tinta-suave">
                    <span className="text-tinta-fraca">Motivo do agente:</span> {item.motivoDoAgente}
                  </p>
                )}
                {item.gancho && (
                  <p className="mt-1.5 text-xs text-tinta-suave">
                    <span className="text-tinta-fraca">Gancho da pesquisa:</span> {item.gancho}
                  </p>
                )}

                <form className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="acaoId" value={item.acaoId} />
                  <textarea
                    name="texto"
                    defaultValue={item.textoFinal ?? item.textoGerado ?? ""}
                    rows={4}
                    aria-label={`Texto para ${item.pessoa}`}
                    className="campo w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button formAction={aprovarComoEsta} className="botao botao-primario">
                      <Check aria-hidden />
                      Aprovar como está
                    </button>
                    <button formAction={aprovarComEdicao} className="botao">
                      Aprovar com a edição
                    </button>
                    <button formAction={rejeitar} className="botao botao-perigo">
                      <X aria-hidden />
                      Rejeitar
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
