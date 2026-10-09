import type { ReactNode } from "react";
import { Estrutura } from "@/components/estrutura";
import { exigirOperador } from "@/server/supabase/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const operador = await exigirOperador();

  return <Estrutura operador={{ nome: operador.nome, email: operador.email, papel: operador.papel }}>{children}</Estrutura>;
}
