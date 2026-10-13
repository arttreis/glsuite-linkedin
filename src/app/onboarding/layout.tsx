import { LogOut } from "lucide-react";
import { Marca } from "@/components/marca";
import { exigirOperadorNoPrimeiroAcesso } from "./portao";
import { Trilha } from "./trilha";

/**
 * Primeiro acesso (§2.1): tela cheia, sem menu, com os passos no topo. Quem
 * já terminou vai para o app. A coluna é estreita, uma pergunta por tela; a
 * área de trabalho da abordagem (`data-largura="cheia"`) usa a largura toda.
 */
export default async function PrimeiroAcessoLayout({ children }: LayoutProps<"/onboarding">) {
  const { estado } = await exigirOperadorNoPrimeiroAcesso();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-5 px-5 pt-5 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <Marca />
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <Trilha feitos={[...estado.feitos]} atual={estado.atual} />
        </div>
        <form action="/auth/logout" method="post" className="justify-self-end lg:col-start-3">
          <button type="submit" className="botao botao-pequeno">
            <LogOut aria-hidden />
            Sair
          </button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-20 pt-12 sm:pt-20 has-[[data-largura=cheia]]:max-w-[90rem] has-[[data-largura=cheia]]:pt-8 sm:has-[[data-largura=cheia]]:px-8 sm:has-[[data-largura=cheia]]:pt-12">{children}</main>
    </div>
  );
}
