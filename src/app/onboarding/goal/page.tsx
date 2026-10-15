import { redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { respostasIniciais } from "@/domain/objetivo";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterResumidorDeObjetivo } from "@/server/dependencias";
import { objetivoDaOrganizacao } from "@/server/objetivo/objetivo";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { FormularioDoObjetivo } from "./formulario-do-objetivo";

/**
 * Passo 3 (§2.1, §4.2.1): o que vender e o que o SDR faz, com as opções da
 * análise confirmada. Volta com as respostas e o resumo de onde a pessoa
 * parou.
 */
export default async function PassoObjetivo() {
  const { operador } = await abrirPasso("objetivo");
  const { analise, objetivo } = await comOperador(obterDb(), operador.id, async (tx) => ({
    analise: await dossieConfirmado(tx, operador.organizacaoId),
    objetivo: await objetivoDaOrganizacao(tx, operador.organizacaoId),
  }));
  if (!analise) redirect("/onboarding/analysis");
  const inicial = objetivo.respostas ?? objetivo.confirmado?.objetivo ?? respostasIniciais(analise, operador.nome);

  return (
    <>
      <Pergunta passo="objetivo">
        Quatro perguntas antes de montar o SDR. As opções vêm da análise do seu site; no fim, você confere o resumo do que
        ele vai fazer.
      </Pergunta>
      {obterResumidorDeObjetivo() === null && (
        <Aviso tom="atencao" className="mt-6">
          O resumo precisa da chave da Anthropic. Peça ao admin para configurar.
        </Aviso>
      )}
      <FormularioDoObjetivo produtos={analise.produtos} inicial={inicial} resumoInicial={objetivo.resumo} />
    </>
  );
}
