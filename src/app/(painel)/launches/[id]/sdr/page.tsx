import { notFound } from "next/navigation";
import { lancamentoDaPagina } from "../dados";
import { FormularioDoSdr } from "./formulario-do-sdr";

/**
 * A aba SDR do lançamento (§4.21 e §4.26): o que o SDR sabe deste lançamento.
 * Aqui só guarda; o SDR passa a usar no SDR-88.
 */
export default async function SdrDoLancamentoPage({ params }: PageProps<"/launches/[id]/sdr">) {
  const { id } = await params;
  const dados = await lancamentoDaPagina(id);
  if (!dados) notFound();
  const { lancamento } = dados;
  return (
    <FormularioDoSdr
      id={lancamento.id}
      inicial={{
        preco: lancamento.preco ?? "",
        perguntas: lancamento.perguntas,
        sdrSabe: lancamento.sdrSabe ?? "",
        linkDoCarrinho: lancamento.linkDoCarrinho ?? "",
      }}
    />
  );
}
