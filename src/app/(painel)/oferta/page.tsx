import type { ReactNode } from "react";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import type { Dossie } from "@/domain/dossie";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterLeitorDeSite } from "@/server/dependencias";
import { ofertaDaOrganizacao, type SituacaoDaOferta } from "@/server/oferta/oferta";
import { exigirOperador } from "@/server/supabase/servidor";
import { analisarSite } from "./acoes";

// A leitura do site roda depois da resposta (after) e leva até 2 minutos.
export const maxDuration = 300;

const PROVAS: Record<Dossie["provas"][number]["tipo"], string> = {
  case: "Case",
  numero: "Número",
  cliente: "Cliente",
  depoimento: "Depoimento",
  selo: "Selo",
};

const dataHora = (valor: Date | null) =>
  valor
    ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "";

const dominio = (url: string | null) => (url ? new URL(url).hostname.replace(/^www\./, "") : "");

function Bloco({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="cartao p-5">
      <h2 className="font-medium">{titulo}</h2>
      {ajuda && <p className="mt-0.5 text-xs text-tinta-fraca">{ajuda}</p>}
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Lista({ itens, vazio }: { itens: ReactNode[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-tinta-fraca">{vazio}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {itens.map((item, indice) => (
        <li key={indice}>{item}</li>
      ))}
    </ul>
  );
}

function FormularioDoSite({ url, rotulo }: { url: string | null; rotulo: string }) {
  return (
    <form action={analisarSite} className="flex flex-wrap items-end gap-2">
      <label className="rotulo">
        Endereço do site
        <input name="url" defaultValue={url ?? ""} required placeholder="suaempresa.com.br" className="campo w-80 max-w-full" />
      </label>
      <button type="submit" className="botao botao-primario">
        {rotulo}
      </button>
    </form>
  );
}

function DossieNaTela({ d }: { d: Dossie }) {
  return (
    <div className="mt-5 grid gap-3">
      <Bloco titulo={d.empresa.nome}>
        <p>{d.empresa.resumo}</p>
      </Bloco>
      <Bloco titulo="O que vocês vendem">
        <Lista
          vazio="Nada encontrado no site."
          itens={d.produtos.map((p) => (
            <>
              <span className="font-medium">{p.nome}.</span> {p.descricao}
              {p.para_quem && <span className="text-tinta-suave"> Para: {p.para_quem}</span>}
            </>
          ))}
        />
      </Bloco>
      <Bloco titulo="Para quem">
        <p>{d.para_quem}</p>
      </Bloco>
      <Bloco titulo="Por que escolhem vocês" ajuda="Diferenciais que o site afirma.">
        <Lista vazio="O site não diz." itens={d.diferenciais} />
      </Bloco>
      <Bloco titulo="Provas" ajuda="Cases, números e clientes que dá para citar. A IA só usa o que estiver aqui.">
        <Lista
          vazio="Nenhuma prova no site. Sem prova, as mensagens não citam resultado."
          itens={d.provas.map((p) => (
            <>
              <span className="text-tinta-suave">{PROVAS[p.tipo]}:</span> {p.texto}
              {p.fonte_url && (
                <a href={p.fonte_url} target="_blank" rel="noreferrer" className="link ml-1 text-xs">
                  fonte
                </a>
              )}
            </>
          ))}
        />
      </Bloco>
      <Bloco titulo="Dores que vocês resolvem">
        <Lista vazio="O site não diz." itens={d.dores} />
      </Bloco>
      <Bloco titulo="Objeções prováveis" ajuda="Hipóteses da IA sobre o que o cliente diz para não comprar.">
        <Lista
          vazio="Nenhuma."
          itens={d.objecoes.map((o) => (
            <>
              <span className="font-medium">&ldquo;{o.objecao}&rdquo;</span> {o.resposta}
            </>
          ))}
        />
      </Bloco>
      <Bloco titulo="Tom de voz">
        <p>{d.tom_de_voz}</p>
      </Bloco>
    </div>
  );
}

function Leitura({ oferta }: { oferta: SituacaoDaOferta }) {
  const { status, erro } = oferta.leitura;
  if (status === "lendo") {
    return (
      <div role="status" aria-live="polite" className="cartao mt-5 p-5">
        <p className="font-medium">Lendo {dominio(oferta.url)}…</p>
        <p className="mt-1 text-sm text-tinta-suave">
          A IA abre a página inicial e as de sobre, produtos, preços e cases. Costuma levar de 30 segundos a 2 minutos. Pode
          sair desta tela: o resultado fica aqui.
        </p>
        <AtualizarSozinho />
      </div>
    );
  }
  if (status === "erro" || status === "parada") {
    return (
      <Aviso tom="erro" className="mt-5">
        <p className="font-medium">
          {status === "parada" ? "A leitura parou no meio." : `Não consegui ler o site: ${erro ?? "erro desconhecido"}.`}
        </p>
        <p className="mt-1">Confira o endereço e tente de novo.</p>
        {oferta.dossie && <p className="mt-2">Abaixo está o dossiê da leitura anterior.</p>}
      </Aviso>
    );
  }
  return null;
}

export default async function OfertaPage({ searchParams }: PageProps<"/oferta">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const agora = new Date();
  const oferta = await comOperador(obterDb(), operador.id, (tx) => ofertaDaOrganizacao(tx, operador.organizacaoId, agora));
  const semChave = obterLeitorDeSite() === null;
  const lendo = oferta.leitura.status === "lendo";

  return (
    <>
      <Cabecalho
        titulo="Oferta"
        descricao="O que vocês vendem, para quem e por que escolhem vocês. É daqui que saem os públicos e as mensagens."
      />
      <section className="max-w-3xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}
        {semChave && (
          <Aviso tom="atencao" className="mb-5">
            A leitura do site precisa da chave da Anthropic. Peça ao admin para configurar.
          </Aviso>
        )}

        {oferta.leitura.status === "nenhuma" ? (
          <div className="cartao p-5">
            <h2 className="font-medium">Comece pelo site da empresa</h2>
            <p className="mb-4 mt-1 text-sm text-tinta-suave">
              A IA lê a página inicial e as de sobre, produtos, preços e cases, e monta um resumo da oferta. Você revisa tudo
              antes de usar.
            </p>
            <FormularioDoSite url={null} rotulo="Analisar site" />
          </div>
        ) : (
          <>
            {!lendo && (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <FormularioDoSite url={oferta.url} rotulo="Analisar de novo" />
              </div>
            )}
            <Leitura oferta={oferta} />
            {oferta.dossie && oferta.geradoEm && (
              <p className="mt-5 text-xs text-tinta-fraca">
                Lido de {dominio(oferta.url)} em {dataHora(oferta.geradoEm)} · {oferta.fontes.length}{" "}
                {oferta.fontes.length === 1 ? "página" : "páginas"}
                {oferta.custoUsd !== null && ` · custo US$ ${oferta.custoUsd.toFixed(2)}`}
              </p>
            )}
            {oferta.dossie && <DossieNaTela d={oferta.dossie} />}
            {oferta.fontes.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-tinta-suave">Páginas lidas</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {oferta.fontes.map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noreferrer" className="link">
                        {f.titulo ?? f.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </>
  );
}
