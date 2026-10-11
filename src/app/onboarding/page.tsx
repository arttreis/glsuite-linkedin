import { redirect } from "next/navigation";
import { rotaDoPasso } from "@/domain/primeiro-acesso";
import { exigirOperadorNoPrimeiroAcesso } from "./portao";

/** Volta para o passo em que a organização parou. */
export default async function PrimeiroAcessoPage() {
  const { estado } = await exigirOperadorNoPrimeiroAcesso();
  redirect(rotaDoPasso(estado.atual));
}
