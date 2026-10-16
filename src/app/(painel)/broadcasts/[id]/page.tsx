import { Pause, Play, RotateCcw, Send, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { NOME_DO_CANAL } from "@/domain/disparos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { conferirDisparo, obterDisparo, resultadoDoDisparo, type Conferencia, type DisparoGuardado, type ResultadoDoDisparo } from "@/server/disparos/disparos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { cancelarDisparoDoPainel, confirmarDisparoDoPainel, pausarDisparoDoPainel, retomarDisparoDoPainel, tentarDeNovoDoPainel } from "../acoes";
import { BarraDoDisparo, EtiquetaDoDisparo, progresso } from "../situacao";

const FUSO = "America/Sao_Paulo";
const quando = (valor: Date) => new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const moeda = (valor: number, codigo: string) => valor.toLocaleString("pt-BR", { style: "currency", currency: codigo });
const pessoas = (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "pessoa" : "pessoas"}`;

/** Um botão de controle do disparo: um formulário com o id. */
function Controle({ acao, disparoId, children, perigo = false }: { acao: (formData: FormData) => Promise<void>; disparoId: string; children: React.ReactNode; perigo?: boolean }) {
  return (
    <form action={acao}>
      <input type="hidden" name="disparoId" value={disparoId} />
      <button type="submit" className={`botao botao-pequeno ${perigo ? "botao-perigo" : ""}`}>
        {children}
      </button>
    </form>
  );
}

/** Antes de confirmar (§4.18): quem recebe, quem fica de fora e por quê, como chega e quanto a Meta cobra. */
function ConferenciaDoDisparo({ disparo, conferencia, comecaDepois }: { disparo: DisparoGuardado; conferencia: Conferencia; comecaDepois: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-recebem">
          <h2 id="titulo-recebem" className="text-[15px] font-semibold">
            Quem recebe
          </h2>
          <p className="text-3xl font-semibold tabular-nums">{pessoas(conferencia.recebem)}</p>
          <p className="text-[13px] text-tinta-suave">
            Do segmento {disparo.segmentoNome ?? "(apagado)"}, como ele está agora. Na confirmação a lista congela: quem entrar no segmento depois não
            recebe este disparo.
          </p>
          {conferencia.deFora.length > 0 && (
            <div className="border-t border-linha pt-3">
              <p className="text-[13px] font-medium">Ficam de fora</p>
              <ul className="mt-2 flex flex-col gap-1 text-[13px] text-tinta-suave">
                {conferencia.deFora.map((item) => (
                  <li key={item.motivo} className="flex justify-between gap-3">
                    <span>{item.motivo}</span>
                    <span className="tabular-nums">{item.quantos}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        {conferencia.exemplos.length > 0 && (
          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-exemplos">
            <h2 id="titulo-exemplos" className="text-[15px] font-semibold">
              Como chega
            </h2>
            {conferencia.exemplos.map((exemplo) => (
              <div key={exemplo.nome}>
                <p className="text-xs text-tinta-fraca">Para {exemplo.nome}</p>
                <p className="mt-1 whitespace-pre-line rounded-xl bg-superficie-alta p-3 text-sm">{exemplo.texto}</p>
              </div>
            ))}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-confirmar">
          <h2 id="titulo-confirmar" className="text-[15px] font-semibold">
            Confirmar
          </h2>
          {conferencia.recebem === 0 && (
            <p className="text-[13px] text-tinta-suave">
              Ninguém do segmento pode receber agora. Veja ao lado quem ficou de fora e por quê, mude o segmento ou volte depois.
            </p>
          )}
          {conferencia.recebem > 0 && conferencia.custo && (
            <p className="text-[13px] text-tinta-suave">
              A Meta cobra cerca de <span className="text-tinta">{moeda(conferencia.custo.valor, conferencia.custo.moeda)}</span> por estas mensagens
              ({conferencia.custo.categoria.toLowerCase()}), direto na conta do WhatsApp Business da empresa. Só cobra o que for entregue.
            </p>
          )}
          {conferencia.limite !== null && (
            <Aviso tom="atencao">
              O limite da Meta hoje é de {pessoas(conferencia.limite)} a cada 24 h. O disparo pausa quando chegar nele, e você retoma no dia seguinte.
            </Aviso>
          )}
          {conferencia.recebem > 0 && (
          <form action={confirmarDisparoDoPainel} className="flex flex-col gap-3">
            <input type="hidden" name="disparoId" value={disparo.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="quando" value="agora" defaultChecked className="size-4" />
              {comecaDepois ? `Assim que der: começa em ${quando(conferencia.comecaEm)}` : "Agora"}
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input type="radio" name="quando" value="agendar" className="size-4" />
              Agendar para
              <input type="datetime-local" name="agendadoPara" aria-label="Dia e hora do disparo (horário de Brasília)" className="campo campo-pequeno w-auto" />
            </label>
            <p className="text-xs text-tinta-fraca">
              Sai das {conferencia.janela.inicio} às {conferencia.janela.fim}, horário de Brasília. O que não couber continua no dia seguinte.
            </p>
            <button type="submit" className="botao botao-primario">
              <Send aria-hidden />
              Disparar para {pessoas(conferencia.recebem)}
            </button>
          </form>
          )}
          <div className="flex flex-wrap gap-2 border-t border-linha pt-3">
            <Link href={`/broadcasts/new?draft=${disparo.id}`} className="botao botao-pequeno">
              Mudar a mensagem ou o segmento
            </Link>
            <Controle acao={cancelarDisparoDoPainel} disparoId={disparo.id} perigo>
              <X aria-hidden />
              Descartar
            </Controle>
          </div>
        </section>
      </aside>
    </div>
  );
}

/** Depois de confirmar (§4.18): o andamento, as falhas com o motivo, quem ficou de fora e as respostas. */
function ResultadoDoDisparoNaTela({ disparo, resultado }: { disparo: DisparoGuardado; resultado: ResultadoDoDisparo }) {
  const { contagem } = resultado;
  const { faltam } = progresso(contagem);
  const voltam = resultado.falhas.filter((f) => f.volta).length;
  const numeros: [string, number][] = [
    ["Na fila", faltam],
    ["Enviadas", contagem.enviado + contagem.entregue + contagem.lido],
    ["Entregues", contagem.entregue + contagem.lido],
    ...(disparo.canalTipo === "whatsapp" ? ([["Lidas", contagem.lido]] as [string, number][]) : []),
    ["Responderam", contagem.responderam],
    ["Falharam", contagem.falhou],
    ["Ficaram de fora", contagem.pulado + contagem.cancelado],
  ];
  return (
    <div className="flex flex-col gap-5">
      <section className="cartao flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-tinta-suave">
            {disparo.confirmadoEm && `Confirmado por ${disparo.confirmadoPor ?? "alguém da equipe"} em ${quando(disparo.confirmadoEm)}`}
            {disparo.agendadoPara && ` · para ${quando(disparo.agendadoPara)}`}
            {disparo.concluidoEm && ` · terminou em ${quando(disparo.concluidoEm)}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {(disparo.status === "agendado" || disparo.status === "enviando") && (
              <Controle acao={pausarDisparoDoPainel} disparoId={disparo.id}>
                <Pause aria-hidden />
                Pausar
              </Controle>
            )}
            {disparo.status === "pausado" && (
              <Controle acao={retomarDisparoDoPainel} disparoId={disparo.id}>
                <Play aria-hidden />
                Retomar
              </Controle>
            )}
            {voltam > 0 && disparo.status !== "cancelado" && (
              <Controle acao={tentarDeNovoDoPainel} disparoId={disparo.id}>
                <RotateCcw aria-hidden />
                Tentar de novo as falhas ({voltam})
              </Controle>
            )}
            {["agendado", "enviando", "pausado"].includes(disparo.status) && (
              <Controle acao={cancelarDisparoDoPainel} disparoId={disparo.id} perigo>
                <X aria-hidden />
                Cancelar
              </Controle>
            )}
          </div>
        </div>
        {disparo.status === "pausado" && disparo.motivoPausa && <Aviso tom="atencao">{disparo.motivoPausa}</Aviso>}
        <BarraDoDisparo contagem={contagem} />
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {numeros.map(([rotulo, valor]) => (
            <div key={rotulo}>
              <dt className="text-xs text-tinta-fraca">{rotulo}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</dd>
            </div>
          ))}
        </dl>
      </section>

      {resultado.respostas.length > 0 && (
        <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-respostas">
          <h2 id="titulo-respostas" className="text-[15px] font-semibold">
            Respostas
          </h2>
          <ul className="flex flex-col gap-2">
            {resultado.respostas.map((resposta, indice) => (
              <li key={`${resposta.contatoId}-${indice}`} className="rounded-xl bg-superficie-alta px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-tinta-fraca">
                  {resposta.contatoId ? (
                    <Link href={`/contacts/${resposta.contatoId}`} className="link text-[13px] font-medium text-tinta">
                      {resposta.nome}
                    </Link>
                  ) : (
                    <span className="text-[13px] font-medium text-tinta">{resposta.nome}</span>
                  )}
                  {quando(resposta.em)}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{resposta.texto}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-tinta-fraca">Para responder, use o próprio {NOME_DO_CANAL[disparo.canalTipo]}: o Kakou só dispara por ele.</p>
        </section>
      )}

      {resultado.falhas.length > 0 && (
        <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-falhas">
          <h2 id="titulo-falhas" className="text-[15px] font-semibold">
            Falhas
          </h2>
          <div className="tabela-moldura">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Motivo</th>
                  <th>Tenta de novo?</th>
                </tr>
              </thead>
              <tbody>
                {resultado.falhas.map((falha, indice) => (
                  <tr key={`${falha.destino}-${indice}`}>
                    <td>{falha.nome}</td>
                    <td className="text-[13px]">{falha.motivo}</td>
                    <td className="text-[13px] text-tinta-suave">{falha.volta ? "Sim, com o botão" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resultado.pulados.length > 0 && (
        <section className="cartao flex flex-col gap-2 p-5" aria-labelledby="titulo-pulados">
          <h2 id="titulo-pulados" className="text-[15px] font-semibold">
            Ficaram de fora
          </h2>
          <ul className="flex flex-col gap-1 text-[13px] text-tinta-suave">
            {resultado.pulados.map((item) => (
              <li key={item.motivo} className="flex justify-between gap-3">
                <span>{item.motivo}</span>
                <span className="tabular-nums">{item.quantos}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Um disparo (§4.18): a conferência, se é rascunho; o resultado, depois de confirmado. */
export default async function DisparoPage({ params, searchParams }: PageProps<"/broadcasts/[id]">) {
  const operador = await exigirOperadorComModulo(["whatsapp", "telegram"]);
  const { id } = await params;
  const { msg } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const agora = new Date();
  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const disparo = await obterDisparo(tx, { id, organizacaoId: operador.organizacaoId });
    if (!disparo) return null;
    if (disparo.status === "rascunho") return { disparo, conferencia: await conferirDisparo(tx, { disparo, agora }), resultado: null };
    return { disparo, conferencia: null, resultado: await resultadoDoDisparo(tx, disparo.id) };
  });
  if (!dados) notFound();
  const { disparo } = dados;
  const vivo = disparo.status === "agendado" || disparo.status === "enviando";

  return (
    <>
      {vivo && <AtualizarSozinho segundos={10} />}
      <Cabecalho titulo={disparo.nome} descricao={`Pelo ${NOME_DO_CANAL[disparo.canalTipo]}, para o segmento ${disparo.segmentoNome ?? "(apagado)"}.`} voltar={{ href: "/broadcasts", rotulo: "Disparos" }}>
        <EtiquetaDoDisparo status={disparo.status} />
      </Cabecalho>
      <div className="flex max-w-6xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {dados.conferencia && !dados.conferencia.ok && <Aviso tom="erro">{dados.conferencia.erro}</Aviso>}
        {dados.conferencia?.ok && (
          <ConferenciaDoDisparo disparo={disparo} conferencia={dados.conferencia} comecaDepois={dados.conferencia.comecaEm.getTime() > agora.getTime() + 60_000} />
        )}
        {dados.resultado && <ResultadoDoDisparoNaTela disparo={disparo} resultado={dados.resultado} />}
      </div>
    </>
  );
}
