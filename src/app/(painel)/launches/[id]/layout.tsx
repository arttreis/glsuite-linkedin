import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/cabecalho";
import { datasComRotulo, faseDoLancamento, problemaNasDatas, quandoNoLancamento, ROTULO_DA_FASE } from "@/domain/lancamentos";
import type { Lancamento } from "@/server/lancamentos/lancamentos";
import { EtiquetasDoLancamento } from "../situacao";
import { AbasDoLancamento } from "./abas";
import { ControlesDoLancamento } from "./controles";
import { lancamentoDaPagina } from "./dados";
import { abasDoLancamento } from "./lista-de-abas";

const FUSO = "America/Sao_Paulo";
const data = (valor: Date) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", year: "numeric" });
const por = (nome: string | null) => (nome ? ` por ${nome}` : "");

/** Quem pôs no ar, pausou ou encerrou, e quando (§4.21). */
function linhaDoEstado(l: Lancamento): string | null {
  if (l.status === "encerrado" && l.encerradoEm) {
    return l.encerradoPor
      ? `Encerrado em ${data(l.encerradoEm)}${por(l.encerradoPor)}.`
      : `Encerrou sozinho em ${data(l.encerradoEm)}, 7 dias depois de o carrinho fechar.`;
  }
  if (l.status === "no_ar" && l.pausadoEm) return `Pausado em ${data(l.pausadoEm)}${por(l.pausadoPor)}. Retomar é com você.`;
  if (l.status === "no_ar" && l.noArEm) return `No ar desde ${data(l.noArEm)}${l.noArPor ? `, por ${l.noArPor}` : ""}.`;
  return null;
}

/** O lançamento (§4.21): o nome, o estado, a fase, os botões de estado e as abas. */
export default async function LancamentoLayout({ children, params }: LayoutProps<"/launches/[id]">) {
  const { id } = await params;
  const dados = await lancamentoDaPagina(id);
  if (!dados) notFound();
  const { operador, lancamento } = dados;
  const agora = new Date();
  const fase = faseDoLancamento(lancamento.datas, agora);
  const linha = linhaDoEstado(lancamento);

  return (
    <>
      <Cabecalho
        titulo={lancamento.nome}
        descricao={[lancamento.produto, fase === "sem_datas" ? "Sem datas" : `Fase: ${ROTULO_DA_FASE[fase]}`].filter(Boolean).join(" · ")}
        voltar={{ href: "/launches", rotulo: "Lançamentos" }}
      >
        <EtiquetasDoLancamento status={lancamento.status} pausado={lancamento.pausadoEm !== null} />
        <Link href={`/launches/${lancamento.id}/edit`} className="botao botao-pequeno">
          <Pencil aria-hidden />
          Editar
        </Link>
      </Cabecalho>
      <div className="mb-6 flex max-w-5xl flex-col gap-3">
        {linha && <p className="text-[13px] text-tinta-suave">{linha}</p>}
        <ControlesDoLancamento
          id={lancamento.id}
          nome={lancamento.nome}
          status={lancamento.status}
          pausado={lancamento.pausadoEm !== null}
          conferencia={{
            fase: ROTULO_DA_FASE[fase],
            datas: datasComRotulo(lancamento.datas).map((d) => ({ rotulo: d.rotulo, quando: quandoNoLancamento(d.em) })),
            problema: problemaNasDatas(lancamento.datas),
          }}
        />
      </div>
      <AbasDoLancamento abas={abasDoLancamento(lancamento.id, operador.modulos)} />
      {children}
    </>
  );
}
