import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso } from "@/components/aviso";
import type { Sdr } from "@/domain/sdr";
import { obterDb } from "@/server/db";
import type { Operador } from "@/server/db/operador";
import { obterGeradorDeSdr, obterModeloDeLinguagem } from "@/server/dependencias";
import { garantirSdr } from "@/server/sdr/sdr";
import { comecarTeste, obterTeste } from "@/server/sdr/teste";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { ChatDoSdr } from "./chat";

// Montar o SDR e a primeira mensagem são duas chamadas da IA na abertura do passo.
export const maxDuration = 300;

function Montando() {
  return (
    <div role="status" className="cartao mt-10 flex min-h-[22rem] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute size-10 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3.5 rounded-full bg-destaque" />
      </span>
      <div>
        <p className="font-medium">Montando o seu SDR a partir da análise...</p>
        <p className="mt-1 text-sm text-tinta-suave">Leva uns 20 segundos. Depois ele manda a primeira mensagem.</p>
      </div>
    </div>
  );
}

function Falhou({ erro }: { erro: string }) {
  return (
    <div className="mt-10">
      <Aviso tom="erro">{erro}</Aviso>
      <Link href="/onboarding/sdr" className="botao mt-4">
        <RotateCcw aria-hidden />
        Tentar de novo
      </Link>
    </div>
  );
}

/** O SDR inteiro, para quem quer ler o que o chat está seguindo. */
function SdrCompleto({ sdr }: { sdr: Sdr }) {
  const lista = (itens: string[]) => (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <details className="mt-8 text-sm">
      <summary className="text-tinta-suave">Ver o SDR completo</summary>
      <dl className="mt-3 grid gap-4 text-tinta-suave">
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Objetivo</dt>
          <dd className="mt-1 text-tinta">{sdr.objetivo}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Voz</dt>
          <dd className="mt-1">{sdr.voz}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Abertura</dt>
          <dd className="mt-1">{sdr.abertura}</dd>
        </div>
        {sdr.qualificacao.length > 0 && (
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Qualificação</dt>
            <dd>{lista(sdr.qualificacao)}</dd>
          </div>
        )}
        {sdr.objecoes.length > 0 && (
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Objeções</dt>
            <dd>{lista(sdr.objecoes.map((o) => `“${o.objecao}”: ${o.resposta}`))}</dd>
          </div>
        )}
        {sdr.regras.length > 0 && (
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Regras</dt>
            <dd>{lista(sdr.regras)}</dd>
          </div>
        )}
        {sdr.quando_chamar_voce.length > 0 && (
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Quando chamar você</dt>
            <dd>{lista(sdr.quando_chamar_voce)}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}

/** Garante o SDR e o começo da conversa, e entrega o chat. Roda dentro do Suspense. */
async function Chat({ operador }: { operador: Operador }) {
  const db = obterDb();
  const base = { organizacaoId: operador.organizacaoId, nome: operador.nome };
  const sdr = await garantirSdr({ db, gerador: obterGeradorDeSdr() }, { ...base, operadorId: operador.id, agora: new Date() });
  if (!sdr.ok) return <Falhou erro={sdr.erro} />;

  let teste = await obterTeste(db, base);
  if (!teste) {
    const modelo = obterModeloDeLinguagem();
    if (!modelo) return <Falhou erro="O SDR precisa da chave da Anthropic para conversar. Peça ao admin para configurar." />;
    const comecado = await comecarTeste({ db, modelo, agora: new Date() }, base);
    if (!comecado.ok) return <Falhou erro={comecado.erro} />;
    teste = comecado.teste;
  }
  return (
    <>
      <ChatDoSdr inicial={teste} nome={operador.nome} />
      <SdrCompleto sdr={sdr.sdr.sdr} />
    </>
  );
}

/** Passo 3 (§2.1, §4.3): o chat em que a pessoa é o lead e refina o SDR. */
export default async function PassoSdr() {
  const { operador } = await abrirPasso("sdr");
  return (
    <>
      <Pergunta passo="sdr">
        Ele fala do jeito que vai falar com os seus leads. Responda como um cliente responderia; quando algo não soar
        certo, troque para &quot;Ajustar o SDR&quot; e diga o que mudar.
      </Pergunta>
      <Suspense fallback={<Montando />}>
        <Chat operador={operador} />
      </Suspense>
    </>
  );
}
