import type { ReactNode } from "react";
import { Estrutura } from "@/components/estrutura";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const operador = await exigirOperadorNoApp();

  return (
    <Estrutura
      operador={{
        nome: operador.nome,
        email: operador.email,
        organizacao: operador.organizacaoNome,
      }}
    >
      {children}
    </Estrutura>
  );
}
