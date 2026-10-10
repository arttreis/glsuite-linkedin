"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { sugerirPublicosDoPainel } from "./acoes";

/** Pede públicos à IA e espera: a chamada leva de 20 segundos a 1 minuto. */
export function BotaoSugerir({ principal, desabilitado, jaTemSugestoes }: { principal: boolean; desabilitado: boolean; jaTemSugestoes: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  const sugerir = () =>
    iniciar(async () => {
      setRetorno(null);
      const resultado = await sugerirPublicosDoPainel();
      setRetorno(
        resultado.ok
          ? { tom: "ok", texto: `${resultado.quantidade} públicos sugeridos. Escolha os que fazem sentido.` }
          : { tom: "erro", texto: resultado.erro },
      );
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className={principal ? "botao botao-primario" : "botao"}
        onClick={sugerir}
        disabled={desabilitado || pendente}
        title={jaTemSugestoes ? "As sugestões atuais são trocadas pelas novas. Os escolhidos ficam." : undefined}
      >
        <Sparkles aria-hidden />
        {pendente ? "Pensando nos públicos…" : jaTemSugestoes ? "Sugerir de novo" : "Sugerir públicos"}
      </button>
      {pendente && <p className="text-xs text-tinta-fraca">Leva até 1 minuto.</p>}
      {retorno && (
        <Aviso tom={retorno.tom} className="max-w-sm">
          {retorno.texto}
        </Aviso>
      )}
    </div>
  );
}
