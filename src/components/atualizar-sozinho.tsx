"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os dados da página a cada `segundos` enquanto estiver na tela. Para tarefas que rodam no servidor. */
export function AtualizarSozinho({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}
