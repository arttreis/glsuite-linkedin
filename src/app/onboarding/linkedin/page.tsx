import { Check, Link2, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { concluirPrimeiroAcesso } from "@/server/acesso/vinculo";
import { obterDb } from "@/server/db";
import type { Operador } from "@/server/db/operador";
import { obterUnipileSeConfigurada } from "@/server/dependencias";
import { desfechoDaConexao } from "@/server/perfis/conexao";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { vincularLinkedin } from "./acoes";

// Concluir importa a prévia e ativa a conta e a campanha na abertura do passo.
export const maxDuration = 300;

const FAZ = [
  "Envia os convites e as mensagens que você permitiu, no ritmo que protege a sua conta.",
  "Responde quem responder, do jeito do seu SDR, e chama você quando precisa.",
  "Mostra as suas conversas do LinkedIn no Chats, para você acompanhar e responder.",
];

const NAO_FAZ = [
  "Não publica nada nem muda o seu perfil.",
  "Não fala com ninguém fora da abordagem que você permitiu.",
  "Não guarda a sua senha: a conexão é feita pela Unipile, um serviço de conexão com o LinkedIn.",
];

function Preparando({ texto }: { texto: string }) {
  return (
    <div role="status" className="cartao mt-10 flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute size-10 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3.5 rounded-full bg-destaque" />
      </span>
      <p className="font-medium">{texto}</p>
    </div>
  );
}

/** Conta conectada: leva o primeiro acesso para ela e entra no app. Roda dentro do Suspense. */
async function Concluir({ operador }: { operador: Operador }) {
  const resultado = await concluirPrimeiroAcesso(
    { db: obterDb(), unipile: obterUnipileSeConfigurada(), agora: new Date() },
    { organizacaoId: operador.organizacaoId },
  );
  if (resultado.ok) redirect("/");
  if (resultado.esperar) {
    return (
      <>
        <Preparando texto={resultado.erro} />
        <AtualizarSozinho segundos={3} />
      </>
    );
  }
  return (
    <div className="mt-10">
      <Aviso tom="erro">
        <p className="font-medium">Não deu para começar ainda: {resultado.erro}</p>
        <p className="mt-1">Ajuste na abordagem, permita de novo e volte aqui. A sua conta continua vinculada.</p>
      </Aviso>
      <Link href="/onboarding/approach" className="botao mt-4">
        Voltar para a abordagem
      </Link>
    </div>
  );
}

/** Passo 6 (§2.1, §4.6): vincular a conta do LinkedIn e começar. */
export default async function PassoLinkedin({ searchParams }: PageProps<"/onboarding/linkedin">) {
  const { operador } = await abrirPasso("linkedin");
  const { conexao, msg, perfil: perfilDaVolta, desde } = await searchParams;
  const [perfil] = await obterDb().query<{ conectado: boolean }>(
    `select unipile_account_id is not null as conectado from public.perfis
      where organizacao_id = $1::uuid and operador_id = $2::uuid and not casa
      order by criado_em limit 1`,
    [operador.organizacaoId, operador.id],
  );

  if (perfil?.conectado) {
    return (
      <>
        <Pergunta passo="linkedin" titulo="LinkedIn vinculado." />
        <Suspense fallback={<Preparando texto="Preparando a sua campanha: as pessoas que você marcou, a abordagem e o ritmo..." />}>
          <Concluir operador={operador} />
        </Suspense>
      </>
    );
  }

  const semUnipile = !obterUnipileSeConfigurada();
  // A conta de alguém que já está noutra organização é recusada no callback (§4.30): para de esperar e diz por quê.
  const idDaVolta = z.uuid().safeParse(perfilDaVolta);
  const recusada =
    conexao === "ok" &&
    idDaVolta.success &&
    !Number.isNaN(Number(desde)) &&
    (await desfechoDaConexao(obterDb(), { perfilId: idDaVolta.data, desde: new Date(Number(desde)) })) === "outra_organizacao";
  return (
    <>
      <Pergunta passo="linkedin">
        O SDR conversa em seu nome, pela sua própria conta. Por isso o último passo é vincular o seu LinkedIn.
      </Pergunta>

      {recusada && (
        <Aviso tom="erro" className="mt-6">
          Essa conta do LinkedIn já está conectada em outra organização do Kakou. Fale com a GuessLess.
        </Aviso>
      )}
      {conexao === "ok" && !recusada && (
        <>
          <Preparando texto="Conectando a sua conta..." />
          <AtualizarSozinho segundos={3} />
        </>
      )}
      {conexao === "falhou" && (
        <Aviso tom="erro" className="mt-6">
          A conexão com o LinkedIn não foi concluída. Tente de novo; se o LinkedIn pedir um código, tenha o celular por perto.
        </Aviso>
      )}
      {typeof msg === "string" && (
        <Aviso tom="erro" className="mt-6">
          {msg}
        </Aviso>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="cartao p-6">
          <h2 className="font-medium">O que o Kakou faz com a sua conta</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-tinta-suave">
            {FAZ.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-destaque" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="cartao p-6">
          <h2 className="font-medium">O que ele não faz</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-tinta-suave">
            {NAO_FAZ.map((item) => (
              <li key={item} className="flex gap-2.5">
                <X className="mt-0.5 size-4 shrink-0 text-tinta-fraca" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <form action={vincularLinkedin} className="mt-8">
        <button type="submit" className="botao botao-primario h-14 px-6 text-base" disabled={semUnipile}>
          <Link2 aria-hidden />
          Vincular meu LinkedIn
        </button>
      </form>
      {semUnipile && (
        <Aviso tom="atencao" className="mt-5">
          A conexão com o LinkedIn não está configurada neste ambiente. Peça ao admin.
        </Aviso>
      )}
    </>
  );
}
