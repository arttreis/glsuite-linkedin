"use client";

import { CircleAlert, Send } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Aviso } from "@/components/aviso";
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

  if (bloqueio) return <Aviso tom="atencao">{bloqueio}</Aviso>;

  return (
    <form action={acao} className="cartao flex flex-col gap-3 p-4">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="chave" value={chave} />
      <textarea
        name="texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        aria-label="Resposta"
        placeholder="Escreva a resposta. Ela sai pelo LinkedIn do perfil, com você como autor."
        className="campo w-full"
      />
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
          {enviando ? "Enviando..." : "Enviar pelo LinkedIn"}
        </button>
      </div>
    </form>
  );
}
