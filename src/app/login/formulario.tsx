"use client";

import { useActionState } from "react";
import { enviarLinkDeAcesso, type EstadoLogin } from "./acoes";

const ESTADO_INICIAL: EstadoLogin = { status: "inicial" };

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao, enviando] = useActionState(enviarLinkDeAcesso, ESTADO_INICIAL);

  if (estado.status === "enviado") {
    return (
      <p className="text-sm text-neutral-700">
        Enviamos um link de acesso para <strong>{estado.email}</strong>. Abra no mesmo navegador.
      </p>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="proximo" value={proximo} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal outline-none focus:border-neutral-900"
        />
      </label>
      {estado.status === "erro" && (
        <p role="alert" className="text-sm text-red-700">
          {estado.mensagem}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {enviando ? "Enviando..." : "Receber link de acesso"}
      </button>
    </form>
  );
}
