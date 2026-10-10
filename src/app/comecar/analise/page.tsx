import { abrirPasso } from "../portao";
import { PassoEmConstrucao } from "../pergunta";

export default async function Passo() {
  await abrirPasso("analise");
  return <PassoEmConstrucao passo="analise" />;
}
