"use client";

import { ArrowRight, Check, ExternalLink, Pencil, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Fragment, Suspense, use, useState, useTransition, type ReactNode } from "react";
import { AnelDaNota } from "@/components/anel-da-nota";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Avatar } from "@/components/avatar";
import { Aviso } from "@/components/aviso";
import { faltasParaPreencher, valoresDaPessoa, type PessoaDaPrevia } from "@/domain/previa";
import { PASSO_INICIAL, PASSOS_DO_PRIMEIRO_ACESSO } from "@/domain/primeiro-acesso";
import { renderizarTemplate, type Token } from "@/domain/template";
import type { Abordagem, ResultadoDaAbordagem, Toque } from "@/server/abordagem/recomendada";
import type { Previa } from "@/server/previa/previa";
import { editarToque, escreverDeNovo, marcarPessoaDaPrevia, podeEntrarEmContato } from "./acoes";

export type PreviaDaTela = { ok: true; previa: Previa; tamanho: string | null } | { ok: false; erro: string };

/** Os toques do fluxo padrão (§4.1): quando sai, o que é e o teto de caracteres. */
const PASSOS: { toque: Toque; quando: string; titulo: string; teto: number }[] = [
  // A nota do convite segue o limite da conta gratuita do LinkedIn (200).
  { toque: "T1", quando: "Dia 1", titulo: "Convite com nota", teto: 200 },
  { toque: "T2", quando: "2 dias úteis depois do aceite", titulo: "Mensagem 1", teto: 350 },
  { toque: "T3", quando: "4 dias úteis depois", titulo: "Mensagem 2", teto: 250 },
  { toque: "T4", quando: "5 dias úteis depois", titulo: "Mensagem 3", teto: 180 },
];

const TOKENS: Record<string, string> = { "{{first_name}}": "primeiro nome", "{{company}}": "empresa" };

const DADO_DO_TOKEN: Record<Token, string> = { first_name: "o primeiro nome", company: "a empresa" };

const textoDo = (abordagem: Abordagem, toque: Toque) =>
  toque === "T1" ? abordagem.textos.convite : (abordagem.textos.mensagens[Number(toque.slice(1)) - 2] ?? "");

const todosOsTextos = (abordagem: Abordagem) => [abordagem.textos.convite, ...abordagem.textos.mensagens];

const quemE = (pessoa: PessoaDaPrevia) => pessoa.primeiroNome ?? pessoa.nome;

const rotulo = "text-xs font-medium uppercase tracking-[0.12em] text-tinta-fraca";

