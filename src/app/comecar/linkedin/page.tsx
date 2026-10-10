import { abrirPasso } from "../portao";
import { PassoEmConstrucao } from "../pergunta";

export default async function Passo() {
  await abrirPasso("linkedin");
  return <PassoEmConstrucao passo="linkedin" />;
}
