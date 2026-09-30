"use client";

import { useActionState, useMemo, useState } from "react";
import { contextoDeValidacao, type ContextoDoPerfil } from "@/domain/campanha";
import { validarMensagem } from "@/domain/validador";
import { responder, type EstadoDaResposta } from "../acoes";

const INICIAL: EstadoDaResposta = { status: "inicial" };

export function FormularioDeResposta({
  leadId,
  contexto,
  bloqueio,
  textoInicial = "",
}: {
  leadId: string;
  contexto: ContextoDoPerfil;
  bloqueio: string | null;
  textoInicial?: string;
}) {
  const [estado, acao, enviando] = useActionState(responder, INICIAL);
  const [texto, setTexto] = useState(textoInicial);
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

  if (bloqueio) return <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">{bloqueio}</p>;

  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="chave" value={chave} />
      <textarea
        name="texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        placeholder="Escreva a resposta. Ela sai pelo LinkedIn do perfil, com você como autor."
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
      />
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{texto.trim().length} caracteres</span>
        {estado.status === "enviada" && <span className="text-emerald-700">Enviada.</span>}
      </div>
      {validacao?.violacoes.map((v) => (
        <p key={v.regra} className="text-sm text-red-700">
          {v.mensagem}
        </p>
      ))}
      {estado.status === "erro" && (
        <div className="text-sm text-red-700">
          <p>{estado.mensagem}</p>
          {estado.violacoes?.map((v) => <p key={v.regra}>{v.mensagem}</p>)}
        </div>
      )}
      <button
        type="submit"
        disabled={enviando || !texto.trim() || (validacao !== null && !validacao.ok)}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enviando ? "Enviando..." : "Enviar pelo LinkedIn"}
      </button>
    </form>
  );
}
