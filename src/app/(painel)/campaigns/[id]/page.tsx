import { Bot, Pause, Pencil, Play, ShieldCheck, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDaCampanha } from "@/components/etiquetas";
import { linhaDoTempo } from "@/domain/linha-do-tempo";
import { LIMITE_DAS_INSTRUCOES, obterCampanha } from "@/server/campanhas/painel";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { fluxoDaCampanha } from "@/server/fluxo/fluxos";
import { calcularFunil } from "@/server/metricas/funil";
import { situacaoDasNotas } from "@/server/nota/nota";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { situacaoDaBusca } from "@/server/publicos/busca";
import { obterPublico } from "@/server/publicos/publicos";
import { obterSdr } from "@/server/sdr/sdr";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { EditorDoPublico } from "../editor-do-publico";
import { ResumoDoPublico } from "../resumo-do-publico";
import { alterarStatusDaCampanha, escreverAbordagemDoPainel, salvarInstrucoesDoPainel } from "../acoes";
import { dadosDoEditor } from "../dados";
import { EditorDeCampanha } from "../editor";
import { AbaLeads, type LeadParaTriar } from "./leads";
import { LinhaDoTempoDaCampanha } from "./linha-do-tempo";
import { AbaResultados } from "./resultados";

const ABAS = [
  { id: "audience", rotulo: "Público" },
  { id: "leads", rotulo: "Leads" },
  { id: "approach", rotulo: "Abordagem" },
  { id: "sdr", rotulo: "Instruções do SDR" },
  { id: "results", rotulo: "Resultados" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

function BotaoDeStatus({ campanhaId, status, aba, children, estilo = "" }: { campanhaId: string; status: string; aba: Aba; children: ReactNode; estilo?: string }) {
  return (
    <form action={alterarStatusDaCampanha}>
      <input type="hidden" name="campanhaId" value={campanhaId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="tab" value={aba} />
      <button type="submit" className={`botao ${estilo}`}>
        {children}
      </button>
    </form>
  );
}

export default async function CampanhaPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const operador = await exigirOperadorNoApp();
  const { id } = await params;
  const { tab, msg, salva } = await searchParams;
  const aba: Aba = ABAS.find((a) => a.id === tab)?.id ?? "leads";
  const agora = new Date();

  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const campanha = await obterCampanha(tx, id);
    if (!campanha) return null;
    const publico = campanha.publicoId ? await obterPublico(tx, campanha.publicoId) : null;
    const fluxo = await fluxoDaCampanha(tx, id);
    return {
      campanha,
      publico,
      fluxo,
      dossie: aba === "audience" ? await dossieConfirmado(tx, operador.organizacaoId) : null,
      busca: aba === "leads" ? await situacaoDaBusca(tx, id, agora) : null,
      notas: aba === "leads" ? await situacaoDasNotas(tx, id) : null,
      triar:
        aba === "leads"
          ? await tx.query<LeadParaTriar>(
              `select l.id, pe.nome, pe.cargo, pe.empresa, pe.localizacao, pe.url_publica as url, l.nota,
                      l.nota_motivo as "notaMotivo", l.bloqueio_motivo as bloqueio, l.alerta_triagem as alerta
                 from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
                where l.campanha_id = $1::uuid and l.estado = 'triagem'
                order by l.bloqueio_motivo is not null, l.nota desc nulls last, pe.nome
                limit 200`,
              [id],
            )
          : [],
      funil: aba === "results" ? await calcularFunil(tx, { campanhaId: id }) : null,
      sdr: aba === "sdr" ? await obterSdr(tx, operador.organizacaoId) : null,
    };
  });
  if (!dados || !dados.fluxo) notFound();
  const { campanha, publico, fluxo } = dados;
  const editor = aba === "approach" ? await dadosDoEditor(operador.id) : null;
  const linha = linhaDoTempo(fluxo);
  const encerrada = campanha.status === "encerrada";

  return (
    <>
      <Cabecalho
        titulo={campanha.nome}
        descricao={[publico ? `Para ${publico.nome}` : "Campanha sem público", `pela conta de ${campanha.conta}`].join(" · ")}
        voltar={{ href: "/campaigns", rotulo: "Campanhas" }}
      >
        <EtiquetaDaCampanha status={campanha.status} />
        {campanha.status === "ativa" && (
          <BotaoDeStatus campanhaId={id} status="pausada" aba={aba}>
            <Pause aria-hidden />
            Pausar
          </BotaoDeStatus>
        )}
        {campanha.status === "pausada" && (
          <BotaoDeStatus campanhaId={id} status="ativa" aba={aba} estilo="botao-primario">
            <Play aria-hidden />
            Retomar
          </BotaoDeStatus>
        )}
        {(campanha.status === "ativa" || campanha.status === "pausada") && (
          <BotaoDeStatus campanhaId={id} status="encerrada" aba={aba} estilo="botao-perigo">
            <Square aria-hidden />
            Encerrar
          </BotaoDeStatus>
        )}
      </Cabecalho>

      <div className="flex max-w-5xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {salva && <Aviso tom="ok">Campanha salva.</Aviso>}
        {!campanha.contaConectada || !campanha.contaAtiva ? (
          <Aviso tom="atencao">
            A conta de {campanha.conta} está {campanha.contaConectada ? "pausada" : "sem LinkedIn vinculado"}: nada sai dela até{" "}
            <Link href="/" className="link">
              ela voltar
            </Link>
            .
          </Aviso>
        ) : null}

        {campanha.status === "rascunho" && (
          <section className="cartao cartao-vitrine flex flex-wrap items-center justify-between gap-4 p-5" aria-label="Permissão">
            <div className="min-w-0 flex-1 basis-80">
              <p className="font-medium">Pode entrar em contato?</p>
              <p className="mt-1 text-[13px] text-tinta-suave">
                {campanha.leads.naFila} {campanha.leads.naFila === 1 ? "pessoa na fila" : "pessoas na fila"}. Os convites saem pela conta de{" "}
                {campanha.conta}, dentro do teto do dia, em dias úteis das 9h às 18h. O SDR responde e chama você quando precisar. Dá
                para pausar a qualquer momento.
              </p>
            </div>
            <BotaoDeStatus campanhaId={id} status="ativa" aba={aba} estilo="botao-primario">
              <ShieldCheck aria-hidden />
              Pode entrar em contato
            </BotaoDeStatus>
          </section>
        )}
        {campanha.permitidaEm && (
          <p className="text-xs text-tinta-fraca">
            Contato permitido por {campanha.permitidaPor ?? "alguém da equipe"} em{" "}
            {new Date(campanha.permitidaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.
          </p>
        )}

        <nav aria-label="Partes da campanha" className="segmentos">
          {ABAS.map((a) => (
            <Link key={a.id} href={`/campaigns/${id}?tab=${a.id}`} className="segmento" aria-current={aba === a.id ? "page" : undefined}>
              {a.rotulo}
            </Link>
          ))}
        </nav>

        {aba === "audience" &&
          (publico ? (
            <div className="flex flex-col gap-4">
              <div className="cartao p-5">
                <ResumoDoPublico p={publico} />
              </div>
              {!encerrada && dados.dossie && (
                <details className="cartao p-5">
                  <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
                    <Pencil className="size-4 text-tinta-suave" aria-hidden />
                    Editar o público
                  </summary>
                  <div className="mt-4">
                    <EditorDoPublico
                      id={publico.id}
                      inicial={publico}
                      status={publico.status === "sugerido" ? "sugerido" : "ativo"}
                      provasDoDossie={dados.dossie.provas.map((prova) => prova.texto)}
                      destino={`/campaigns/${id}?tab=audience`}
                    />
                  </div>
                </details>
              )}
            </div>
          ) : (
            <p className="vazio">Esta campanha foi criada à mão, sem público. A abordagem dela fica no editor de blocos.</p>
          ))}

        {aba === "leads" && dados.notas && (
          <AbaLeads
            campanha={{ id, nome: campanha.nome }}
            conta={campanha.conta}
            busca={dados.busca}
            atalhos={{
              regioes: publico?.empresa.regiao.split(",").map((parte) => parte.trim()).filter(Boolean) ?? [],
              setores: publico?.empresa.setores ?? [],
            }}
            notas={dados.notas}
            triar={dados.triar}
            numeros={{ naFila: campanha.leads.naFila, andamento: campanha.leads.andamento }}
          />
        )}

        {aba === "approach" && editor && (
          <div className="flex flex-col gap-5">
            {publico && !encerrada && (
              <div className="flex flex-wrap items-center gap-2">
                <form action={escreverAbordagemDoPainel}>
                  <input type="hidden" name="campanhaId" value={id} />
                  <input type="hidden" name="estilo" value="casa" />
                  <button type="submit" className="botao botao-pequeno">
                    <Sparkles aria-hidden />
                    Escrever de novo com a IA
                  </button>
                </form>
                <form action={escreverAbordagemDoPainel}>
                  <input type="hidden" name="campanhaId" value={id} />
                  <input type="hidden" name="estilo" value="pergunta" />
                  <button type="submit" className="botao botao-pequeno">
                    Variante: pergunta já na 1ª mensagem
                  </button>
                </form>
                <span className="text-xs text-tinta-fraca">Na voz do SDR. Substitui os textos abaixo.</span>
              </div>
            )}
            {!linha.completa && (
              <Aviso tom="atencao">Este fluxo tem desvios: os textos fora do caminho principal ficam no editor de blocos, abaixo.</Aviso>
            )}
            <section className="cartao p-5">
              <LinhaDoTempoDaCampanha
                campanhaId={id}
                passos={linha.passos}
                editavel={!encerrada}
                comLeads={campanha.leads.andamento > 0}
              />
            </section>
            <details className="cartao p-5">
              <summary className="cursor-pointer text-[15px] font-semibold">Editor de blocos (avançado)</summary>
              <p className="mt-1 text-[13px] text-tinta-suave">Esperas, condições e o que acontece com quem não responde.</p>
              <div className="mt-4">
                <EditorDeCampanha
                  perfis={editor.perfis}
                  angulos={editor.angulos}
                  exemplo={editor.exemplo}
                  inicial={{
                    id,
                    perfilId: campanha.perfilId,
                    nome: campanha.nome,
                    angulo: campanha.angulo,
                    nicho: campanha.nicho,
                    modoCopy: campanha.modoCopy,
                    maxLeads: campanha.maxLeads,
                    fluxo,
                    publico: publico ? { id: publico.id, nome: publico.nome, provas: publico.provas } : null,
                  }}
                />
              </div>
            </details>
          </div>
        )}

        {aba === "sdr" && (
          <form action={salvarInstrucoesDoPainel} className="cartao flex flex-col gap-3 p-5">
            <input type="hidden" name="campanhaId" value={id} />
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Bot className="size-4 text-destaque" aria-hidden />
              Instruções do SDR só nesta campanha
            </h2>
            <p className="text-[13px] text-tinta-suave">
              {dados.sdr
                ? `Valem por cima do SDR da organização (versão ${dados.sdr.versao}), só nas conversas desta campanha. As regras da casa continuam valendo.`
                : "Valem só nas conversas desta campanha. As regras da casa continuam valendo."}{" "}
              Ex.: &quot;Fale do evento de novembro&quot;, &quot;Para este público, ofereça o diagnóstico gratuito&quot;.
            </p>
            <textarea
              name="instrucoes"
              defaultValue={campanha.instrucoesSdr ?? ""}
              rows={6}
              maxLength={LIMITE_DAS_INSTRUCOES}
              aria-label="Instruções do SDR nesta campanha"
              disabled={encerrada}
              className="campo w-full"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-tinta-fraca">Até {LIMITE_DAS_INSTRUCOES} caracteres.</span>
              <button type="submit" className="botao botao-primario" disabled={encerrada}>
                Salvar
              </button>
            </div>
          </form>
        )}

        {aba === "results" && dados.funil && <AbaResultados linhas={dados.funil.porCampanha} leituraMinima={dados.funil.leituraMinima} />}
      </div>
    </>
  );
}
