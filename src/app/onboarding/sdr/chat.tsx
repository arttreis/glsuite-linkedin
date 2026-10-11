"use client";

import { ArrowRight, Info, Pencil, RotateCcw, SendHorizontal, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import type { ItemDoTeste } from "@/domain/teste-do-sdr";
import type { ResultadoDoTeste, TesteDoSdr } from "@/server/sdr/teste";
import { ajustarNoChat, desfazerNoChat, ficouBom, recomecarConversa, responderNoTeste } from "./acoes";

type Modo = "lead" | "ajuste";

const ACAO: Partial<Record<Extract<ItemDoTeste, { tipo: "sdr" }>["acao"], string>> = {
  propor_reuniao: "propôs a conversa",
  encerrar: "encerrou",
};

function Digitando() {
  return (
    <li className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-linha bg-superficie-alta px-4 py-3">
      <span className="sr-only">O SDR está escrevendo</span>
      {[0, 150, 300].map((atraso) => (
        <span key={atraso} aria-hidden className="size-1.5 animate-bounce rounded-full bg-tinta-suave" style={{ animationDelay: `${atraso}ms` }} />
      ))}
    </li>
  );
}

function Nota({ item, desfazer }: { item: Extract<ItemDoTeste, { tipo: "nota" }>; desfazer?: () => void }) {
  if (item.nota === "desfecho") {
    return (
      <li className="flex items-start gap-2 self-center px-2 text-center text-xs text-tinta-suave">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {item.texto}
      </li>
    );
  }
  const estilo =
    item.nota === "ajuste"
      ? "border-destaque/35 bg-destaque/10 text-destaque"
      : item.nota === "recusa"
        ? "border-atencao/35 bg-atencao/10 text-atencao"
        : "border-linha-forte bg-superficie-alta text-tinta-suave";
  const Icone = item.nota === "ajuste" ? Sparkles : item.nota === "recusa" ? Info : Undo2;
  return (
    <li className={`flex max-w-[90%] items-center gap-2 self-center rounded-full border px-3.5 py-1.5 text-xs ${estilo}`}>
      <Icone className="size-3.5 shrink-0" aria-hidden />
      <span>
        {item.nota === "recusa" ? "Não mudei: " : ""}
        {item.texto}
      </span>
      {desfazer && (
        <button type="button" onClick={desfazer} className="ml-1 font-medium underline underline-offset-2 hover:no-underline">
          Desfazer
        </button>
      )}
    </li>
  );
}

/**
 * O chat de teste do SDR (§4.3): a pessoa é o lead e o SDR responde como vai
 * responder os leads de verdade. O campo tem dois modos: responder como lead
 * ou ajustar o SDR.
 */
export function ChatDoSdr({
  inicial,
  nome,
  comSeguir = true,
}: {
  inicial: TesteDoSdr;
  nome: string;
  /** "Ficou bom, seguir" só no primeiro acesso; em Configurações o chat é só teste. */
  comSeguir?: boolean;
}) {
  const [teste, setTeste] = useState(inicial);
  const [mensagens, setMensagens] = useState<ItemDoTeste[]>(inicial.mensagens);
  const [modo, setModo] = useState<Modo>("lead");
  const [referencia, setReferencia] = useState<Extract<ItemDoTeste, { tipo: "sdr" }> | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [seguindo, iniciarSeguir] = useTransition();
  const router = useRouter();
  const lista = useRef<HTMLOListElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensagens, pendente]);

  const aplicar = (resultado: ResultadoDoTeste, desfazerOtimista: () => void) => {
    if (resultado.ok) {
      setTeste(resultado.teste);
      setMensagens(resultado.teste.mensagens);
    } else {
      desfazerOtimista();
      setErro(resultado.erro);
    }
  };

  const enviar = (evento?: FormEvent) => {
    evento?.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || pendente) return;
    setErro(null);
    setTexto("");
    const antes = mensagens;
    const agora = new Date().toISOString();
    const restaurar = () => {
      setMensagens(antes);
      setTexto(conteudo);
    };
    if (modo === "lead") {
      setMensagens([...antes, { id: `otimista-${agora}`, tipo: "lead", texto: conteudo, em: agora }]);
      iniciar(async () => aplicar(await responderNoTeste({ texto: conteudo }), restaurar));
    } else {
      setMensagens([...antes, { id: `otimista-${agora}`, tipo: "nota", nota: "desfeito", texto: `Ajustando: ${conteudo}`, em: agora }]);
      const referenciaId = referencia?.id ?? null;
      iniciar(async () => {
        aplicar(await ajustarNoChat({ pedido: conteudo, referenciaId }), restaurar);
        setReferencia(null);
        setModo("lead");
        // "Ver o SDR completo" vem do servidor: recarrega sem perder o chat.
        router.refresh();
      });
    }
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLTextAreaElement>) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      enviar();
    }
  };

  const ajustarResposta = (item: Extract<ItemDoTeste, { tipo: "sdr" }>) => {
    setReferencia(item);
    setModo("ajuste");
    campo.current?.focus();
  };

  const recomecar = (segmento: string) => {
    setErro(null);
    const antes = mensagens;
    setMensagens([]);
    iniciar(async () => aplicar(await recomecarConversa({ segmento }), () => setMensagens(antes)));
  };

  const desfazer = () => {
    setErro(null);
    iniciar(async () => {
      aplicar(await desfazerNoChat(), () => undefined);
      router.refresh();
    });
  };

  const seguir = () =>
    iniciarSeguir(async () => {
      const resultado = await ficouBom();
      if (resultado && !resultado.ok) setErro(resultado.erro);
    });

  // O "desfazer" fica só no último ajuste, enquanto ele for a última mudança do SDR.
  const ultimaMudanca = mensagens.findLast((item) => item.tipo === "nota" && (item.nota === "ajuste" || item.nota === "desfeito"));

  return (
    <>
      <div className="cartao mt-10 flex flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar nome={nome} />
            <div>
              <p className="font-medium leading-tight">{nome}</p>
              <p className="text-xs text-tinta-fraca">SDR · versão {teste.sdrVersao}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-tinta-suave">
            Você é {teste.lead}, de
            <select
              value={teste.segmento}
              onChange={(e) => {
                setTeste({ ...teste, segmento: e.target.value });
                recomecar(e.target.value);
              }}
              className="campo campo-pequeno max-w-56"
              disabled={pendente}
            >
              {teste.segmentos.map((segmento) => (
                <option key={segmento} value={segmento}>
                  {segmento}
                </option>
              ))}
            </select>
          </label>
        </header>

        <ol ref={lista} aria-live="polite" className="flex max-h-[55vh] min-h-[22rem] flex-col gap-3 overflow-y-auto px-5 py-6">
          {mensagens.map((item) => {
            if (item.tipo === "nota") {
              return <Nota key={item.id} item={item} desfazer={teste.podeDesfazer && item === ultimaMudanca && item.nota === "ajuste" && !pendente ? desfazer : undefined} />;
            }
            if (item.tipo === "lead") {
              return (
                <li key={item.id} className="max-w-[80%] self-end rounded-2xl rounded-br-md border border-destaque/30 bg-destaque/15 px-4 py-2.5">
                  {item.texto}
                </li>
              );
            }
            return (
              <li key={item.id} className="group flex max-w-[80%] flex-col items-start gap-1 self-start">
                <p className={`rounded-2xl rounded-bl-md border bg-superficie-alta px-4 py-2.5 ${item.aviso ? "border-atencao/40" : "border-linha"}`}>
                  {item.texto}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-tinta-fraca">
                  {ACAO[item.acao] && <span>{ACAO[item.acao]}</span>}
                  {item.aviso && <span className="text-atencao">Na produção, esperaria a sua aprovação: {item.aviso}</span>}
                  <button
                    type="button"
                    onClick={() => ajustarResposta(item)}
                    disabled={pendente}
                    className="inline-flex items-center gap-1 hover:text-tinta sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <Pencil className="size-3" aria-hidden />
                    Ajustar esta resposta
                  </button>
                </div>
              </li>
            );
          })}
          {pendente && <Digitando />}
        </ol>

        <footer className="border-t border-linha p-3">
          <div role="radiogroup" aria-label="O que você está escrevendo" className="mb-2 inline-flex rounded-full border border-linha bg-fundo p-0.5 text-xs">
            {(
              [
                ["lead", `Responder como ${teste.lead}`],
                ["ajuste", "Ajustar o SDR"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={modo === valor}
                onClick={() => {
                  setModo(valor);
                  if (valor === "lead") setReferencia(null);
                  campo.current?.focus();
                }}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  modo === valor ? (valor === "ajuste" ? "bg-destaque text-fundo" : "bg-superficie-alta text-tinta") : "text-tinta-suave hover:text-tinta"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {modo === "ajuste" && referencia && (
            <p className="mb-2 flex items-start gap-2 rounded-lg border border-linha bg-fundo px-3 py-2 text-xs text-tinta-suave">
              <span className="min-w-0 flex-1">
                Ajustando a resposta: <span className="text-tinta">“{referencia.texto}”</span>
              </span>
              <button type="button" aria-label="Não apontar resposta" onClick={() => setReferencia(null)} className="hover:text-tinta">
                <X className="size-3.5" aria-hidden />
              </button>
            </p>
          )}
          <form onSubmit={enviar} className="flex items-end gap-2">
            <label htmlFor="mensagem" className="sr-only">
              {modo === "lead" ? `Mensagem de ${teste.lead}` : "O que mudar no SDR"}
            </label>
            <textarea
              id="mensagem"
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              rows={2}
              maxLength={1000}
              placeholder={
                modo === "lead"
                  ? `Escreva como ${teste.lead} responderia...`
                  : referencia
                    ? "O que ele deveria ter dito?"
                    : "O que o SDR deveria fazer diferente? Ex.: menos formal, não falar de preço."
              }
              className={`campo min-h-12 flex-1 resize-none ${modo === "ajuste" ? "border-destaque/50" : ""}`}
            />
            <button type="submit" className="botao botao-primario h-12 shrink-0 px-4" disabled={pendente || texto.trim().length === 0}>
              {modo === "lead" ? <SendHorizontal aria-hidden /> : <Wand2 aria-hidden />}
              <span className="sr-only sm:not-sr-only">{modo === "lead" ? "Enviar" : "Ajustar"}</span>
            </button>
          </form>
          {erro && (
            <Aviso tom="erro" className="mt-2">
              {erro}
            </Aviso>
          )}
        </footer>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="botao botao-pequeno" onClick={() => recomecar(teste.segmento)} disabled={pendente}>
          <RotateCcw aria-hidden />
          Recomeçar conversa
        </button>
        {comSeguir && (
          <button type="button" className="botao botao-primario" onClick={seguir} disabled={pendente || seguindo}>
            {seguindo ? "Seguindo..." : "Ficou bom, seguir"}
            <ArrowRight aria-hidden />
          </button>
        )}
      </div>
    </>
  );
}
