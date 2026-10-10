import { Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { ofertaDaOrganizacao, type SituacaoDaOferta } from "@/server/oferta/oferta";
import { lerDeNovo } from "../acoes";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { EditorDaAnalise } from "./editor-da-analise";

// "Tentar de novo" dispara a leitura daqui, depois da resposta (after).
export const maxDuration = 300;

const dominio = (url: string | null) => (url ? new URL(url).hostname.replace(/^www\./, "") : "o site");

/** Enquanto a IA lê: as páginas aparecem conforme abrem, e depois a montagem da análise. */
function Lendo({ oferta }: { oferta: SituacaoDaOferta }) {
  const { etapa, paginas } = oferta.leitura.progresso;
  return (
    <>
      <Pergunta passo="analise" titulo={`Lendo ${dominio(oferta.url)}`}>
        Abrimos as páginas que mais dizem sobre o que você vende. Leva de 30 segundos a 2 minutos; pode fechar a aba e
        voltar depois.
      </Pergunta>
      <ol role="status" aria-live="polite" className="mt-10 flex flex-col gap-3">
        {paginas.map((pagina) => (
          <li key={pagina.url} className="flex items-center gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-destaque/50 text-destaque">
              <Check className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 truncate">
              {pagina.titulo ?? pagina.url}
              {new URL(pagina.url).pathname !== "/" && (
                <span className="ml-2 text-tinta-fraca">{new URL(pagina.url).pathname}</span>
              )}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm text-tinta-suave">
          <span className="relative flex size-6 shrink-0 items-center justify-center">
            <span className="absolute size-6 animate-ping rounded-full bg-destaque/25" />
            <span className="size-2.5 rounded-full bg-destaque" />
          </span>
          {etapa === "analise"
            ? "Montando a análise de negócio, produto e mercado..."
            : paginas.length === 0
              ? "Abrindo a página inicial..."
              : "Abrindo a próxima página..."}
        </li>
      </ol>
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
        <Link href="/comecar/site" className="botao">
          Trocar o endereço
        </Link>
      </div>
    </>
  );
}

/** Passo 2 (§2.1, §4.2): a análise do site, para corrigir e confirmar. */
export default async function PassoAnalise({ searchParams }: PageProps<"/comecar/analise">) {
  const { operador } = await abrirPasso("analise");
  const { msg } = await searchParams;
  const oferta = await comOperador(obterDb(), operador.id, (tx) =>
    ofertaDaOrganizacao(tx, operador.organizacaoId, new Date()),
  );
  const { status } = oferta.leitura;

  if (status === "lendo") return <Lendo oferta={oferta} />;
  if (!oferta.dossie) {
    if (status === "erro" || status === "parada") return <Falhou oferta={oferta} />;
    redirect("/comecar/site");
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
