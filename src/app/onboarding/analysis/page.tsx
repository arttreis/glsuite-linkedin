import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { tempoDecorrido } from "@/lib/tempo";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import type { FonteDoSite } from "@/server/oferta/leitor";
import { ofertaDaOrganizacao, type SituacaoDaOferta } from "@/server/oferta/oferta";
import { lerDeNovo } from "../acoes";
import { type Etapa, Etapas } from "../etapas";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { EditorDaAnalise } from "./editor-da-analise";
import { etapasDaLeitura, type IdDaEtapaDaLeitura } from "./etapas-da-leitura";

// "Tentar de novo" dispara a leitura daqui, depois da resposta (after).
export const maxDuration = 300;

const dominio = (url: string | null) => (url ? new URL(url).hostname.replace(/^www\./, "") : "o site");

/** Depois disso sem terminar, a tela avisa que site grande demora e que dá para sair. */
const DEMORANDO_MS = 2 * 60 * 1000;

/** O que acontece na etapa atual, numa linha. */
const DETALHE_DA_ETAPA: Partial<Record<IdDaEtapaDaLeitura, string>> = {
  abrir: "Começando pela página inicial.",
  negocio: "O que a empresa é, para quem, o que vende e por que escolhem vocês.",
  mercado: "Quem compra, o que usa hoje no lugar e o que faz ser a hora.",
};

const caminho = (url: string) => new URL(url).pathname;

/** As páginas abertas, na ordem: título, caminho e o começo do texto. A mais nova em destaque enquanto lê. */
function PaginasAbertas({ paginas, lendo }: { paginas: FonteDoSite[]; lendo: boolean }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {paginas.map((pagina, indice) => (
        <li
          key={pagina.url}
          className={`rounded-xl border px-3.5 py-2.5 ${lendo && indice === paginas.length - 1 ? "border-destaque/35 bg-destaque/5" : "border-linha bg-superficie"}`}
        >
          <p className="flex min-w-0 flex-col text-sm sm:flex-row sm:items-baseline sm:gap-2">
            <span className="min-w-0 truncate font-medium">{pagina.titulo ?? caminho(pagina.url)}</span>
            {caminho(pagina.url) !== "/" && (
              <span className="min-w-0 truncate text-xs text-tinta-fraca sm:max-w-[50%] sm:shrink-0">{caminho(pagina.url)}</span>
            )}
          </p>
          {pagina.trecho && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-tinta-suave">“{pagina.trecho}”</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Enquanto a IA lê: as etapas, as páginas que abriu (com o que diz cada uma),
 * há quanto tempo começou e, se demorar, o aviso de que dá para sair.
 */
function Lendo({ oferta, agora }: { oferta: SituacaoDaOferta; agora: Date }) {
  const { progresso, iniciadaEm } = oferta.leitura;
  const lendoPaginas = progresso.etapa === "paginas";
  const etapas: Etapa[] = etapasDaLeitura(progresso).map((etapa) => ({
    ...etapa,
    detalhe: etapa.estado === "atual" ? DETALHE_DA_ETAPA[etapa.id] : undefined,
    conteudo:
      etapa.id === "paginas" && progresso.paginas.length > 0 ? (
        <PaginasAbertas paginas={progresso.paginas} lendo={lendoPaginas} />
      ) : undefined,
  }));
  const demorando = iniciadaEm !== null && agora.getTime() - new Date(iniciadaEm).getTime() > DEMORANDO_MS;
  return (
    <>
      <Pergunta passo="analise" titulo={`Lendo ${dominio(oferta.url)}`}>
        Abrimos as páginas que mais dizem sobre o que você vende e montamos a análise com o que está nelas. Costuma levar de 30
        segundos a 2 minutos.
      </Pergunta>
      {iniciadaEm && (
        <p className="mt-4 text-sm text-tinta-fraca">
          Começou há <span className="tabular-nums">{tempoDecorrido(iniciadaEm, agora)}</span>
        </p>
      )}
      <div role="status" aria-live="polite" className="mt-10">
        <Etapas etapas={etapas} />
      </div>
      {demorando && (
        <Aviso className="mt-8">
          Sites grandes demoram mais. Pode fechar a aba: a leitura continua sem você e a análise fica aqui quando voltar.
        </Aviso>
      )}
      <AtualizarSozinho segundos={3} />
    </>
  );
}

function Falhou({ oferta }: { oferta: SituacaoDaOferta }) {
  const motivo = oferta.leitura.status === "parada" ? "a leitura parou no meio" : (oferta.leitura.erro ?? "erro desconhecido");
  return (
    <>
      <Pergunta passo="analise" titulo={`Não conseguimos ler ${dominio(oferta.url)}`}>
        Motivo: {motivo}. Confira se o endereço abre no navegador e tente de novo.
      </Pergunta>
      <div className="mt-10 flex flex-wrap gap-2">
        <form action={lerDeNovo}>
          <button type="submit" className="botao botao-primario">
            <RotateCcw aria-hidden />
            Tentar de novo
          </button>
        </form>
        <Link href="/onboarding/site" className="botao">
          Trocar o endereço
        </Link>
      </div>
    </>
  );
}

/** Passo 2 (§2.1, §4.2): a análise do site, para corrigir e confirmar. */
export default async function PassoAnalise({ searchParams }: PageProps<"/onboarding/analysis">) {
  const { operador } = await abrirPasso("analise");
  const { msg } = await searchParams;
  const agora = new Date();
  const oferta = await comOperador(obterDb(), operador.id, (tx) => ofertaDaOrganizacao(tx, operador.organizacaoId, agora));
  const { status } = oferta.leitura;

  if (status === "lendo") return <Lendo oferta={oferta} agora={agora} />;
  if (!oferta.dossie) {
    if (status === "erro" || status === "parada") return <Falhou oferta={oferta} />;
    redirect("/onboarding/site");
  }

  return (
    <>
      <Pergunta passo="analise">
        Negócio e Produto vêm do seu site; Mercado é a nossa leitura de quem compra. Corrija o que não estiver certo: cada
        item se corrige ali mesmo.
      </Pergunta>
      {typeof msg === "string" && (
        <Aviso tom="erro" className="mt-6">
          {msg}
        </Aviso>
      )}
      {(status === "erro" || status === "parada") && (
        <Aviso tom="atencao" className="mt-6">
          <p>
            A leitura nova não deu certo ({status === "parada" ? "parou no meio" : oferta.leitura.erro}). Abaixo está a
            análise de antes.
          </p>
          <form action={lerDeNovo} className="mt-2">
            <button type="submit" className="botao botao-pequeno">
              <RotateCcw aria-hidden />
              Tentar de novo
            </button>
          </form>
        </Aviso>
      )}
      {/* Leitura nova troca o conteúdo por baixo: a chave remonta o editor com o que veio do banco. */}
      <EditorDaAnalise key={oferta.geradoEm?.toISOString() ?? "sem-leitura"} inicial={oferta.dossie} />
      {oferta.fontes.length > 0 && (
        <details className="mt-6 text-sm">
          <summary className="text-tinta-suave">
            {oferta.fontes.length} {oferta.fontes.length === 1 ? "página lida" : "páginas lidas"} em {dominio(oferta.url)}
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {oferta.fontes.map((fonte) => (
              <li key={fonte.url}>
                <a href={fonte.url} target="_blank" rel="noreferrer" className="link">
                  {fonte.titulo ?? fonte.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
