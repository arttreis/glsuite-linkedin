import type { ReactNode } from "react";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";

/**
 * A moldura das DMs (§4.8): lista à esquerda e a conversa ao lado, cada uma
 * com a própria rolagem. No celular, uma coluna por vez: a lista, ou a
 * conversa aberta.
 */
export function MolduraDoChat({ lista, children, aberta }: { lista: ReactNode; children?: ReactNode; aberta: boolean }) {
  return (
    <div className="grid gap-3 py-4 lg:-mb-16 lg:h-dvh lg:grid-cols-[21rem_minmax(0,1fr)] lg:py-3">
      {/* Os Chats se atualizam sozinhos (§4.8). */}
      <AtualizarSozinho segundos={15} />
      <aside className={`cartao min-h-0 flex-col overflow-hidden lg:flex ${aberta ? "hidden" : "flex"}`}>{lista}</aside>
      <div className={`min-h-0 ${aberta ? "" : "hidden lg:block"}`}>{children}</div>
    </div>
  );
}
