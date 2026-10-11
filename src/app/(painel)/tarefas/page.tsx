import { randomUUID } from "node:crypto";
import { Check, Send } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { AbasDeConversas } from "@/components/abas-de-conversas";
import { Cabecalho } from "@/components/cabecalho";
import { rotuloDoToque } from "@/domain/rotulos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { listarTarefas } from "@/server/tarefas/tarefas";
import { enviarPeloPainel, marcarComoFeita } from "./acoes";

const data = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export default async function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  const operador = await exigirOperadorNoApp();
  const { msg } = await searchParams;
  const tarefas = await comOperador(obterDb(), operador.id, (tx) => listarTarefas(tx, new Date()));

  return (
    <>
      <Cabecalho
        titulo="Tarefas manuais"
        descricao="Mensagens que alguém escreve à mão, no dia certo: na Espanha a lei não deixa automatizar as mensagens, e qualquer campanha pode ter um bloco de tarefa manual no fluxo. Use o roteiro como base e escreva com as suas palavras."
      />
      <div className="max-w-3xl">
        <AbasDeConversas atual="/tarefas" />
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}

        {tarefas.length === 0 ? (
          <p className="vazio">
            Nenhuma tarefa agora. Elas aparecem quando um lead chega num bloco de tarefa manual, ou numa mensagem do perfil da Espanha.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {tarefas.map((t) => (
              <li key={t.acaoId} className="cartao p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar nome={t.pessoa} />
                    <div className="min-w-0">
                      <a href={t.urlPublica} target="_blank" rel="noreferrer" className="link font-medium">
                        {t.pessoa}
                      </a>
                      <p className="text-xs text-tinta-fraca">
                        {t.cargo ?? "sem cargo"}, {t.empresa ?? "sem empresa"}, perfil {t.perfil} ·{" "}
                        <Link href={`/chats/${t.leadId}`} className="link">
                          ver conversa
                        </Link>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="etiqueta">{rotuloDoToque(t.toque, null, "tarefa_manual")}</span>
                    {t.vencida ? (
                      <span className="etiqueta etiqueta-ponto etiqueta-atencao">Já pode enviar</span>
                    ) : (
                      <span className="etiqueta">Liberada em {data(t.agendadaPara)} (Madri)</span>
                    )}
                  </div>
                </div>
                {t.roteiro && (
                  <div className="recuo mt-4">
                    <p className="text-xs text-tinta-fraca">Roteiro de apoio</p>
                    <p className="mt-1 whitespace-pre-wrap text-tinta">{t.roteiro}</p>
                  </div>
                )}
                <form className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="leadId" value={t.leadId} />
                  <input type="hidden" name="acaoId" value={t.acaoId} />
                  <input type="hidden" name="chave" value={randomUUID()} />
                  <textarea
                    name="texto"
                    rows={3}
                    aria-label={`Mensagem para ${t.pessoa}`}
                    placeholder="Escreva a mensagem com as suas palavras."
                    className="campo w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button formAction={enviarPeloPainel} className="botao botao-primario">
                      <Send aria-hidden />
                      Enviar pelo LinkedIn
                    </button>
                    <button formAction={marcarComoFeita} className="botao">
                      <Check aria-hidden />
                      Já enviei pelo LinkedIn
                    </button>
                  </div>
                  <p className="text-xs text-tinta-fraca">
                    Enviar pelo LinkedIn manda o seu texto daqui. Se você já escreveu pelo app do LinkedIn, marque como enviada.
                    Nos dois casos a tarefa sai da lista e a próxima mensagem é agendada; se a pessoa responder, as próximas são
                    canceladas e a conversa vai para a Inbox.
                  </p>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
