import { Suspense } from "react";
import { Aviso } from "@/components/aviso";
import { RAMPA_PADRAO, TETO_SEMANAL_PADRAO } from "@/domain/rampa";
import { gerarAbordagem, obterAbordagem } from "@/server/abordagem/recomendada";
import { obterDb } from "@/server/db";
import type { Operador } from "@/server/db/operador";
import { obterEscritorDeFluxo } from "@/server/dependencias";
import { obterPrevia } from "@/server/previa/previa";
import { obterSdr } from "@/server/sdr/sdr";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { LinhaDoTempo } from "./linha-do-tempo";

// Escrever a abordagem é uma chamada da IA na abertura do passo.
export const maxDuration = 300;

function Escrevendo() {
  return (
    <div role="status" className="cartao mt-10 flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute size-10 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3.5 rounded-full bg-destaque" />
      </span>
      <p className="font-medium">Escrevendo o convite e as mensagens na voz do seu SDR...</p>
    </div>
  );
}

/** O que vai acontecer quando a pessoa permitir (§4.5), em poucas linhas. */
function OQueVaiAcontecer({ pessoas, chamarVoce }: { pessoas: number | null; chamarVoce: string[] }) {
  const [primeira] = RAMPA_PADRAO;
  const itens = [
    pessoas === null
      ? "A lista de pessoas sai pela sua conta do LinkedIn, com o perfil de lead que você escolheu."
      : `${pessoas} ${pessoas === 1 ? "pessoa marcada recebe" : "pessoas marcadas recebem"} o convite, pela sua conta do LinkedIn.`,
    `Até ${primeira!.convites_dia} convites por dia na primeira semana, subindo devagar até ${TETO_SEMANAL_PADRAO} por semana. É o ritmo que protege a sua conta.`,
    "Só em dias úteis, das 9h às 18h, com intervalo entre um convite e outro.",
    "Quem responde sai da sequência na hora, e o SDR responde sozinho, do jeito que você ajustou.",
    `O SDR para e chama você quando a pessoa pergunta preço, reclama${chamarVoce.length > 0 ? `, ou: ${chamarVoce.join("; ").toLowerCase()}` : ""}.`,
    "Você vê tudo nos Chats e pode pausar a qualquer momento.",
  ];
  return (
    <section className="cartao mt-10 p-6">
      <h2 className="text-lg font-medium tracking-tight">O que vai acontecer</h2>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm text-tinta-suave">
        {itens.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-destaque" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Garante a abordagem do público escolhido e entrega a linha do tempo. Roda dentro do Suspense. */
async function Abordagem({ operador }: { operador: Operador }) {
  const db = obterDb();
  let abordagem = await obterAbordagem(db, operador.organizacaoId);
  const previa = await obterPrevia(db, operador.organizacaoId);
  if (!abordagem || (previa?.publicoId && abordagem.publicoId !== previa.publicoId)) {
    const escritor = obterEscritorDeFluxo();
    if (!escritor) return <Aviso tom="erro" className="mt-10">Escrever a abordagem precisa da chave da Anthropic. Peça ao admin para configurar.</Aviso>;
    const gerada = await gerarAbordagem(
      { db, escritor, agora: new Date() },
      { organizacaoId: operador.organizacaoId, nome: operador.nome, operadorId: operador.id },
    );
    if (!gerada.ok) return <Aviso tom="erro" className="mt-10">{gerada.erro}</Aviso>;
    abordagem = gerada.abordagem;
  }
  const sdr = await obterSdr(db, operador.organizacaoId);
  const marcadas = previa?.status === "pronta" ? previa.pessoas.filter((pessoa) => pessoa.marcada) : null;

  return (
    <LinhaDoTempo
      inicial={abordagem}
      exemplos={(marcadas ?? []).map(({ providerId, nome, primeiroNome, empresa }) => ({ providerId, nome, primeiroNome, empresa }))}
      resumo={<OQueVaiAcontecer pessoas={marcadas?.length ?? null} chamarVoce={sdr?.sdr.quando_chamar_voce ?? []} />}
    />
  );
}

/** Passo 5 (§2.1, §4.5): como vai abordar, e a permissão. */
export default async function PassoAbordagem() {
  const { operador } = await abrirPasso("abordagem");
  return (
    <>
      <Pergunta passo="abordagem">
        O convite e as mensagens que saem até a pessoa responder, na voz do seu SDR. Edite o que quiser: nada sai antes
        de você permitir.
      </Pergunta>
      <Suspense fallback={<Escrevendo />}>
        <Abordagem operador={operador} />
      </Suspense>
    </>
  );
}
