import { ArrowRightLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { destinosPermitidos, ROTULO_DO_DESTINO } from "@/domain/pipeline";
import { haQuantoTempo } from "@/lib/tempo";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { filtrosDoPipeline, quadroDoPipeline, type CartaoDoPipeline, type ColunaComCartoes } from "@/server/pipeline/pipeline";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { moverNoPipeline } from "./acoes";
import { FiltrosDoPipeline } from "./filtros";

const uuid = (valor: unknown) =>
  typeof valor === "string" && /^[0-9a-f-]{36}$/i.test(valor) ? valor : null;

/** Um lead: abre o chat; à mão, só os movimentos que valem para a etapa dele. */
function Cartao({ cartao, agora, voltar, variasContas }: { cartao: CartaoDoPipeline; agora: Date; voltar: string; variasContas: boolean }) {
  const destinos = destinosPermitidos(cartao.estado);
  return (
    <li className="rounded-xl border border-linha bg-superficie-alta p-3 transition-colors hover:border-linha-forte">
      <Link href={`/chats/${cartao.id}`} className="group block">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-medium group-hover:underline group-hover:underline-offset-2">{cartao.nome}</span>
          {cartao.nota !== null && (
            <span
              className={`shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${cartao.nota >= 70 ? "bg-destaque/15 text-destaque" : "bg-white/5 text-tinta-suave"}`}
              title="Nota de aderência"
            >
              {cartao.nota}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-tinta-suave">{[cartao.cargo, cartao.empresa].filter(Boolean).join(" · ")}</span>
        <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-tinta-fraca">
          <span>{haQuantoTempo(cartao.ultimaAtividade, agora)}</span>
          {variasContas && <span className="truncate">{cartao.conta}</span>}
        </span>
      </Link>
      {destinos.length > 0 && (
        <details className="mt-2 border-t border-linha pt-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-tinta-suave hover:text-tinta">
            <ArrowRightLeft className="size-3" aria-hidden />
            Mover
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {destinos.map((destino) => (
              <form key={destino} action={moverNoPipeline} className="flex flex-col gap-1.5">
                <input type="hidden" name="leadId" value={cartao.id} />
                <input type="hidden" name="para" value={destino} />
                <input type="hidden" name="voltar" value={voltar} />
                {destino === "reuniao_marcada" && (
                  <input type="datetime-local" name="reuniaoEm" required aria-label="Data da reunião" className="campo campo-pequeno" />
                )}
                <button type="submit" className="botao botao-pequeno w-full justify-start">
                  {ROTULO_DO_DESTINO[destino]}
                </button>
              </form>
            ))}
          </div>
        </details>
      )}
    </li>
  );
}

function Coluna({ coluna, children }: { coluna: ColunaComCartoes; children: ReactNode }) {
  return (
    <section className="flex w-[17rem] shrink-0 snap-start flex-col rounded-2xl border border-linha bg-superficie/60 p-2.5" aria-label={coluna.rotulo}>
      <h2 className="flex items-baseline justify-between px-1.5 pb-2.5 pt-1 text-[13px] font-semibold">
        {coluna.rotulo}
        <span className="text-xs font-normal tabular-nums text-tinta-fraca">{coluna.total}</span>
      </h2>
      {children}
    </section>
  );
}

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const operador = await exigirOperadorNoApp();
  const { campaign, account, msg } = await searchParams;
  const campanhaId = uuid(campaign);
  const perfilId = uuid(account);
  const { colunas, filtros } = await comOperador(obterDb(), operador.id, async (tx) => ({
    colunas: await quadroDoPipeline(tx, { campanhaId, perfilId }),
    filtros: await filtrosDoPipeline(tx),
  }));
  const agora = new Date();
  const busca = new URLSearchParams();
  if (campanhaId) busca.set("campaign", campanhaId);
  if (perfilId) busca.set("account", perfilId);
  const voltar = busca.size > 0 ? `/pipeline?${busca.toString()}` : "/pipeline";
  const variasContas = filtros.contas.length > 1;
  const abertas = colunas.filter((coluna) => coluna.id !== "encerrado");
  const encerrado = colunas.find((coluna) => coluna.id === "encerrado")!;

  const cartoes = (coluna: ColunaComCartoes) =>
    coluna.cartoes.length === 0 ? (
      <p className="px-1.5 pb-2 text-xs text-tinta-fraca">Ninguém aqui.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {coluna.cartoes.map((cartao) => (
          <Cartao key={cartao.id} cartao={cartao} agora={agora} voltar={voltar} variasContas={variasContas} />
        ))}
        {coluna.total > coluna.cartoes.length && (
          <li className="px-1.5 py-1 text-xs text-tinta-fraca">e mais {coluna.total - coluna.cartoes.length}</li>
        )}
      </ul>
    );

  return (
    <>
      <Cabecalho
        titulo="Pipeline"
        descricao="Do convite à reunião. O Kakou move os cards sozinho; à mão, você move para Qualificado, Reunião marcada ou Encerrado."
      >
        <FiltrosDoPipeline campanhas={filtros.campanhas} contas={filtros.contas} campanha={campanhaId} conta={perfilId} />
      </Cabecalho>
      {typeof msg === "string" && <Aviso className="mb-5 max-w-3xl">{msg}</Aviso>}
      <div className="-mx-[var(--respiro)] flex snap-x items-start gap-3 overflow-x-auto px-[var(--respiro)] pb-4">
        {abertas.map((coluna) => (
          <Coluna key={coluna.id} coluna={coluna}>
            {cartoes(coluna)}
          </Coluna>
        ))}
        <details className="group w-[17rem] shrink-0 snap-start rounded-2xl border border-linha bg-superficie/40 p-2.5">
          <summary className="flex cursor-pointer items-center justify-between px-1.5 pt-1 pb-1 text-[13px] font-semibold text-tinta-suave">
            <span className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
              {encerrado.rotulo}
            </span>
            <span className="text-xs font-normal tabular-nums text-tinta-fraca">{encerrado.total}</span>
          </summary>
          <div className="mt-2.5">{cartoes(encerrado)}</div>
        </details>
      </div>
    </>
  );
}
