"use server";

import { redirect } from "next/navigation";
import { urlPublicaDoApp } from "@/lib/env";
import { perfilDoPrimeiroAcesso } from "@/server/acesso/vinculo";
import { obterDb } from "@/server/db";
import { obterUnipileSeConfigurada, segredoDaUnipile } from "@/server/dependencias";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { gerarLinkDeConexao } from "@/server/perfis/conexao";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

/** "Vincular meu LinkedIn": o perfil da pessoa e o hosted auth da Unipile, que volta para o passo 6. */
export async function vincularLinkedin() {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const unipile = obterUnipileSeConfigurada();
  if (!unipile) redirect(`/onboarding/linkedin?msg=${encodeURIComponent("A conexão com o LinkedIn não está configurada. Peça ao admin.")}`);

  const db = obterDb();
  const analise = await dossieConfirmado(db, operador.organizacaoId);
  const agora = new Date();
  const { perfilId } = await perfilDoPrimeiroAcesso(db, {
    organizacaoId: operador.organizacaoId,
    operadorId: operador.id,
    nome: operador.nome,
    idioma: analise?.idioma ?? "pt",
    agora,
  });
  const link = await gerarLinkDeConexao(
    { db, unipile: unipile!, urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() },
    { perfilId, agora, voltarPara: "/onboarding/linkedin" },
  );
  redirect(link);
}
