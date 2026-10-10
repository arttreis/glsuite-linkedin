import { abrirPasso } from "../portao";
import { PassoEmConstrucao } from "../pergunta";

export default async function Passo() {
  await abrirPasso("site");
  return <PassoEmConstrucao passo="site" />;
}
