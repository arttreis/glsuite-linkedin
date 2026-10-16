import { Hand, History, MessagesSquare, Sparkles } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { passagensRecentes, type PassagensRecentes } from "@/server/sdr/passagens";
import { historicoDoSdr, obterSdr, type Origem } from "@/server/sdr/sdr";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { montarSdrDoPainel, trocarModoDaConta, voltarParaVersaoDoPainel } from "../acoes";
import { EditorDoSdr } from "./editor-do-sdr";
import { PassagemParaVoce } from "./passagem-para-voce";

const ORIGEM: Record<Origem, string> = {
  ia: "Montado da análise do site",
  humano: "Editado",
  ajuste: "Ajustado no chat de teste",
  desfazer: "Volta para uma versão anterior",
};

const quando = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** As conversas que o SDR passou para você no último mês e o que acontece depois (§4.7). */
function UltimasPassagens({ recentes }: { recentes: PassagensRecentes }) {
  const { dias, passagens, passadas, tratadas } = recentes;
  return (
    <section className="cartao p-5" aria-labelledby="titulo-passagens">
      <h2 id="titulo-passagens" className="flex items-center gap-2 text-[15px] font-semibold">
        <Hand className="size-4 text-tinta-suave" aria-hidden />
        Conversas que o SDR passou para você
      </h2>
      <p className="mt-1 text-[13px] text-tinta-suave">
        {tratadas === 0
          ? `Nos últimos ${dias} dias nenhum lead respondeu ainda. Enquanto isso, teste no chat.`
          : `Nos últimos ${dias} dias, de ${plural(tratadas, "mensagem de lead", "mensagens de leads")}, o SDR passou ${passadas} para você (${Math.round((passadas / tratadas) * 100)}%). Se parecer demais ou de menos, ajuste os casos e o nível de dúvida acima.`}
      </p>

      {passagens.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-linha">
          {passagens.map((p) => (
            <li key={`${p.leadId}-${new Date(p.em).toISOString()}`} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 basis-72">
                <p className="text-sm">
                  {p.empresa ? `${p.nome}, ${p.empresa}` : p.nome}
                  {p.comVoce && <span className="etiqueta etiqueta-atencao ml-2">com você</span>}
                </p>
                <p className="mt-0.5 text-[13px] text-tinta-suave">{p.motivo ? `Motivo: ${p.motivo}` : "Sem motivo registrado."}</p>
                <p className="mt-0.5 text-xs text-tinta-fraca">
                  {p.conta} · {quando(p.em)}
                </p>
              </div>
              <Link href={`/chats/${p.leadId}`} className="botao botao-pequeno">
                Abrir conversa
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-xs uppercase tracking-[0.12em] text-tinta-fraca">O que acontece quando ele passa</h3>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-tinta-suave">
        <li>Ele para de responder aquela conversa. Nada sai em nome dele.</li>
        <li>Quem opera a conta recebe um e-mail com o motivo, e a conversa aparece em Precisa de você, no Dashboard.</li>
        <li>Você responde pelo Chats ou direto no LinkedIn. Quando quiser, &quot;Devolver ao SDR&quot;, na conversa, põe ele de volta.</li>
      </ol>
      <p className="mt-2 text-[13px] text-tinta-fraca">Se você responder antes de ele chamar, a conversa também passa a ser sua.</p>
    </section>
  );
}

/**
 * SDR (§4.12): os campos, o teste no chat, quando ele passa a conversa para
 * você (com as últimas passagens), o modo de resposta de cada conta e o
 * histórico com voltar.
 */
export default async function SdrPage({ searchParams }: PageProps<"/settings/sdr">) {
  const operador = await exigirOperadorComModulo("linkedin");
  const { msg } = await searchParams;
  const { sdr, historico, contas, passagens } = await comOperador(obterDb(), operador.id, async (tx) => ({
    sdr: await obterSdr(tx, operador.organizacaoId),
    historico: await historicoDoSdr(tx, operador.organizacaoId),
    passagens: await passagensRecentes(tx, { agora: new Date() }),
    contas: await tx.query<{ id: string; nome: string; modo_resposta: "aprovacao" | "automatico" }>(
      "select id, nome, modo_resposta from public.perfis where not casa and arquivado_em is null and public.pode_ver_perfil(id) order by nome",
    ),
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}

      {!sdr ? (
        <section className="cartao cartao-vitrine p-6">
          <h2 className="text-[15px] font-semibold">O SDR ainda não foi montado</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Até lá, cada conta responde com a própria voz. O SDR sai da análise do site confirmada; depois você testa no chat e ajusta.
          </p>
          <form action={montarSdrDoPainel} className="mt-4">
            <button type="submit" className="botao botao-primario">
              <Sparkles aria-hidden />
              Montar o SDR
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="cartao cartao-vitrine flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0 flex-1 basis-72">
              <p className="font-medium">Teste o SDR como se fosse um lead</p>
              <p className="mt-1 text-[13px] text-tinta-suave">
                O mesmo agente que responde os leads. Quando uma resposta não ficar boa, ajuste ali mesmo e veja ele responder de novo.
              </p>
            </div>
            <Link href="/settings/sdr/test" className="botao botao-primario">
              <MessagesSquare aria-hidden />
              Testar no chat
            </Link>
          </section>
          <EditorDoSdr key={sdr.versao} inicial={sdr.sdr} />
          <PassagemParaVoce
            key={`passagem-${sdr.versao}`}
            inicial={{ quando_chamar_voce: sdr.sdr.quando_chamar_voce, cautela: sdr.sdr.cautela }}
            temLinkDeAgenda={sdr.sdr.link_agenda !== null}
          />
          <UltimasPassagens recentes={passagens} />
        </>
      )}

      {contas.length > 0 && (
        <section className="cartao p-5" aria-labelledby="titulo-modo">
          <h2 id="titulo-modo" className="text-[15px] font-semibold">
            Como cada conta responde
          </h2>
          <p className="mt-1 text-[13px] text-tinta-suave">
            Sozinho: o SDR responde e chama você quando precisa. Aprovo cada resposta: a resposta espera você no chat, com Enviar, Editar e
            Descartar. Vale para a próxima resposta.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {contas.map((conta) => (
              <li key={conta.id}>
                <form action={trocarModoDaConta} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linha px-4 py-3">
                  <input type="hidden" name="perfilId" value={conta.id} />
                  <span className="text-sm font-medium">{conta.nome}</span>
                  <span className="flex items-center gap-2">
                    <select name="modo" defaultValue={conta.modo_resposta} aria-label={`Modo de resposta de ${conta.nome}`} className="campo campo-pequeno w-auto">
                      <option value="automatico">O SDR responde sozinho</option>
                      <option value="aprovacao">Aprovo cada resposta</option>
                    </select>
                    <button type="submit" className="botao botao-pequeno">
                      Trocar
                    </button>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {historico.length > 0 && (
        <section className="cartao p-5" aria-labelledby="titulo-historico">
          <h2 id="titulo-historico" className="flex items-center gap-2 text-[15px] font-semibold">
            <History className="size-4 text-tinta-suave" aria-hidden />
            Histórico
          </h2>
          <ol className="mt-4 flex flex-col divide-y divide-linha">
            {historico.map((versao, indice) => (
              <li key={versao.versao} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="text-sm">
                    <span className="mr-2 text-xs tabular-nums text-tinta-fraca">v{versao.versao}</span>
                    {ORIGEM[versao.origem]}
                    {versao.por ? ` por ${versao.por}` : ""}
                    <span className="ml-2 text-xs text-tinta-fraca">{quando(versao.em)}</span>
                  </p>
                  {versao.pedido && <p className="mt-0.5 text-[13px] text-tinta-suave">Pedido: “{versao.pedido}”</p>}
                  {versao.resumo && <p className="mt-0.5 text-[13px] text-tinta-suave">{versao.resumo}</p>}
                </div>
                {indice === 0 ? (
                  <span className="etiqueta etiqueta-ok">atual</span>
                ) : (
                  <form action={voltarParaVersaoDoPainel}>
                    <input type="hidden" name="versao" value={versao.versao} />
                    <button type="submit" className="botao botao-pequeno">
                      Voltar para esta
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
