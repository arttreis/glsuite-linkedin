"use client";

import { CircleAlert, Send } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Aviso } from "@/components/aviso";
import { contextoDeValidacao, type ContextoDoPerfil } from "@/domain/campanha";
import { validarMensagem } from "@/domain/validador";
import { responder, type EstadoDaResposta } from "./acoes";

const INICIAL: EstadoDaResposta = { status: "inicial" };

export function FormularioDeResposta({
  leadId,
  contexto,
  bloqueio,
  aviso,
  sugestao = null,
}: {
  leadId: string;
  contexto: ContextoDoPerfil;
  bloqueio: string | null;
  /** O que acontece ao responder, quando o SDR ainda conduz a conversa. */
  aviso: string | null;
  /** A resposta que o SDR sugeriu ao passar a conversa (SDR-66): vem preenchida e editável. */
  sugestao?: string | null;
}) {
  const [estado, acao, enviando] = useActionState(responder, INICIAL);
  const [texto, setTexto] = useState(sugestao ?? "");
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [ultimoEnvio, setUltimoEnvio] = useState<number | null>(null);

  // Cada envio bem-sucedido limpa o campo e gera uma chave nova.
  if (estado.status === "enviada" && estado.em !== ultimoEnvio) {
    setUltimoEnvio(estado.em);
    setTexto("");
    setChave(crypto.randomUUID());
  }

  const validacao = useMemo(
    () => (texto.trim() ? validarMensagem(texto, contextoDeValidacao(contexto, null, "humano")) : null),
    [texto, contexto],
  );

  if (bloqueio) {
    return (
      <div className="border-t border-linha p-4">
        <Aviso tom="atencao">{bloqueio}</Aviso>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-2.5 border-t border-linha p-3 sm:p-4">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="chave" value={chave} />
      {sugestao && ultimoEnvio === null && (
        <label htmlFor={`resposta-${leadId}`} className="text-[11px] font-medium uppercase tracking-wide text-destaque">
          Sugestão do SDR
          <span className="ml-1.5 normal-case tracking-normal text-tinta-fraca">revise e edite antes de enviar</span>
        </label>
      )}
      <textarea
        id={`resposta-${leadId}`}
        name="texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        aria-label="Resposta"
        placeholder="Escreva uma mensagem"
        className="campo w-full resize-y"
      />
      {aviso && <p className="text-xs text-tinta-fraca">{aviso}</p>}
      {validacao?.violacoes.map((v) => (
        <p key={v.regra} className="flex items-start gap-1.5 text-sm text-erro">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {v.mensagem}
        </p>
      ))}
      {estado.status === "erro" && (
        <Aviso tom="erro">
          <p>{estado.mensagem}</p>
          {estado.violacoes?.map((v) => <p key={v.regra}>{v.mensagem}</p>)}
        </Aviso>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-tinta-fraca tabular-nums">
          {texto.trim().length} caracteres
          {estado.status === "enviada" && <span className="ml-3 text-ok">Enviada.</span>}
        </span>
        <button
          type="submit"
          disabled={enviando || !texto.trim() || (validacao !== null && !validacao.ok)}
          className="botao botao-primario"
        >
          <Send aria-hidden />
          {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </form>
  );
}
