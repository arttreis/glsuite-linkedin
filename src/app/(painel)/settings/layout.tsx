import type { ReactNode } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { AbasDasConfiguracoes } from "./abas";
import { abasDaOrganizacao } from "./lista-de-abas";

export default async function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const operador = await exigirOperadorNoApp();
  const descricao = operador.modulos.includes("linkedin")
    ? "Tudo o que o primeiro acesso definiu: a empresa, o SDR, as contas do LinkedIn e a equipe. E o plano da organização."
    : "A equipe e o plano da organização.";
  return (
    <>
      <Cabecalho titulo="Configurações" descricao={descricao} />
      <AbasDasConfiguracoes abas={abasDaOrganizacao(operador.modulos)} />
      {children}
    </>
  );
}
