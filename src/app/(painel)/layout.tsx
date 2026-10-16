import type { ReactNode } from "react";
import { Estrutura } from "@/components/estrutura";
import { linkedinNoPrimeiroAcesso } from "@/domain/modulos";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { ehDaPlataforma } from "@/server/plataforma";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const operador = await exigirOperadorNoApp();
  // exigirOperadorNoApp já mandou para /no-brand quem não tem marca.
  const marca = operador.marcas.find((m) => m.id === operador.marcaId) ?? operador.marcas[0]!;
  const { ativo: trocaDeMarca } = await lerConfiguracao(obterDb(), "marcas");

  return (
    <Estrutura
      operador={{
        nome: operador.nome,
        email: operador.email,
        organizacao: operador.organizacaoNome,
        marca,
        marcas: operador.marcas,
        trocaDeMarca,
        modulos: operador.modulos,
        linkedinNoPrimeiroAcesso: linkedinNoPrimeiroAcesso(operador.modulos, operador.primeiroAcessoConcluido),
        plataforma: await ehDaPlataforma(),
      }}
    >
      {children}
    </Estrutura>
  );
}
