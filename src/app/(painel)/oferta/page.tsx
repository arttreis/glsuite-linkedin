import { Undo2 } from "lucide-react";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterLeitorDeSite } from "@/server/dependencias";
import { ofertaDaOrganizacao, type SituacaoDaOferta } from "@/server/oferta/oferta";
import { exigirOperador } from "@/server/supabase/servidor";
import { analisarSite, voltarAoConfirmadoDoPainel } from "./acoes";
import { EditorDoDossie } from "./editor";

// A leitura do site roda depois da resposta (after) e leva até 2 minutos.
export const maxDuration = 300;

const dataHora = (valor: Date | null) =>
  valor
    ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "";

const dominio = (url: string | null) => (url ? new URL(url).hostname.replace(/^www\./, "") : "");

const quemEQuando = (marca: { em: Date; por: string | null }) => `${marca.por ? `por ${marca.por} ` : ""}em ${dataHora(marca.em)}`;

function FormularioDoSite({ url, rotulo, principal }: { url: string | null; rotulo: string; principal: boolean }) {
  return (
    <form action={analisarSite} className="flex flex-wrap items-end gap-2">
      <label className="rotulo">
        Endereço do site
        <input name="url" defaultValue={url ?? ""} required placeholder="suaempresa.com.br" className="campo w-80 max-w-full" />
      </label>
      <button type="submit" className={principal ? "botao botao-primario" : "botao"}>
        {rotulo}
      </button>
    </form>
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
          sair desta tela: o resultado fica aqui, como rascunho.
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
        {oferta.dossie && <p className="mt-2">Abaixo está o dossiê de antes.</p>}
      </Aviso>
    );
  }
  return null;
}

/** Se o que está na tela já vale, ainda não vale, ou tem mudança por cima do que vale (§4.11). */
function Confirmacao({ oferta }: { oferta: SituacaoDaOferta }) {
  if (!oferta.confirmado) {
    return (
      <Aviso tom="atencao" className="mt-5">
        <p className="font-medium">Ainda não confirmado.</p>
        <p className="mt-1">Revise o que a IA leu, corrija e confirme. Os públicos só saem do dossiê confirmado.</p>
      </Aviso>
    );
  }
  if (!oferta.rascunhoPendente) {
    return (
      <Aviso tom="ok" className="mt-5">
        Confirmado {quemEQuando(oferta.confirmado)}. É este dossiê que vale para os públicos e as mensagens.
      </Aviso>
    );
  }
  return (
    <Aviso tom="atencao" className="mt-5">
      <p className="font-medium">Há mudanças que ainda não valem.</p>
      <p className="mt-1">
        O rascunho abaixo tem leitura nova ou edição. Até alguém confirmar, os públicos e as mensagens seguem usando o dossiê
        confirmado {quemEQuando(oferta.confirmado)}.
      </p>
      <form action={voltarAoConfirmadoDoPainel} className="mt-3">
        <button type="submit" className="botao botao-pequeno">
          <Undo2 aria-hidden />
          Descartar o rascunho e voltar ao confirmado
        </button>
      </form>
    </Aviso>
  );
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
        descricao="O que vocês vendem, para quem e por que escolhem vocês. A IA lê o site, você corrige e confirma. É daqui que saem os públicos e as mensagens."
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
            <FormularioDoSite url={null} rotulo="Analisar site" principal />
          </div>
        ) : (
          <>
            {!lendo && (
              <div className="flex flex-col gap-1.5">
                <FormularioDoSite url={oferta.url} rotulo="Analisar de novo" principal={!oferta.dossie} />
                {oferta.dossie && (
                  <p className="text-xs text-tinta-fraca">
                    A leitura nova vira rascunho. O dossiê confirmado só muda quando alguém confirmar de novo.
                  </p>
                )}
              </div>
            )}
            <Leitura oferta={oferta} />
            {oferta.dossie && <Confirmacao oferta={oferta} />}
            {oferta.dossie && oferta.geradoEm && (
              <p className="mt-5 text-xs text-tinta-fraca">
                Lido de {dominio(oferta.url)} em {dataHora(oferta.geradoEm)} · {oferta.fontes.length}{" "}
                {oferta.fontes.length === 1 ? "página" : "páginas"}
                {oferta.custoUsd !== null && ` · custo US$ ${oferta.custoUsd.toFixed(2)}`}
                {oferta.editado && ` · editado ${quemEQuando(oferta.editado)}`}
              </p>
            )}
            {oferta.dossie && (
              // Leitura nova (geradoEm) e volta ao confirmado (msg) trocam o conteúdo por baixo:
              // a chave remonta o editor com o que veio do banco. Salvar não troca, e o retorno fica na tela.
              <EditorDoDossie
                key={`${oferta.geradoEm?.toISOString() ?? ""}|${typeof msg === "string" ? msg : ""}`}
                inicial={oferta.dossie}
                desabilitado={lendo}
              />
            )}
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
