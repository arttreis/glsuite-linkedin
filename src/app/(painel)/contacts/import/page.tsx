import { Cabecalho } from "@/components/cabecalho";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { Importacao } from "./importacao";

/** Importar contatos de uma planilha (§4.15). */
export default async function ImportarContatosPage() {
  const operador = await exigirOperadorNoApp();
  return (
    <>
      <Cabecalho
        titulo="Importar contatos"
        descricao="Traga a sua base: clientes, quem foi a um evento, quem pediu para receber novidades. Telefone igual a um contato que já existe completa o que estava vazio e soma as tags, sem duplicar."
        voltar={{ href: "/contacts", rotulo: "Contatos" }}
      />
      <div className="max-w-4xl">
        <Importacao organizacao={operador.organizacaoNome} />
      </div>
    </>
  );
}
