import { abrirPasso } from "../portao";
import { PassoEmConstrucao } from "../pergunta";

export default async function Passo() {
  await abrirPasso("abordagem");
  return <PassoEmConstrucao passo="abordagem" />;
}
