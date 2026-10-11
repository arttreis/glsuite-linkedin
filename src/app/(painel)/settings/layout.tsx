import type { ReactNode } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { AbasDasConfiguracoes } from "./abas";

export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Cabecalho titulo="Configurações" descricao="Tudo o que o primeiro acesso definiu: a empresa, o SDR, as contas do LinkedIn e a equipe." />
      <AbasDasConfiguracoes />
      {children}
    </>
  );
}
