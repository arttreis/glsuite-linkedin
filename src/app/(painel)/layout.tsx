import type { ReactNode } from "react";
import { Estrutura } from "@/components/estrutura";
import { obterDb } from "@/server/db";
import { avaliarPrimeirosPassos } from "@/server/onboarding/primeiros-passos";
import { exigirOperador } from "@/server/supabase/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const operador = await exigirOperador();
  const { concluido } = await avaliarPrimeirosPassos(obterDb(), operador.id, new Date());

  return (
    <Estrutura
      operador={{
        nome: operador.nome,
        email: operador.email,
        papel: operador.papel,
        organizacao: operador.organizacaoNome,
        emPrimeirosPassos: !concluido,
      }}
    >
      {children}
    </Estrutura>
  );
}
