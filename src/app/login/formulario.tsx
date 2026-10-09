"use client";

import { Mail } from "lucide-react";
import { useActionState } from "react";
import { Aviso } from "@/components/aviso";
import { enviarLinkDeAcesso, type EstadoLogin } from "./acoes";

const ESTADO_INICIAL: EstadoLogin = { status: "inicial" };

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao, enviando] = useActionState(enviarLinkDeAcesso, ESTADO_INICIAL);

  if (estado.status === "enviado") {
    return (
      <Aviso tom="ok">
        Enviamos um link de acesso para <strong className="font-medium">{estado.email}</strong>. Abra no mesmo navegador.
      </Aviso>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="proximo" value={proximo} />
      <label className="rotulo">
        E-mail
        <input name="email" type="email" required autoComplete="email" placeholder="voce@guessless.com.br" className="campo" />
      </label>
      {estado.status === "erro" && <Aviso tom="erro">{estado.mensagem}</Aviso>}
      <button type="submit" disabled={enviando} className="botao botao-primario w-full">
        <Mail aria-hidden />
        {enviando ? "Enviando..." : "Receber link de acesso"}
      </button>
    </form>
  );
}
