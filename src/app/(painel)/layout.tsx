import type { ReactNode } from "react";
import { Estrutura } from "@/components/estrutura";
import { linkedinNoPrimeiroAcesso } from "@/domain/modulos";
import { ehDaPlataforma } from "@/server/plataforma";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const operador = await exigirOperadorNoApp();

  return (
    <Estrutura
      operador={{
        nome: operador.nome,
        email: operador.email,
        organizacao: operador.organizacaoNome,
        modulos: operador.modulos,
        linkedinNoPrimeiroAcesso: linkedinNoPrimeiroAcesso(operador.modulos, operador.primeiroAcessoConcluido),
        plataforma: await ehDaPlataforma(),
      }}
    >
      {children}
    </Estrutura>
  );
}
