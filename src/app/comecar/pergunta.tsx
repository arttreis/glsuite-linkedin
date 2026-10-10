import type { ReactNode } from "react";
import { PASSO_INICIAL, PASSOS_DO_PRIMEIRO_ACESSO, type IdDoPassoInicial } from "@/domain/primeiro-acesso";

/**
 * A pergunta do passo, grande: é o que a tela pede. Abaixo, uma linha de
 * contexto opcional.
 */
export function Pergunta({
  passo,
  titulo,
  children,
}: {
  passo: IdDoPassoInicial;
  /** No lugar da pergunta, quando a tela está noutro momento (lendo, erro). */
  titulo?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-destaque">
        Passo {PASSOS_DO_PRIMEIRO_ACESSO.indexOf(passo) + 1} · {PASSO_INICIAL[passo].rotulo}
      </p>
      <h1 className="titulo-passo mt-4">{titulo ?? PASSO_INICIAL[passo].pergunta}</h1>
      {children && <p className="mt-4 max-w-xl text-tinta-suave">{children}</p>}
    </div>
  );
}

/** Passo que ainda não foi construído: mostra a pergunta e avisa. */
export function PassoEmConstrucao({ passo }: { passo: IdDoPassoInicial }) {
  return (
    <>
      <Pergunta passo={passo} />
      <div className="vazio mt-10">
        <p>Este passo ainda está sendo montado.</p>
      </div>
    </>
  );
}
