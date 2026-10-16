import { redirect } from "next/navigation";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { abasDaOrganizacao } from "./lista-de-abas";

/** `/settings` abre a primeira aba que a organização tem (§4.14). */
export default async function ConfiguracoesPage() {
  const operador = await exigirOperadorNoApp();
  redirect(abasDaOrganizacao(operador.modulos)[0]!.href);
}
