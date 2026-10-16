import { notFound } from "next/navigation";
import { paraCampoDeData } from "@/domain/lancamentos";
import { FormularioDoLancamento } from "../../formulario-do-lancamento";
import { lancamentoDaPagina } from "../dados";

/** Editar o lançamento (§4.21): o mesmo formulário do novo, para nome, produto e datas. */
export default async function EditarLancamentoPage({ params }: PageProps<"/launches/[id]/edit">) {
  const { id } = await params;
  const dados = await lancamentoDaPagina(id);
  if (!dados) notFound();
  const { lancamento } = dados;
  const { datas } = lancamento;
  return (
    <FormularioDoLancamento
      id={lancamento.id}
      inicial={{
        nome: lancamento.nome,
        produto: lancamento.produto ?? "",
        captacaoEm: paraCampoDeData(datas.captacaoEm),
        aulas: datas.aulas.map((aula) => ({ nome: aula.nome, quando: paraCampoDeData(aula.quando), link: aula.link ?? "" })),
        carrinhoAbreEm: paraCampoDeData(datas.carrinhoAbreEm),
        carrinhoFechaEm: paraCampoDeData(datas.carrinhoFechaEm),
      }}
    />
  );
}
