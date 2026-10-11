"use client";

import { Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { RespostaPendente } from "@/server/chats/chats";
import { descartarPendente, enviarPendente } from "./acoes";

/**
 * A resposta que o SDR escreveu e espera você (§4.7): no fim da conversa, com
 * Enviar, Editar e Descartar. Texto barrado pelo validador chega com o motivo.
 */
export function RespostaParaAprovar({ pendente }: { pendente: RespostaPendente }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(pendente.texto);

  return (
    <li className="ml-auto w-full max-w-[85%] rounded-2xl rounded-tr-md border border-dashed border-destaque/50 bg-destaque/[0.04] px-4 py-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-destaque">
        O SDR quer responder{pendente.toque ? ` (${pendente.toque})` : ""}
      </p>
      {pendente.motivo && <p className="mt-1 text-[13px] text-atencao">{pendente.motivo}</p>}
      <form action={enviarPendente} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="acaoId" value={pendente.id} />
        {editando ? (
          <textarea
            name="texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            aria-label="Texto da resposta"
            className="campo w-full"
            autoFocus
          />
        ) : (
          <>
            <input type="hidden" name="texto" value={texto} />
            <p className="whitespace-pre-wrap leading-relaxed">{texto}</p>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="submit" formAction={descartarPendente} className="botao botao-pequeno">
            <Trash2 aria-hidden />
            Descartar
          </button>
          {!editando && (
            <button type="button" className="botao botao-pequeno" onClick={() => setEditando(true)}>
              <Pencil aria-hidden />
              Editar
            </button>
          )}
          <button type="submit" className="botao botao-primario botao-pequeno" disabled={!texto.trim()}>
            <Send aria-hidden />
            Enviar
          </button>
        </div>
      </form>
    </li>
  );
}
