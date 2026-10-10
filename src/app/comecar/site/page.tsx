import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterLeitorDeSite } from "@/server/dependencias";
import { ofertaDaOrganizacao } from "@/server/oferta/oferta";
import { analisarSiteNoPrimeiroAcesso } from "../acoes";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";

// A leitura do site roda depois da resposta (after) e leva até 2 minutos.
export const maxDuration = 300;

/** Passo 1 (§2.1): uma pergunta, um campo, um botão. */
export default async function PassoSite({ searchParams }: PageProps<"/comecar/site">) {
  const { operador } = await abrirPasso("site");
  const { msg } = await searchParams;
  const oferta = await comOperador(obterDb(), operador.id, (tx) =>
    ofertaDaOrganizacao(tx, operador.organizacaoId, new Date()),
  );
  if (oferta.leitura.status === "lendo") redirect("/comecar/analise");
  const semChave = obterLeitorDeSite() === null;

  return (
    <>
      <Pergunta passo="site">
        O Kakou lê o seu site e entende o que você vende, para quem e por que escolhem você. É daí que nasce o seu SDR.
      </Pergunta>

      <form action={analisarSiteNoPrimeiroAcesso} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="url">
          Endereço do site
        </label>
        <input
          id="url"
          name="url"
          defaultValue={oferta.url ?? ""}
          required
          autoFocus
          inputMode="url"
          autoComplete="url"
          placeholder="suaempresa.com.br"
          className="campo h-14 flex-1 px-5 text-lg"
        />
        <button type="submit" className="botao botao-primario h-14 px-6 text-base" disabled={semChave}>
          Analisar
          <ArrowRight aria-hidden />
        </button>
      </form>

      {typeof msg === "string" && (
        <Aviso tom="erro" className="mt-5">
          {msg}
        </Aviso>
      )}
      {semChave && (
        <Aviso tom="atencao" className="mt-5">
          A leitura do site precisa da chave da Anthropic. Peça ao admin para configurar.
        </Aviso>
      )}
      {oferta.dossie && (
        <p className="mt-5 text-sm text-tinta-fraca">
          Ler de novo troca a análise que está na tela por uma nova. Nada muda no que você já confirmou até você confirmar
          de novo.{" "}
          <Link href="/comecar/analise" className="link">
            Voltar para a análise
          </Link>
        </p>
      )}
      <p className="mt-10 text-xs text-tinta-fraca">
        Só lemos páginas públicas do seu domínio: a inicial e as de sobre, produtos, preços e cases. Leva de 30 segundos a 2
        minutos.
      </p>
    </>
  );
}
