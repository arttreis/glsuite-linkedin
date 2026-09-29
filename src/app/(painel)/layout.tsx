import type { ReactNode } from "react";
import { Navegacao } from "@/components/navegacao";
import { exigirSessao } from "@/server/supabase/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const sessao = await exigirSessao();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-6">
        <p className="px-2 text-sm font-semibold">SDR · GuessLess</p>
        <Navegacao />
        <div className="mt-auto flex flex-col gap-2 px-2 text-xs text-neutral-500">
          <span className="truncate">{sessao.email}</span>
          <form action="/auth/sair" method="post">
            <button type="submit" className="text-neutral-700 underline-offset-2 hover:underline">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
