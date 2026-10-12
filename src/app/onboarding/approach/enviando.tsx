"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Botão de formulário que avisa enquanto a ação roda: trocar de público e
 * sugerir outros chamam a IA e a busca, e levam alguns segundos.
 */
export function BotaoQueEspera({
  children,
  esperando,
  className,
  title,
}: {
  children: ReactNode;
  esperando: ReactNode;
  className: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} title={title} disabled={pending} aria-busy={pending}>
      {pending ? esperando : children}
    </button>
  );
}
