import { Cabecalho } from "@/components/cabecalho";
import { MODULOS_DOS_LANCAMENTOS } from "@/domain/modulos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { FormularioDoLancamento } from "../formulario-do-lancamento";

/** Novo lançamento (§4.21): nome, produto e as datas. Nasce montando, com a tag do nome. */
export default async function NovoLancamentoPage() {
  await exigirOperadorComModulo(MODULOS_DOS_LANCAMENTOS);
  return (
    <>
      <Cabecalho
        titulo="Novo lançamento"
        descricao="O nome, o produto e as datas. O lançamento nasce montando: ninguém entra até você pôr no ar. Os grupos, a agenda e o que o SDR sabe vêm depois, dentro dele."
        voltar={{ href: "/launches", rotulo: "Lançamentos" }}
      />
      <FormularioDoLancamento id={null} />
    </>
  );
}
