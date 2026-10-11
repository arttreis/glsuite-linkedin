"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Os Chats se atualizam sozinhos (§4.8): busca de novo a cada intervalo, só com a aba visível. */
export function AtualizarSozinho({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}

/** Leva o fio até a última mensagem ao abrir e quando chega uma nova. */
export function RolarParaOFim({ chave }: { chave: string }) {
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [chave]);
  return <div ref={fim} aria-hidden />;
}
