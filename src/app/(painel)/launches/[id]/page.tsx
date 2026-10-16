import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { encerraSozinhoEm, faseDoLancamento, quandoNoLancamento, type DatasDoLancamento, type FaseDoLancamento } from "@/domain/lancamentos";
import { lancamentoDaPagina } from "./dados";

type Trecho = { fase: Exclude<FaseDoLancamento, "sem_datas">; rotulo: string; desde: Date | null };

const ORDEM: Trecho["fase"][] = ["captacao", "aulas", "carrinho", "encerrado"];

/**
 * A régua das fases (§4.21): Captação · Aulas · Carrinho · Fim, com o "agora"
 * na fase atual. O que passou fica aceso; o que vem, apagado.
 */
function ReguaDasFases({ datas, fase }: { datas: DatasDoLancamento; fase: Trecho["fase"] }) {
  const trechos: Trecho[] = [
    { fase: "captacao", rotulo: "Captação", desde: datas.captacaoEm },
    { fase: "aulas", rotulo: "Aulas", desde: datas.aulas[0]?.quando ?? null },
    { fase: "carrinho", rotulo: "Carrinho", desde: datas.carrinhoAbreEm },
    { fase: "encerrado", rotulo: "Fim", desde: datas.carrinhoFechaEm },
  ];
  const atual = ORDEM.indexOf(fase);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Fases do lançamento">
      {trechos.map((trecho, indice) => {
        const agora = indice === atual;
        const passou = indice < atual;
        return (
          <li key={trecho.fase} aria-current={agora ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
            <span
              aria-hidden
              className={`h-2 rounded-full ${agora ? "bg-destaque shadow-[0_0_16px_var(--color-destaque)]" : passou ? "bg-destaque/40" : "bg-linha"}`}
            />
            <span className={`text-[13px] font-medium ${agora ? "text-tinta" : passou ? "text-tinta-suave" : "text-tinta-fraca"}`}>
              {trecho.rotulo}
              {agora && <span className="etiqueta etiqueta-ok ml-1.5 align-middle text-[11px]">agora</span>}
            </span>
            <span className="truncate text-xs tabular-nums text-tinta-fraca">{trecho.desde ? quandoNoLancamento(trecho.desde) : "sem data"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Hoje (§4.21): a tela do dia. Por ora, a régua das fases e as datas; o que precisa de você entra com os tickets seguintes. */
export default async function HojePage({ params, searchParams }: PageProps<"/launches/[id]">) {
  const { id } = await params;
  const { msg } = await searchParams;
  const dados = await lancamentoDaPagina(id);
  if (!dados) notFound();
  const { lancamento } = dados;
  const { datas } = lancamento;
  const agora = new Date();
  const fase = faseDoLancamento(datas, agora);
  const encerraEm = lancamento.status === "encerrado" ? null : encerraSozinhoEm(datas);

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}
      {fase === "sem_datas" ? (
        <div className="vazio">
          <p>Sem datas, o lançamento não tem fase. Ponha as datas em Editar.</p>
          <Link href={`/launches/${lancamento.id}/edit`} className="botao botao-primario">
            Editar
          </Link>
        </div>
      ) : (
        <>
          <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-regua">
            <h2 id="titulo-regua" className="text-[15px] font-semibold">
              Onde o lançamento está
            </h2>
            <ReguaDasFases datas={datas} fase={fase} />
          </section>

          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-datas">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titulo-datas" className="text-[15px] font-semibold">
                Datas
              </h2>
              <Link href={`/launches/${lancamento.id}/edit`} className="link text-sm">
                Editar
              </Link>
            </div>
            <dl className="flex flex-col divide-y divide-linha text-sm">
              {datas.captacaoEm && <LinhaDaData rotulo="Captação começa" em={datas.captacaoEm} agora={agora} />}
              {datas.aulas.map((aula, indice) => (
                <LinhaDaData key={`${indice}-${aula.nome}`} rotulo={`Aula: ${aula.nome}`} em={aula.quando} agora={agora} link={aula.link} />
              ))}
              {datas.carrinhoAbreEm && <LinhaDaData rotulo="Carrinho abre" em={datas.carrinhoAbreEm} agora={agora} />}
              {datas.carrinhoFechaEm && <LinhaDaData rotulo="Carrinho fecha" em={datas.carrinhoFechaEm} agora={agora} />}
            </dl>
            {encerraEm && (
              <p className="text-[13px] text-tinta-suave">Encerra sozinho em {quandoNoLancamento(encerraEm)}, 7 dias depois de o carrinho fechar.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function LinhaDaData({ rotulo, em, agora, link = null }: { rotulo: string; em: Date; agora: Date; link?: string | null }) {
  const passou = new Date(em).getTime() <= agora.getTime();
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 ${passou ? "text-tinta-suave" : ""}`}>
      <dt className="flex min-w-0 items-center gap-2">
        {rotulo}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[13px]">
            link
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </dt>
      <dd className="tabular-nums">{quandoNoLancamento(em)}</dd>
    </div>
  );
}
