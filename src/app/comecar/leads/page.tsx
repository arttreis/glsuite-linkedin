import { abrirPasso } from "../portao";
import { PassoEmConstrucao } from "../pergunta";

export default async function Passo() {
  await abrirPasso("leads");
  return <PassoEmConstrucao passo="leads" />;
}
