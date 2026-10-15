"use client";

import { ArrowRight, ExternalLink, ScanSearch } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import {
  dominioDoConcorrente,
  MAX_ANALISADOS,
  MAX_CONCORRENTES,
  ROTULO_DA_ORIGEM,
  type AnaliseDoConcorrente,
  type Concorrente,
} from "@/domain/concorrentes";
import type { ResultadoDosConcorrentes } from "@/server/concorrentes/concorrentes";
import { ListaEditavel } from "../analysis/itens";
import { analisarConcorrenteDoEditor, confirmarConcorrentesNoPrimeiroAcesso } from "./acoes";

/** O que a leitura do site do concorrente trouxe: fato do site dele, e onde você ganha, que é hipótese. */
function AnaliseDoSite({ analise }: { analise: AnaliseDoConcorrente }) {
  const linhas: [string, string | null][] = [
    ["O que vende", analise.o_que_vende],
    ["Para quem", analise.para_quem],
    ["Como se posiciona", analise.posicionamento],
  ];
  return (
    <div className="mt-3 flex flex-col gap-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr]">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="text-tinta-fraca">{rotulo}</dt>
            <dd className={valor ? "" : "text-tinta-fraca"}>{valor ?? "O site não diz."}</dd>
          </div>
        ))}
      </dl>
      {analise.onde_voce_ganha.length > 0 && (
        <div className="rounded-xl border border-dashed border-destaque/40 bg-destaque/[0.03] px-4 py-3">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">Onde a sua oferta ganha</span>
            <span className="etiqueta etiqueta-destaque">hipótese do Kakou</span>
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-tinta-suave">
            {analise.onde_voce_ganha.map((ganho) => (
              <li key={ganho}>{ganho}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-tinta-fraca">
            Comparamos o que os dois sites dizem. Não é fato nem número: confira com o que você sabe.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A lista de concorrentes para revisar (§4.2): a pessoa tira, corrige e
 * acrescenta, e pode pedir a análise do site de cada um (até
 * `MAX_ANALISADOS` por empresa). Nada vale até confirmar. Serve ao primeiro
 * acesso e a Configurações › Empresa.
 */
export function EditorDeConcorrentes({
  inicial,
  analisesIniciais,
  restantesIniciais,
  leituraLigada,
  daAnalise,
  confirmar = confirmarConcorrentesNoPrimeiroAcesso,
  rotuloDeConfirmar = "Confirmar",
  semConcorrente = true,
}: {
  inicial: Concorrente[];
  analisesIniciais: Record<string, AnaliseDoConcorrente>;
  restantesIniciais: number;
  leituraLigada: boolean;
  /** A lista ainda é a que a análise do site trouxe. */
  daAnalise: boolean;
  /** No primeiro acesso, confirma e segue para o SDR; em Configurações, só grava. */
  confirmar?: (entrada: { concorrentes: unknown }) => Promise<ResultadoDosConcorrentes>;
  rotuloDeConfirmar?: string;
  /** Mostra "Não tenho concorrente direto" (primeiro acesso). */
  semConcorrente?: boolean;
}) {
  const [lista, setLista] = useState<Concorrente[]>(inicial);
  const [analises, setAnalises] = useState(analisesIniciais);
  const [restantes, setRestantes] = useState(restantesIniciais);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [erroDaAnalise, setErroDaAnalise] = useState<{ dominio: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState<{ tom: "erro" | "ok"; texto: string } | null>(null);
  const [mexeu, setMexeu] = useState(false);
  const [, iniciarAnalise] = useTransition();
  const [confirmando, iniciarConfirmacao] = useTransition();

  const mudar = (nova: Concorrente[]) => {
    setLista(nova);
    setMexeu(true);
    setAviso(null);
  };

  const analisar = (concorrente: Concorrente, dominio: string) => {
    setAnalisando(dominio);
    setErroDaAnalise(null);
    iniciarAnalise(async () => {
      const resultado = await analisarConcorrenteDoEditor({ nome: concorrente.nome, site: concorrente.site ?? "" });
      setAnalisando(null);
      if (!resultado.ok) {
        setErroDaAnalise({ dominio, texto: resultado.erro });
        return;
      }
      if (!analises[resultado.dominio]) setRestantes((atual) => Math.max(0, atual - 1));
      setAnalises((atuais) => ({ ...atuais, [resultado.dominio]: resultado.analise }));
    });
  };

  const gravar = (concorrentes: Concorrente[]) =>
    iniciarConfirmacao(async () => {
      const resultado = await confirmar({ concorrentes });
      if (resultado && !resultado.ok) setAviso({ tom: "erro", texto: resultado.erro });
      else if (resultado?.ok) {
        setMexeu(false);
        setAviso({ tom: "ok", texto: "Lista gravada. As próximas sugestões de públicos e abordagens já usam esta versão." });
      }
    });

  const ver = (concorrente: Concorrente) => {
    const dominio = dominioDoConcorrente(concorrente.site);
    const analise = dominio ? analises[dominio] : undefined;
    return (
      <>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{concorrente.nome}</span>
          <span className={concorrente.origem === "voce" ? "etiqueta" : "etiqueta etiqueta-destaque"}>
            {ROTULO_DA_ORIGEM[concorrente.origem]}
          </span>
        </p>
        {concorrente.descricao && <p className="text-sm text-tinta-suave">{concorrente.descricao}</p>}
        {concorrente.site && (
          <a href={concorrente.site} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-tinta-fraca hover:text-tinta">
            {dominio ?? concorrente.site}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {analise ? (
          <AnaliseDoSite analise={analise} />
        ) : (
          dominio &&
          leituraLigada && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => analisar(concorrente, dominio)}
                disabled={analisando !== null || restantes === 0 || confirmando}
                title={restantes === 0 ? `Você já analisou ${MAX_ANALISADOS} concorrentes, o máximo por empresa.` : undefined}
              >
                <ScanSearch aria-hidden />
                {analisando === dominio ? "Lendo o site..." : "Analisar"}
              </button>
              {analisando === dominio && (
                <span className="text-xs text-tinta-fraca" role="status">
                  Leva de 20 segundos a 1 minuto.
                </span>
              )}
            </div>
          )
        )}
        {erroDaAnalise?.dominio === dominio && (
          <p className="mt-2 text-sm text-erro" role="alert">
            {erroDaAnalise.texto}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="mt-10 flex flex-col gap-5">
      <section className="cartao p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-medium tracking-tight">Concorrentes</h2>
          <span className="etiqueta">{daAnalise && !mexeu ? "da análise do seu site" : "a sua lista"}</span>
        </header>
        <p className="mt-2 text-sm text-tinta-suave">
          {daAnalise
            ? "Começamos pelo que a análise do seu site encontrou. Tire quem não é concorrente, corrija e acrescente quem falta."
            : "Tire quem não é concorrente, corrija e acrescente quem falta."}{" "}
          O site é opcional: com ele, o Kakou lê a página do concorrente e compara com a sua oferta.
        </p>
        <div className="mt-6">
          <ListaEditavel<Concorrente>
            nome="concorrente"
            itens={lista}
            maximo={MAX_CONCORRENTES}
            campos={[
              { chave: "nome", rotulo: "Nome", max: 80, obrigatorio: true },
              { chave: "descricao", rotulo: "O que é, numa linha", max: 200 },
              { chave: "site", rotulo: "Site (opcional)", max: 250, placeholder: "concorrente.com.br", vazioViraNull: true },
            ]}
            ver={ver}
            novo={() => ({ nome: "", descricao: "", site: null, origem: "voce" })}
            aoMudar={mudar}
            desabilitado={confirmando || analisando !== null}
            vazio="Nenhum concorrente na lista. Acrescente quem disputa o cliente com você."
          />
        </div>
        {leituraLigada ? (
          <p className="mt-5 text-xs text-tinta-fraca">
            {restantes > 0
              ? `Você pode analisar mais ${restantes} ${restantes === 1 ? "concorrente" : "concorrentes"} (até ${MAX_ANALISADOS} por empresa).`
              : `Você já analisou ${MAX_ANALISADOS} concorrentes, o máximo por empresa.`}
          </p>
        ) : (
          <p className="mt-5 text-xs text-tinta-fraca">A leitura de sites está desligada pelo admin: dá para montar a lista sem analisar.</p>
        )}
      </section>

      <div className="sticky bottom-0 -mx-5 mt-3 flex flex-col gap-3 border-t border-linha bg-fundo/90 px-5 py-4 backdrop-blur">
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="botao botao-primario"
            onClick={() => gravar(lista)}
            disabled={confirmando || analisando !== null}
          >
            {confirmando ? "Gravando..." : rotuloDeConfirmar}
            <ArrowRight aria-hidden />
          </button>
          {semConcorrente && (
            <button type="button" className="botao" onClick={() => gravar([])} disabled={confirmando || analisando !== null}>
              Não tenho concorrente direto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
