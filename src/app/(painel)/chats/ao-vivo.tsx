"use client";

import { useEffect, useRef } from "react";

/** Leva o fio até a última mensagem ao abrir e quando chega uma nova. */
export function RolarParaOFim({ chave }: { chave: string }) {
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [chave]);
  return <div ref={fim} aria-hidden />;
}
