"use client";

import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "./avatar";
import { Marca } from "./marca";
import { Navegacao } from "./navegacao";

export type OperadorDaSessao = { nome: string; email: string; papel: "admin" | "operador"; emPrimeirosPassos: boolean };

function PainelLateral({ operador, aoFechar }: { operador: OperadorDaSessao; aoFechar?: () => void }) {
  return (
    <div className="cartao flex h-full flex-col p-3">
      <div className="flex items-center justify-between px-2 pb-5 pt-1">
        <Marca />
        {aoFechar && (
          <button type="button" className="botao botao-pequeno px-2" aria-label="Fechar menu" onClick={aoFechar} autoFocus>
            <X aria-hidden />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <Navegacao admin={operador.papel === "admin"} emPrimeirosPassos={operador.emPrimeirosPassos} aoNavegar={aoFechar} />
      </div>
      <div className="mt-3 rounded-xl border border-linha bg-superficie-alta p-3">
        <div className="flex items-center gap-3">
          <Avatar nome={operador.nome} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{operador.nome}</p>
            <p className="truncate text-xs text-tinta-fraca">{operador.email}</p>
          </div>
        </div>
        <form action="/auth/sair" method="post" className="mt-3">
          <button type="submit" className="botao botao-pequeno w-full">
            <LogOut aria-hidden />
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Moldura do painel. No desktop, a barra lateral fica fixa ao lado do
 * conteúdo; no celular, ela abre por cima, pelo botão de menu.
 */
export function Estrutura({ operador, children }: { operador: OperadorDaSessao; children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setMenuAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [menuAberto]);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[17.5rem] shrink-0 p-3 pr-0 lg:block">
        <PainelLateral operador={operador} />
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="absolute inset-0 bg-black/70"
            onClick={() => setMenuAberto(false)}
          />
          <div className="relative h-full w-[17.5rem] max-w-[85vw] p-3">
            <PainelLateral operador={operador} aoFechar={() => setMenuAberto(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-linha bg-fundo/85 px-5 py-3 backdrop-blur lg:hidden">
          <Marca />
          <button
            type="button"
            className="botao botao-pequeno px-2"
            aria-label="Abrir menu"
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto(true)}
          >
            <Menu aria-hidden />
          </button>
        </div>
        <main className="area-principal flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
