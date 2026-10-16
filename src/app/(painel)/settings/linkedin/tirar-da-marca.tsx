"use client";

import { Unlink } from "lucide-react";
import { useState } from "react";

/** "Tirar desta marca" com a confirmação de que as campanhas da marca nessa conta pausam (D36). */
export function TirarDaMarca({
  perfilId,
  conta,
  marca,
  acao,
}: {
  perfilId: string;
  conta: string;
  marca: string;
  acao: (formData: FormData) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <button type="button" className="botao botao-pequeno" onClick={() => setConfirmando(true)}>
        <Unlink aria-hidden />
        Tirar desta marca
      </button>
    );
  }
  return (
    <form action={acao} className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-superficie-alta px-4 py-3" role="group" aria-label={`Tirar ${conta} da ${marca}`}>
      <input type="hidden" name="perfilId" value={perfilId} />
      <p className="min-w-0 flex-1 basis-60 text-[13px]">
        Tirar {conta} da {marca}? As campanhas da {marca} nessa conta pausam. As conversas e os leads ficam como estão.
      </p>
      <button type="submit" className="botao botao-pequeno botao-primario">
        Tirar
      </button>
      <button type="button" className="botao botao-pequeno" onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </form>
  );
}
