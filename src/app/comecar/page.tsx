import { redirect } from "next/navigation";
import { exigirOperadorNoPrimeiroAcesso } from "./portao";

/** Volta para o passo em que a organização parou. */
export default async function ComecarPage() {
  const { estado } = await exigirOperadorNoPrimeiroAcesso();
  redirect(`/comecar/${estado.atual}`);
}
