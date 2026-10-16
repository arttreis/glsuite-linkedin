import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso } from "@/components/aviso";
import { CASOS_DE_TESTE } from "@/domain/passagem";
import { obterDb } from "@/server/db";
import type { Operador } from "@/server/db/operador";
import { obterModeloDeLinguagem } from "@/server/dependencias";
import { obterSdr } from "@/server/sdr/sdr";
import { comecarTeste, obterTeste } from "@/server/sdr/teste";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { ChatDoSdr } from "../../../../onboarding/sdr/chat";

// A primeira mensagem do teste é uma chamada da IA.
export const maxDuration = 300;

function Abrindo() {
  return (
    <div role="status" className="cartao flex min-h-[18rem] flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="relative flex size-8 items-center justify-center">
        <span className="absolute size-8 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3 rounded-full bg-destaque" />
      </span>
      <p className="text-sm text-tinta-suave">O SDR está abrindo a conversa...</p>
    </div>
  );
}

/** O teste salvo, ou um novo: o mesmo agente da produção, com você no papel de lead (§4.3). */
async function Chat({ operador }: { operador: Operador }) {
  const db = obterDb();
  const base = { organizacaoId: operador.organizacaoId, nome: operador.nome };
  if (!(await obterSdr(db, operador.organizacaoId))) {
    return <Aviso tom="atencao">Monte o SDR na aba SDR antes de testar.</Aviso>;
  }
  let teste = await obterTeste(db, base);
  if (!teste) {
    const modelo = obterModeloDeLinguagem();
    if (!modelo) return <Aviso tom="erro">O SDR precisa da chave da Anthropic para conversar. Peça ao admin.</Aviso>;
    const comecado = await comecarTeste({ db, modelo, agora: new Date() }, base);
    if (!comecado.ok) return <Aviso tom="erro">{comecado.erro}</Aviso>;
    teste = comecado.teste;
  }
  const casosDeTeste = CASOS_DE_TESTE.map((caso) => ({ rotulo: caso.rotulo, texto: caso.texto[teste.idioma] }));
  return <ChatDoSdr inicial={teste} nome={operador.nome} comSeguir={false} casosDeTeste={casosDeTeste} />;
}

/** Testar o SDR em Configurações (§4.12): o mesmo chat do primeiro acesso, sem o "seguir". */
export default async function TesteDoSdrPage() {
  const operador = await exigirOperadorComModulo("linkedin");
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/settings/sdr" className="flex w-fit items-center gap-1.5 text-[13px] text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-3.5" aria-hidden />
        Voltar ao SDR
      </Link>
      <p className="text-sm text-tinta-suave">
        Responda como um cliente responderia. Quando algo não soar certo, troque para &quot;Ajustar o SDR&quot; e diga o que mudar: vira uma versão
        nova, que você desfaz quando quiser. Para ver se ele passa a conversa para você na hora certa, use as mensagens prontas acima do campo.
      </p>
      <Suspense fallback={<Abrindo />}>
        <Chat operador={operador} />
      </Suspense>
    </div>
  );
}
