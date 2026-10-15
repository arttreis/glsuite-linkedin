"use client";

import { ArrowRight, Check, PencilLine, Sparkles } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import type { Dossie } from "@/domain/dossie";
import { ACOES_DO_SDR, DURACOES, OPCOES_DE_ACAO, type RespostasDoObjetivo } from "@/domain/objetivo";
import type { ResultadoDoObjetivo } from "@/server/objetivo/objetivo";
import { confirmarObjetivoNoPrimeiroAcesso, resumirObjetivoDoPainel, salvarObjetivo } from "./acoes";

/** Uma pergunta por bloco, numerada, como os passos. */
function Bloco({ numero, titulo, ajuda, children }: { numero: number; titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <fieldset className="cartao min-w-0 p-4 sm:p-6">
      <legend className="sr-only">{titulo}</legend>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-destaque/50 text-[11px] font-medium text-destaque">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <h2 aria-hidden className="text-lg font-medium tracking-tight">
            {titulo}
          </h2>
          {ajuda && <p className="mt-1 text-[13px] text-tinta-suave">{ajuda}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </fieldset>
  );
}

const cartaoDeOpcao =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-linha p-3.5 transition-colors hover:border-linha-forte has-[:checked]:border-destaque/50 has-[:checked]:bg-destaque/[0.05]";

type Salvamento = { tipo: "salvando" } | { tipo: "salvo" } | { tipo: "erro"; texto: string } | null;

/**
 * As quatro perguntas do objetivo (§4.2.1) e o resumo para validar. Cada
 * mudança grava as respostas como rascunho; "Ver o resumo" pede o resumo à
 * IA; "Confirmar" grava o objetivo. No primeiro acesso, confirmar segue para
 * o SDR; em Configurações, só confirma.
 */
export function FormularioDoObjetivo({
  produtos,
  inicial,
  resumoInicial,
  confirmar = confirmarObjetivoNoPrimeiroAcesso,
  rotuloDeConfirmar = "Confirmar e montar o SDR",
  aoConfirmar,
}: {
  produtos: Dossie["produtos"];
  inicial: RespostasDoObjetivo;
  resumoInicial: string | null;
  confirmar?: () => Promise<ResultadoDoObjetivo>;
  rotuloDeConfirmar?: string;
  aoConfirmar?: () => void;
}) {
  const nomesDaAnalise = produtos.map((p) => p.nome);
  const outroInicial = inicial.produtos.find((p) => !nomesDaAnalise.includes(p)) ?? "";
  const [r, setR] = useState<RespostasDoObjetivo>(inicial);
  const [outro, setOutro] = useState(outroInicial);
  const [outroMarcado, setOutroMarcado] = useState(outroInicial !== "");
  const [resumo, setResumo] = useState<string | null>(resumoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvamento, setSalvamento] = useState<Salvamento>(null);
  const [, iniciarSalvamento] = useTransition();
  const [resumindo, iniciarResumo] = useTransition();
  const [confirmando, iniciarConfirmacao] = useTransition();
  const travado = resumindo || confirmando;

  /** As respostas como vão para o servidor: o "outro", quando marcado, entra na lista. */
  const montar = (base: RespostasDoObjetivo, texto: string, marcado: boolean): RespostasDoObjetivo => {
    const daAnalise = base.produtos.filter((p) => nomesDaAnalise.includes(p));
    const lista = marcado && texto.trim() ? [...daAnalise, texto.trim()] : daAnalise;
    const principal = lista.includes(base.principal) ? base.principal : (lista[0] ?? "");
    return { ...base, produtos: lista, principal };
  };

  const salvar = (respostas: RespostasDoObjetivo) => {
    setResumo(null);
    setErro(null);
    setSalvamento({ tipo: "salvando" });
    iniciarSalvamento(async () => {
      const resultado = await salvarObjetivo({ respostas });
      setSalvamento(resultado.ok ? { tipo: "salvo" } : { tipo: "erro", texto: resultado.erro });
    });
  };

  /** Muda e grava na hora (marcar, escolher). */
  const mudar = (parcial: Partial<RespostasDoObjetivo>, texto = outro, marcado = outroMarcado) => {
    const novo = montar({ ...r, ...parcial }, texto, marcado);
    setR(novo);
    salvar(novo);
  };

  /** Texto: muda na tela e grava ao sair do campo. */
  const digitar = (parcial: Partial<RespostasDoObjetivo>) => {
    setResumo(null);
    setR({ ...r, ...parcial });
  };

  const alternarProduto = (nome: string, marcado: boolean) => {
    const lista = marcado ? [...r.produtos, nome] : r.produtos.filter((p) => p !== nome);
    mudar({ produtos: lista, principal: r.produtos.length === 0 && marcado ? nome : r.principal });
  };

  const pedirResumo = () =>
    iniciarResumo(async () => {
      setErro(null);
      const resultado = await resumirObjetivoDoPainel({ respostas: montar(r, outro, outroMarcado) });
      if (resultado.ok) {
        setResumo(resultado.resumo);
        setSalvamento(null);
      } else setErro(resultado.erro);
    });

  const confirmarResumo = () =>
    iniciarConfirmacao(async () => {
      setErro(null);
      const resultado = await confirmar();
      if (!resultado.ok) setErro(resultado.erro);
      else aoConfirmar?.();
    });

  if (resumo) {
    return (
      <div className="mt-10 flex flex-col gap-5">
        <section className="cartao cartao-vitrine p-6 sm:p-8" aria-labelledby="titulo-resumo">
          <p id="titulo-resumo" className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-destaque">
            <Sparkles className="size-3.5" aria-hidden />
            Entendemos assim
          </p>
          <p className="mt-4 text-xl leading-relaxed tracking-tight text-tinta sm:text-2xl">{resumo}</p>
          <p className="mt-5 text-[13px] text-tinta-suave">Se algo não estiver certo, corrija as respostas e veja o resumo de novo.</p>
        </section>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="botao botao-primario" onClick={confirmarResumo} disabled={confirmando}>
            {confirmando ? "Confirmando..." : rotuloDeConfirmar}
            <ArrowRight aria-hidden />
          </button>
          <button type="button" className="botao" onClick={() => setResumo(null)} disabled={confirmando}>
            <PencilLine aria-hidden />
            Corrigir as respostas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-col gap-4">
      <Bloco numero={1} titulo="O que você quer vender pelo LinkedIn?" ajuda="Pode marcar mais de um. O principal é o que o SDR puxa primeiro.">
        <ul className="flex flex-col gap-2">
          {produtos.map((produto) => {
            const marcado = r.produtos.includes(produto.nome);
            return (
              <li key={produto.nome} className={cartaoDeOpcao}>
                <input
                  id={`produto-${produto.nome}`}
                  type="checkbox"
                  checked={marcado}
                  onChange={(e) => alternarProduto(produto.nome, e.target.checked)}
                  disabled={travado}
                  className="mt-1 size-4 shrink-0"
                />
                <label htmlFor={`produto-${produto.nome}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-medium">{produto.nome}</span>
                  <span className="mt-0.5 block text-[13px] text-tinta-suave">{produto.descricao}</span>
                </label>
                {marcado && (
                  <Principal
                    marcado={r.principal === produto.nome}
                    aoMarcar={() => mudar({ principal: produto.nome })}
                    desabilitado={travado}
                    nome={produto.nome}
                  />
                )}
              </li>
            );
          })}
          <li className={`${cartaoDeOpcao} flex-wrap`}>
            <input
              id="produto-outro"
              type="checkbox"
              checked={outroMarcado}
              onChange={(e) => {
                setOutroMarcado(e.target.checked);
                mudar({}, outro, e.target.checked);
              }}
              disabled={travado}
              className="mt-1 size-4 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <label htmlFor="produto-outro" className="block cursor-pointer text-sm font-medium">
                Outro
              </label>
              <input
                aria-label="Outro produto ou serviço"
                value={outro}
                maxLength={120}
                placeholder="Um produto ou serviço que não está no site"
                onChange={(e) => {
                  setOutro(e.target.value);
                  setResumo(null);
                  if (e.target.value.trim()) setOutroMarcado(true);
                }}
                onBlur={() => mudar({}, outro, outroMarcado)}
                disabled={travado}
                className="campo campo-pequeno mt-2 w-full"
              />
            </div>
            {outroMarcado && outro.trim() && (
              <Principal
                marcado={r.principal === outro.trim()}
                aoMarcar={() => mudar({ principal: outro.trim() })}
                desabilitado={travado}
                nome={outro.trim()}
              />
            )}
          </li>
        </ul>
      </Bloco>

      <Bloco numero={2} titulo="O que o SDR deve fazer?">
        <div className="flex flex-col gap-2">
          {ACOES_DO_SDR.map((acao) => (
            <label key={acao} className={cartaoDeOpcao}>
              <input
                type="radio"
                name="acao"
                value={acao}
                checked={r.acao === acao}
                onChange={() => mudar({ acao })}
                disabled={travado}
                className="mt-1 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{OPCOES_DE_ACAO[acao].rotulo}</span>
                <span className="mt-0.5 block text-[13px] text-tinta-suave">{OPCOES_DE_ACAO[acao].descricao}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed border-linha p-3.5 opacity-70">
            <input type="radio" name="acao" value="agendar" disabled className="mt-1 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {OPCOES_DE_ACAO.agendar.rotulo}
                <span className="etiqueta etiqueta-destaque">em breve</span>
              </span>
              <span className="mt-0.5 block text-[13px] text-tinta-suave">{OPCOES_DE_ACAO.agendar.descricao}</span>
            </span>
          </label>
        </div>
      </Bloco>

      <Bloco
        numero={3}
        titulo="Com quem é a conversa e de quanto tempo?"
        ajuda={r.acao === "qualificar" ? "Quem recebe o lead quando ele serve." : "Quem atende a conversa que o SDR propõe."}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="rotulo min-w-0 flex-1">
            Quem atende
            <input
              value={r.quem_atende}
              maxLength={80}
              onChange={(e) => digitar({ quem_atende: e.target.value })}
              onBlur={() => mudar({})}
              disabled={travado}
              className="campo"
            />
          </label>
          <div role="radiogroup" aria-label="Duração da conversa" className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-tinta-suave">Duração</span>
            <div className="grid grid-cols-4 gap-1.5">
              {DURACOES.map((duracao) => (
                <label
                  key={duracao}
                  className="flex h-9 cursor-pointer whitespace-nowrap items-center justify-center rounded-full border border-linha px-2.5 text-sm tabular-nums sm:px-3 transition-colors hover:border-linha-forte has-[:checked]:border-destaque/60 has-[:checked]:bg-destaque/10 has-[:checked]:text-destaque has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-destaque"
                >
                  <input
                    type="radio"
                    name="duracao"
                    value={duracao}
                    checked={r.duracao === duracao}
                    onChange={() => mudar({ duracao })}
                    disabled={travado}
                    className="sr-only"
                  />
                  {duracao} min
                </label>
              ))}
            </div>
          </div>
        </div>
      </Bloco>

      <Bloco numero={4} titulo="Algo que o SDR nunca deve fazer ou oferecer?" ajuda="Opcional. Ex.: não falar de preço por mensagem, não oferecer teste grátis.">
        <textarea
          aria-label="O que o SDR nunca deve fazer ou oferecer"
          value={r.nunca ?? ""}
          maxLength={300}
          rows={3}
          onChange={(e) => digitar({ nunca: e.target.value })}
          onBlur={() => mudar({})}
          disabled={travado}
          className="campo w-full"
        />
      </Bloco>

      <div className="sticky bottom-0 -mx-5 mt-2 flex flex-col gap-3 border-t border-linha bg-fundo/90 px-5 py-4 backdrop-blur">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {salvamento?.tipo === "erro" && !erro && <Aviso tom="atencao">{salvamento.texto}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="botao botao-primario" onClick={pedirResumo} disabled={travado}>
            {resumindo ? "Escrevendo o resumo..." : "Ver o resumo"}
            <ArrowRight aria-hidden />
          </button>
          <span className="text-xs text-tinta-fraca" aria-live="polite">
            {resumindo
              ? "Leva uns segundos."
              : salvamento?.tipo === "salvando"
                ? "Salvando..."
                : salvamento?.tipo === "salvo"
                  ? "Respostas salvas."
                  : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "Principal": uma pílula por produto marcado; só um acende. */
function Principal({ marcado, aoMarcar, desabilitado, nome }: { marcado: boolean; aoMarcar: () => void; desabilitado: boolean; nome: string }) {
  return (
    <label
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        marcado ? "border-destaque/60 bg-destaque/10 text-destaque" : "border-linha text-tinta-fraca hover:text-tinta-suave"
      }`}
    >
      <input type="radio" name="principal" checked={marcado} onChange={aoMarcar} disabled={desabilitado} className="sr-only" aria-label={`${nome} é o principal`} />
      {marcado && <Check className="size-3" aria-hidden />}
      Principal
    </label>
  );
}