/** O texto com os tokens à mostra: o que vira o nome e a empresa de cada pessoa. */
function ComTokens({ texto }: { texto: string }) {
  const partes = texto.split(/(\{\{first_name\}\}|\{\{company\}\})/g);
  return (
    <>
      {partes.map((parte, indice) =>
        TOKENS[parte] ? (
          <span key={indice} className="rounded-md bg-destaque/15 px-1.5 py-0.5 text-[0.85em] text-destaque">
            {TOKENS[parte]}
          </span>
        ) : (
          <Fragment key={indice}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

function Carregando({ texto, alto = false }: { texto: string; alto?: boolean }) {
  return (
    <div role="status" className={`cartao flex flex-col items-center justify-center gap-4 p-8 text-center ${alto ? "min-h-96" : "min-h-56"}`}>
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute size-10 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3.5 rounded-full bg-destaque" />
      </span>
      <p className="text-sm font-medium">{texto}</p>
    </div>
  );
}

type Estado = {
  previa: Promise<PreviaDaTela>;
  abordagem: Promise<ResultadoDaAbordagem>;
  /** Marcações feitas nesta tela, por cima do que a prévia trouxe. */
  marcacoes: Record<string, boolean>;
  /** A abordagem depois de editar ou escrever de novo nesta tela. */
  editada: Abordagem | null;
};

/** As pessoas da prévia com as marcações desta tela. */
function pessoasDa(previa: PreviaDaTela, marcacoes: Record<string, boolean>): PessoaDaPrevia[] {
  if (!previa.ok || previa.previa.status !== "pronta") return [];
  return previa.previa.pessoas.map((pessoa) =>
    pessoa.providerId in marcacoes ? { ...pessoa, marcada: marcacoes[pessoa.providerId]! } : pessoa,
  );
}

function useAbordagem(estado: Estado): ResultadoDaAbordagem {
  return estado.editada ? { ok: true, abordagem: estado.editada } : use(estado.abordagem);
}

/**
 * "Pode entrar em contato", no alto como o resto da tela pede: quantas
 * pessoas, o ritmo e o que vem depois. Só libera com alguém marcado e sem texto
 * barrado; a permissão fecha a prévia junto.
 */
function Permissao({ estado, convitesPorDia }: { estado: Estado; convitesPorDia: number }) {
  const previa = use(estado.previa);
  const abordagem = useAbordagem(estado);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const pronta = previa.ok && previa.previa.status === "pronta";
  const buscando = previa.ok && previa.previa.status === "buscando";
  const marcadas = pessoasDa(previa, estado.marcacoes).filter((pessoa) => pessoa.marcada).length;
  const problemas = abordagem.ok ? abordagem.abordagem.problemas.length : 0;
  const trava = !abordagem.ok
    ? "Sem a abordagem escrita, não dá para seguir."
    : buscando
      ? "Espere a busca terminar."
      : problemas > 0
        ? "Corrija o que está marcado nas mensagens."
        : pronta && marcadas === 0
          ? "Marque pelo menos uma pessoa."
          : null;

  const permitir = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await podeEntrarEmContato();
      if (resultado && !resultado.ok) setErro(resultado.erro);
    });

  return (
    <CartaoDaPermissao
      titulo={
        pronta
          ? `${marcadas} ${marcadas === 1 ? "pessoa marcada" : "pessoas marcadas"}`
          : previa.ok && previa.previa.status === "sem_nomes"
            ? "A lista vem pela sua conta"
            : "Sem a lista agora"
      }
      detalhe={`Até ${convitesPorDia} convites por dia, em dias úteis`}
      botao={
        <button type="button" className="botao botao-primario" onClick={permitir} disabled={pendente || trava !== null}>
          {pendente ? "Gravando..." : "Pode entrar em contato"}
          <ArrowRight aria-hidden />
        </button>
      }
      aviso={erro ?? trava}
      erro={erro !== null}
    />
  );
}

function CartaoDaPermissao({
  titulo,
  detalhe,
  botao,
  aviso,
  erro = false,
}: {
  titulo: string;
  detalhe: string;
  botao: ReactNode;
  aviso?: string | null;
  erro?: boolean;
}) {
  return (
    <div className="w-full sm:w-auto">
      <div className="cartao flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 pl-5">
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="text-xs text-tinta-suave">{detalhe}</p>
        </div>
        {botao}
      </div>
      <p className={`mt-2 text-xs ${aviso ? (erro ? "text-erro" : "text-atencao") : "text-tinta-fraca"}`}>
        {aviso ?? "Depois: vincular o LinkedIn · convites · o SDR conversa · reuniões na sua agenda"}
      </p>
    </div>
  );
}

/**
 * As pessoas da prévia, pela nota. Marcar diz quem recebe; clicar mostra ao
 * lado a abordagem como chega para ela.
 */
function Pessoas({
  estado,
  corte,
  vendo,
  aoVer,
  aoMarcar,
}: {
  estado: Estado;
  corte: number;
  vendo: string | null;
  aoVer: (providerId: string) => void;
  aoMarcar: (providerId: string, marcada: boolean) => Promise<boolean>;
}) {
  const previa = use(estado.previa);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  if (!previa.ok) return <Aviso tom="erro">{previa.erro}</Aviso>;
  const { status, motivo, regiao } = previa.previa;
  if (status === "buscando") {
    return (
      <>
        <Carregando texto="Ainda procurando no LinkedIn..." />
        <AtualizarSozinho segundos={4} />
      </>
    );
  }
  const pessoas = pessoasDa(previa, estado.marcacoes);
  if (pessoas.length === 0) {
    return (
      <Aviso tom="atencao">
        <p className="font-medium">{motivo ?? "A prévia ficou sem nomes."}</p>
        <p className="mt-1">Os nomes chegam quando você vincular o seu LinkedIn: a busca roda pela sua conta, com esse mesmo público.</p>
      </Aviso>
    );
  }

  const marcar = (providerId: string, marcada: boolean) => {
    setErro(null);
    iniciar(async () => {
      if (!(await aoMarcar(providerId, marcada))) setErro("Não consegui gravar a marcação. Tente de novo.");
    });
  };
  const onde = regiao ? `, em ${regiao.nome}` : "";

  return (
    <div>
      <p className="mb-3 text-sm text-tinta-suave">
        {previa.tamanho ? (
          <>
            <span className="font-medium text-tinta">{previa.tamanho}</span> no LinkedIn com esses cargos{onde}. Aqui estão as{" "}
            {pessoas.length} mais parecidas com o seu lead.
          </>
        ) : (
          <>
            {pessoas.length} {pessoas.length === 1 ? "pessoa real" : "pessoas reais"} no LinkedIn{onde}, pela nota de quanto cada uma
            parece com o seu lead.
          </>
        )}
      </p>
      {erro && (
        <Aviso tom="erro" className="mb-3">
          {erro}
        </Aviso>
      )}
      <ul className="cartao divide-y divide-linha overflow-hidden">
        {pessoas.map((pessoa) => {
          const vista = pessoa.providerId === vendo;
          return (
            <li
              key={pessoa.providerId}
              className={`relative flex items-start gap-3 px-4 py-3.5 transition-colors ${vista ? "bg-superficie-alta" : "hover:bg-superficie-alta/60"} ${
                pessoa.marcada ? "" : "opacity-60"
              }`}
            >
              {vista && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-destaque" />}
              <input
                type="checkbox"
                checked={pessoa.marcada}
                onChange={(e) => marcar(pessoa.providerId, e.target.checked)}
                className="mt-3 size-4 shrink-0"
                aria-label={`${pessoa.nome} recebe a abordagem`}
              />
              <AnelDaNota nota={pessoa.nota} corte={corte} />
              <button
                type="button"
                onClick={() => aoVer(pessoa.providerId)}
                aria-pressed={vista}
                className="min-w-0 flex-1 text-left"
                title="Ver as mensagens como chegam para essa pessoa"
              >
                <span className="block truncate font-medium">{pessoa.nome}</span>
                <span className="block truncate text-sm text-tinta-suave">
                  {[pessoa.cargo, pessoa.empresa].filter(Boolean).join(" · ") || "Sem cargo na busca"}
                </span>
                {pessoa.motivo && <span className="mt-1 line-clamp-2 block text-xs text-tinta-fraca">{pessoa.motivo}</span>}
              </button>
              <a
                href={pessoa.urlPublica}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 shrink-0 text-tinta-fraca hover:text-tinta"
                title="Ver no LinkedIn"
              >
                <ExternalLink className="size-3.5" aria-label={`Ver ${pessoa.nome} no LinkedIn`} />
              </a>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-tinta-fraca">Nota {corte} ou mais já vem marcada.</p>
    </div>
  );
}

/** O que vai acontecer quando a pessoa permitir (§4.5), em poucas linhas. */
function OQueVaiAcontecer({ convitesPorDia, tetoSemanal, chamarVoce }: { convitesPorDia: number; tetoSemanal: number; chamarVoce: string[] }) {
  const itens = [
    `Até ${convitesPorDia} convites por dia na primeira semana, subindo devagar até ${tetoSemanal} por semana. É o ritmo que protege a sua conta.`,
    "Só em dias úteis, das 9h às 18h, com intervalo entre um convite e outro.",
    "Quem responde sai da sequência na hora, e o SDR responde sozinho, do jeito que você ajustou.",
    `O SDR para e chama você quando a pessoa pergunta preço, reclama${chamarVoce.length > 0 ? `, ou: ${chamarVoce.join("; ").toLowerCase()}` : ""}.`,
    "Você vê tudo nos Chats e pode pausar a qualquer momento.",
  ];
  return (
    <section className="cartao mt-8 p-5">
      <h2 className="font-medium tracking-tight">O que vai acontecer</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-tinta-suave">
        {itens.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-destaque" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A abordagem como chega para a pessoa escolhida (§4.5): o convite e as três
 * mensagens, na ordem em que saem, preenchidos como no envio. "Ver modelo"
 * mostra os campos variáveis. Cada texto se edita ali; texto com problema não
 * deixa permitir.
 */
function Mensagens({
  estado,
  vendo,
  aoVerModelo,
  aoMudar,
  resumo,
}: {
  estado: Estado;
  vendo: string | null;
  aoVerModelo: () => void;
  aoMudar: (abordagem: Abordagem) => void;
  resumo: ReactNode;
}) {
  const previa = use(estado.previa);
  const resultado = useAbordagem(estado);
  const [editando, setEditando] = useState<Toque | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!resultado.ok) return <Aviso tom="erro">{resultado.erro}</Aviso>;
  const abordagem = resultado.abordagem;
  const pessoas = pessoasDa(previa, estado.marcacoes);
  const pessoa = pessoas.find((p) => p.providerId === vendo) ?? null;
  const marcadas = pessoas.filter((p) => p.marcada);

  const abrir = (toque: Toque) => {
    setErro(null);
    setEditando(toque);
    setRascunho(textoDo(abordagem, toque));
  };
  const salvar = (toque: Toque) =>
    iniciar(async () => {
      const novo = await editarToque({ toque, texto: rascunho });
      if (novo.ok) {
        aoMudar(novo.abordagem);
        setEditando(null);
      } else setErro(novo.erro);
    });
  const reescrever = () =>
    iniciar(async () => {
      setErro(null);
      const novo = await escreverDeNovo();
      if (novo.ok) {
        aoMudar(novo.abordagem);
        setEditando(null);
      } else setErro(novo.erro);
    });
  const faltas = faltasParaPreencher(todosOsTextos(abordagem), marcadas);

  return (
    <div>
      <div className="cartao flex items-center gap-3 p-4">
        {pessoa ? (
          <>
            <Avatar nome={pessoa.nome} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                <span className="truncate">{pessoa.nome}</span>
                <a href={pessoa.urlPublica} target="_blank" rel="noreferrer" className="shrink-0 text-tinta-fraca hover:text-tinta" title="Ver no LinkedIn">
                  <ExternalLink className="size-3.5" aria-label={`Ver ${pessoa.nome} no LinkedIn`} />
                </a>
              </p>
              <p className="truncate text-sm text-tinta-suave">{[pessoa.cargo, pessoa.empresa].filter(Boolean).join(" · ") || "Sem cargo na busca"}</p>
            </div>
            <button type="button" className="segmento shrink-0" onClick={aoVerModelo}>
              Ver modelo
            </button>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="font-medium">Modelo</p>
            <p className="text-sm text-tinta-suave">
              {pessoas.length > 0 ? "Escolha uma pessoa ao lado para ver como chega para ela." : "O que fica destacado vira o nome e a empresa de cada pessoa."}
            </p>
          </div>
        )}
      </div>

      {faltas.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-atencao">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {faltas
              .map(
                ({ token, pessoas: quantas }) =>
                  `${quantas} de ${marcadas.length} ${marcadas.length === 1 ? "pessoa marcada" : "pessoas marcadas"} ${quantas === 1 ? "está" : "estão"} sem ${DADO_DO_TOKEN[token]} no LinkedIn`,
              )
              .join("; ")}
            . Para elas, o texto que usa esse dado espera você revisar antes de sair.
          </span>
        </p>
      )}

      <ol className="relative mt-6 flex flex-col gap-6 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-px before:bg-linha-forte">
        {PASSOS.map((passo, indice) => {
          const problemas = abordagem.problemas.filter((p) => p.toque === passo.toque);
          const texto = textoDo(abordagem, passo.toque);
          const preenchido = pessoa ? renderizarTemplate(texto, valoresDaPessoa(pessoa)) : null;
          const semDado = pessoa && preenchido && !preenchido.ok ? faltasParaPreencher([texto], [pessoa]) : [];
          return (
            <li key={passo.toque} className="relative flex gap-5">
              <span
                className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                  problemas.length > 0 ? "border-atencao/60 bg-fundo text-atencao" : "border-destaque/50 bg-fundo text-destaque"
                }`}
              >
                {indice + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">{passo.quando}</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <h3 className="font-medium">{passo.titulo}</h3>
                  {editando !== passo.toque && (
                    <button type="button" className="botao botao-pequeno" onClick={() => abrir(passo.toque)} disabled={pendente}>
                      <Pencil aria-hidden />
                      Editar
                    </button>
                  )}
                </div>
                {editando === passo.toque ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      rows={4}
                      autoFocus
                      aria-label={`Texto: ${passo.titulo}`}
                      className="campo"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="botao botao-primario botao-pequeno" onClick={() => salvar(passo.toque)} disabled={pendente}>
                        <Check aria-hidden />
                        Salvar
                      </button>
                      <button type="button" className="botao botao-pequeno" onClick={() => setEditando(null)} disabled={pendente}>
                        <X aria-hidden />
                        Cancelar
                      </button>
                      <span className={`text-xs ${rascunho.length > passo.teto ? "text-erro" : "text-tinta-fraca"}`}>
                        {rascunho.length} de {passo.teto} caracteres · use {"{{first_name}}"} e {"{{company}}"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-line rounded-2xl rounded-tl-md border border-linha bg-superficie-alta px-4 py-3 leading-relaxed">
                    {preenchido?.ok ? preenchido.texto : <ComTokens texto={texto} />}
                  </p>
                )}
                {pessoa &&
                  editando !== passo.toque &&
                  semDado.map(({ token }) => (
                    <p key={token} className="mt-2 flex items-start gap-1.5 text-sm text-atencao">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {quemE(pessoa)} está sem {DADO_DO_TOKEN[token]} no LinkedIn: para essa pessoa, este texto espera você revisar antes de sair.
                    </p>
                  ))}
                {problemas.map((problema) => (
                  <p key={problema.mensagem} className="mt-2 flex items-start gap-1.5 text-sm text-atencao">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {problema.mensagem}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {erro && (
        <Aviso tom="erro" className="mt-4">
          {erro}
        </Aviso>
      )}
      <button type="button" className="botao botao-pequeno mt-6" onClick={reescrever} disabled={pendente}>
        <RotateCcw aria-hidden />
        {pendente ? "Escrevendo..." : "Escrever de novo"}
      </button>

      {resumo}
    </div>
  );
}

/**
 * A abordagem do primeiro acesso numa tela só (SDR-56), no jeito de uma área
 * de trabalho: à esquerda o que o Kakou entendeu e os públicos, no meio as
 * pessoas, à direita as mensagens como chegam para a pessoa escolhida, e a
 * permissão no alto. A busca e a escrita chegam cada uma no seu tempo.
 */
export function AreaDeTrabalho({
  previa,
  abordagem,
  corte,
  lateral,
  convitesPorDia,
  tetoSemanal,
  chamarVoce,
}: {
  previa: Promise<PreviaDaTela>;
  abordagem: Promise<ResultadoDaAbordagem>;
  corte: number;
  lateral: ReactNode;
  convitesPorDia: number;
  tetoSemanal: number;
  chamarVoce: string[];
}) {
  const [marcacoes, setMarcacoes] = useState<Record<string, boolean>>({});
  const [editada, setEditada] = useState<Abordagem | null>(null);
  // undefined: ainda ninguém escolhido, abre a primeira marcada; null: o modelo.
  const [escolhida, setEscolhida] = useState<string | null | undefined>(undefined);
  const estado: Estado = { previa, abordagem, marcacoes, editada };

  const aoMarcar = async (providerId: string, marcada: boolean) => {
    setMarcacoes((atuais) => ({ ...atuais, [providerId]: marcada }));
    const { ok } = await marcarPessoaDaPrevia({ providerId, marcada });
    if (!ok) setMarcacoes((atuais) => ({ ...atuais, [providerId]: !marcada }));
    return ok;
  };

  return (
    <div data-largura="cheia">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-destaque">
            Passo {PASSOS_DO_PRIMEIRO_ACESSO.indexOf("abordagem") + 1} · {PASSO_INICIAL.abordagem.rotulo}
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">{PASSO_INICIAL.abordagem.pergunta}</h1>
          <p className="mt-3 text-tinta-suave">
            Marque quem recebe e veja ao lado como a abordagem chega para cada pessoa. Edite o que quiser: nada sai antes de você permitir.
          </p>
        </div>
        <Suspense
          fallback={
            <CartaoDaPermissao
              titulo="Preparando a lista..."
              detalhe={`Até ${convitesPorDia} convites por dia, em dias úteis`}
              botao={
                <button type="button" className="botao botao-primario" disabled>
                  Pode entrar em contato
                  <ArrowRight aria-hidden />
                </button>
              }
            />
          }
        >
          <Permissao estado={estado} convitesPorDia={convitesPorDia} />
        </Suspense>
      </header>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[15rem_minmax(0,21rem)_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[17rem_minmax(0,24rem)_minmax(0,1fr)] xl:gap-8">
        <aside className="order-3 lg:order-1 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {lateral}
        </aside>
        <section aria-label="Pessoas" className="order-1 lg:order-2 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <h2 className={`${rotulo} mb-3`}>Pessoas</h2>
          <Suspense fallback={<Carregando texto="Procurando no LinkedIn quem tem esse perfil..." alto />}>
            <ComPrimeiraMarcada estado={estado} escolhida={escolhida}>
              {(vendo) => <Pessoas estado={estado} corte={corte} vendo={vendo} aoVer={setEscolhida} aoMarcar={aoMarcar} />}
            </ComPrimeiraMarcada>
          </Suspense>
        </section>
        <section aria-label="Mensagens" className="order-2 lg:order-3">
          <h2 className={`${rotulo} mb-3`}>Como chega</h2>
          <Suspense fallback={<Carregando texto="Escrevendo o convite e as mensagens na voz do seu SDR..." alto />}>
            <ComPrimeiraMarcada estado={estado} escolhida={escolhida}>
              {(vendo) => (
                <Mensagens
                  estado={estado}
                  vendo={vendo}
                  aoVerModelo={() => setEscolhida(null)}
                  aoMudar={setEditada}
                  resumo={<OQueVaiAcontecer convitesPorDia={convitesPorDia} tetoSemanal={tetoSemanal} chamarVoce={chamarVoce} />}
                />
              )}
            </ComPrimeiraMarcada>
          </Suspense>
        </section>
      </div>
    </div>
  );
}

/**
 * Quem está aberto ao lado: a escolhida, ou a primeira marcada como a prévia
 * chegou. Desmarcar alguém não troca a pessoa aberta.
 */
function ComPrimeiraMarcada({
  estado,
  escolhida,
  children,
}: {
  estado: Estado;
  escolhida: string | null | undefined;
  children: (vendo: string | null) => ReactNode;
}) {
  const previa = use(estado.previa);
  if (escolhida !== undefined) return children(escolhida);
  const pessoas = pessoasDa(previa, {});
  const primeira = pessoas.find((pessoa) => pessoa.marcada) ?? pessoas[0];
  return children(primeira?.providerId ?? null);
}
