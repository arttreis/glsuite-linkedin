"use client";

import { ArrowRight, Check, Pencil, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Fragment, useState, useTransition, type ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import { faltasParaPreencher, valoresDaPessoa, type PessoaDeExemplo } from "@/domain/previa";
import { renderizarTemplate, type Token } from "@/domain/template";
import type { Abordagem, Toque } from "@/server/abordagem/recomendada";
import { editarToque, escreverDeNovo, podeEntrarEmContato } from "./acoes";

/** Os toques do fluxo padrão (§4.1): quando sai, o que é e o teto de caracteres. */
const PASSOS: { toque: Toque; quando: string; titulo: string; teto: number }[] = [
  // A nota do convite segue o limite da conta gratuita do LinkedIn (200).
  { toque: "T1", quando: "Dia 1", titulo: "Convite com nota", teto: 200 },
  { toque: "T2", quando: "2 dias úteis depois do aceite", titulo: "Mensagem 1", teto: 350 },
  { toque: "T3", quando: "4 dias úteis depois", titulo: "Mensagem 2", teto: 250 },
  { toque: "T4", quando: "5 dias úteis depois", titulo: "Mensagem 3", teto: 180 },
];

const TOKENS: Record<string, string> = { "{{first_name}}": "primeiro nome", "{{company}}": "empresa" };

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

const textoDo = (abordagem: Abordagem, toque: Toque) =>
  toque === "T1" ? abordagem.textos.convite : (abordagem.textos.mensagens[Number(toque.slice(1)) - 2] ?? "");

/** Quantas pessoas da prévia dão para ver a abordagem como chega para elas. */
const EXEMPLOS = 3;

const DADO_DO_TOKEN: Record<Token, string> = { first_name: "o primeiro nome", company: "a empresa" };

const quemE = (pessoa: PessoaDeExemplo) => pessoa.primeiroNome ?? pessoa.nome;

/**
 * Pessoas marcadas sem o dado de um token que os textos usam: para elas, o
 * texto espera revisão antes de sair (§4.13), e a pessoa fica sabendo agora.
 */
function SemDado({ textos, exemplos }: { textos: string[]; exemplos: PessoaDeExemplo[] }) {
  const faltas = faltasParaPreencher(textos, exemplos);
  if (faltas.length === 0) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 text-sm text-atencao">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {faltas
          .map(
            ({ token, pessoas }) =>
              `${pessoas} de ${exemplos.length} ${exemplos.length === 1 ? "pessoa marcada" : "pessoas marcadas"} ${pessoas === 1 ? "está" : "estão"} sem ${DADO_DO_TOKEN[token]} no LinkedIn`,
          )
          .join("; ")}
        . Para elas, o texto que usa esse dado espera você revisar antes de sair.
      </span>
    </p>
  );
}

/**
 * A abordagem como linha do tempo (§4.5): o convite e as três mensagens, na
 * ordem em que saem, com o texto editável ali mesmo. Texto com problema não
 * deixa seguir. Com a prévia pronta, os textos aparecem como chegam para as
 * primeiras pessoas marcadas, com o mesmo preenchimento do envio.
 */
export function LinhaDoTempo({ inicial, exemplos, resumo }: { inicial: Abordagem; exemplos: PessoaDeExemplo[]; resumo: ReactNode }) {
  const [abordagem, setAbordagem] = useState(inicial);
  const [vendo, setVendo] = useState<string | null>(exemplos[0]?.providerId ?? null);
  const pessoaVista = exemplos.find((pessoa) => pessoa.providerId === vendo) ?? null;
  const [editando, setEditando] = useState<Toque | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const abrir = (toque: Toque) => {
    setErro(null);
    setEditando(toque);
    setRascunho(textoDo(abordagem, toque));
  };

  const salvar = (toque: Toque) =>
    iniciar(async () => {
      const resultado = await editarToque({ toque, texto: rascunho });
      if (resultado.ok) {
        setAbordagem(resultado.abordagem);
        setEditando(null);
      } else setErro(resultado.erro);
    });

  const reescrever = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await escreverDeNovo();
      if (resultado.ok) {
        setAbordagem(resultado.abordagem);
        setEditando(null);
      } else setErro(resultado.erro);
    });

  const permitir = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await podeEntrarEmContato();
      if (resultado && !resultado.ok) setErro(resultado.erro);
    });

  return (
    <>
      {exemplos.length > 0 && (
        <div className="mt-10">
          <p id="ver-como-chega" className="mb-2.5 text-sm text-tinta-suave">
            Ver como chega para
          </p>
          <div role="group" aria-labelledby="ver-como-chega" className="segmentos">
            {exemplos.slice(0, EXEMPLOS).map((pessoa) => (
              <button
                key={pessoa.providerId}
                type="button"
                className="segmento"
                aria-pressed={vendo === pessoa.providerId}
                onClick={() => setVendo(pessoa.providerId)}
              >
                {quemE(pessoa)}
                {pessoa.empresa && <span className="text-tinta-fraca">· {pessoa.empresa}</span>}
              </button>
            ))}
            <button type="button" className="segmento" aria-pressed={vendo === null} onClick={() => setVendo(null)}>
              Modelo
            </button>
          </div>
          <SemDado textos={[abordagem.textos.convite, ...abordagem.textos.mensagens]} exemplos={exemplos} />
        </div>
      )}

      <ol
        className={`relative flex flex-col gap-6 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-px before:bg-linha-forte ${
          exemplos.length > 0 ? "mt-8" : "mt-10"
        }`}
      >
        {PASSOS.map((passo, indice) => {
          const problemas = abordagem.problemas.filter((p) => p.toque === passo.toque);
          const texto = textoDo(abordagem, passo.toque);
          const preenchido = pessoaVista ? renderizarTemplate(texto, valoresDaPessoa(pessoaVista)) : null;
          const faltas = pessoaVista && preenchido && !preenchido.ok ? faltasParaPreencher([texto], [pessoaVista]) : [];
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
                  <h2 className="font-medium">{passo.titulo}</h2>
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
                  <p className="mt-3 rounded-2xl rounded-tl-md border border-linha bg-superficie-alta px-4 py-3 leading-relaxed">
                    {preenchido?.ok ? preenchido.texto : <ComTokens texto={texto} />}
                  </p>
                )}
                {pessoaVista &&
                  editando !== passo.toque &&
                  faltas.map(({ token }) => (
                    <p key={token} className="mt-2 flex items-start gap-1.5 text-sm text-atencao">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {quemE(pessoaVista)} está sem {DADO_DO_TOKEN[token]} no LinkedIn: para essa pessoa, este texto espera você revisar antes de sair.
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

      <button type="button" className="botao botao-pequeno mt-6" onClick={reescrever} disabled={pendente}>
        <RotateCcw aria-hidden />
        {pendente ? "Escrevendo..." : "Escrever de novo"}
      </button>

      {resumo}

      <div className="mt-8 flex flex-col gap-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <button
          type="button"
          className="botao botao-primario h-14 self-start px-6 text-base"
          onClick={permitir}
          disabled={pendente || abordagem.problemas.length > 0}
        >
          Pode entrar em contato
          <ArrowRight aria-hidden />
        </button>
        {abordagem.problemas.length > 0 && (
          <p className="text-xs text-atencao">Corrija o que está marcado para seguir.</p>
        )}
      </div>
    </>
  );
}
