import { situacaoDosConcorrentes } from "@/server/concorrentes/concorrentes";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { EditorDeConcorrentes } from "./editor-de-concorrentes";

// "Analisar" lê o site do concorrente dentro da action: até uns 2 minutos.
export const maxDuration = 300;

/** Passo 3 (§2.1, §4.2): contra quem a pessoa disputa o cliente, para o SDR saber responder "já uso X". */
export default async function PassoConcorrentes() {
  const { operador } = await abrirPasso("concorrentes");
  const situacao = await comOperador(obterDb(), operador.id, (tx) => situacaoDosConcorrentes(tx, operador.organizacaoId));

  return (
    <>
      <Pergunta passo="concorrentes">
        Com quem o seu cliente compara você antes de comprar. O SDR usa esta lista para responder quem diz &quot;já uso
        outro&quot;, sem falar mal de ninguém.
      </Pergunta>
      <EditorDeConcorrentes
        inicial={situacao.lista}
        analisesIniciais={situacao.analises}
        restantesIniciais={situacao.restantes}
        leituraLigada={situacao.leituraLigada}
        daAnalise={situacao.daAnalise}
      />
    </>
  );
}
