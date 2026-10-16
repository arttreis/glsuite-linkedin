import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { faseDoLancamento, ROTULO_DA_FASE } from "@/domain/lancamentos";
import { MODULOS_DOS_LANCAMENTOS } from "@/domain/modulos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { listarLancamentos, type LancamentoNaLista } from "@/server/lancamentos/lancamentos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { EtiquetasDoLancamento, textoDoProximo } from "./situacao";

const FUSO = "America/Sao_Paulo";
const data = (valor: Date) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", year: "numeric" });

/** Um lançamento da lista: nome, produto, a fase em texto e a próxima data. */
function LinhaDoLancamento({ lancamento, agora }: { lancamento: LancamentoNaLista; agora: Date }) {
  const fase = faseDoLancamento(lancamento.datas, agora);
  const proximo = lancamento.status === "encerrado" ? null : textoDoProximo(lancamento.datas, agora);
  return (
    <li className="cartao flex flex-wrap items-start justify-between gap-3 p-5">
      <div className="min-w-0 flex-1 basis-60">
        <Link href={`/launches/${lancamento.id}`} className="link text-[15px] font-semibold">
          {lancamento.nome}
        </Link>
        <p className="mt-0.5 text-[13px] text-tinta-suave">
          {[lancamento.produto, lancamento.status === "encerrado" && lancamento.encerradoEm ? `encerrado em ${data(lancamento.encerradoEm)}` : ROTULO_DA_FASE[fase]]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {proximo && <p className="mt-1 text-[13px] tabular-nums">{proximo}</p>}
      </div>
      <EtiquetasDoLancamento status={lancamento.status} pausado={lancamento.pausadoEm !== null} />
    </li>
  );
}

function Secao({ titulo, lancamentos, agora }: { titulo: string; lancamentos: LancamentoNaLista[]; agora: Date }) {
  const id = `titulo-${titulo.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h2 id={id} className="text-[15px] font-semibold">
        {titulo}
      </h2>
      <ul className="flex flex-col gap-3">
        {lancamentos.map((lancamento) => (
          <LinhaDoLancamento key={lancamento.id} lancamento={lancamento} agora={agora} />
        ))}
      </ul>
    </section>
  );
}

/** Lançamentos (§4.21): no ar, montando e os encerrados, recolhidos. */
export default async function LancamentosPage({ searchParams }: PageProps<"/launches">) {
  const operador = await exigirOperadorComModulo(MODULOS_DOS_LANCAMENTOS);
  const { msg } = await searchParams;
  const agora = new Date();
  const lancamentos = await comOperador(obterDb(), operador.id, (tx) => listarLancamentos(tx, operador.organizacaoId));
  const noAr = lancamentos.filter((l) => l.status === "no_ar");
  const montando = lancamentos.filter((l) => l.status === "montando");
  const encerrados = lancamentos.filter((l) => l.status === "encerrado");

  return (
    <>
      <Cabecalho titulo="Lançamentos" descricao="Cada lançamento junta os grupos, o link que enche, a agenda e o que o SDR sabe.">
        <Link href="/launches/new" className="botao botao-primario">
          <Plus aria-hidden />
          Novo lançamento
        </Link>
      </Cabecalho>
      <div className="flex max-w-5xl flex-col gap-8">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {lancamentos.length === 0 && <p className="vazio">Nenhum lançamento ainda.</p>}
        {noAr.length > 0 && <Secao titulo="No ar" lancamentos={noAr} agora={agora} />}
        {montando.length > 0 && <Secao titulo="Montando" lancamentos={montando} agora={agora} />}
        {encerrados.length > 0 && (
          <details className="group flex flex-col gap-3">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
              Encerrados ({encerrados.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {encerrados.map((lancamento) => (
                <LinhaDoLancamento key={lancamento.id} lancamento={lancamento} agora={agora} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
