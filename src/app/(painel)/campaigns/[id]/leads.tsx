import { Check, ExternalLink, FileUp, Gauge, X } from "lucide-react";
import { SelecionarTodos } from "@/components/selecionar-todos";
import type { SituacaoDasNotas } from "@/server/nota/nota";
import type { SituacaoDaBusca } from "@/server/publicos/busca";
import { BuscaDaCampanha } from "../../publicos/busca";
import { FormularioImportacao } from "../../importar/formulario";
import { aprovarAcimaDoCorteDaCampanhaDoPainel, aprovarLeadsDoPainel, darNotasDaCampanhaDoPainel, tirarLeadsDoPainel } from "../acoes";

export type LeadParaTriar = {
  id: string;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  localizacao: string | null;
  url: string;
  nota: number | null;
  notaMotivo: string | null;
  bloqueio: string | null;
  alerta: string | null;
};

function Nota({ nota, corte }: { nota: number | null; corte: number }) {
  if (nota === null) return <span className="text-xs text-tinta-fraca">sem nota</span>;
  return (
    <span className={`etiqueta tabular-nums ${nota >= corte ? "etiqueta-ok" : nota >= 40 ? "etiqueta-atencao" : ""}`}>{nota}</span>
  );
}

/**
 * Os leads da campanha (§4.11): a busca pela conta da campanha, a nota de
 * aderência, marcar quem entra e tirar quem não serve, e importar uma lista.
 */
export function AbaLeads({
  campanha,
  conta,
  busca,
  atalhos,
  notas,
  triar,
  numeros,
}: {
  campanha: { id: string; nome: string };
  conta: string;
  busca: SituacaoDaBusca | null;
  atalhos: { regioes: string[]; setores: string[] };
  notas: SituacaoDasNotas;
  triar: LeadParaTriar[];
  numeros: { naFila: number; andamento: number };
}) {
  const destino = `/campaigns/${campanha.id}?tab=leads`;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-tinta-suave">
        <span className="tabular-nums text-tinta">{numeros.naFila}</span> na fila para receber convite ·{" "}
        <span className="tabular-nums text-tinta">{numeros.andamento}</span> já em andamento · {triar.length} esperando você decidir
      </p>

      {busca && (
        <section className="cartao p-5" aria-labelledby="titulo-busca">
          <h2 id="titulo-busca" className="text-[15px] font-semibold">
            Buscar no LinkedIn pela conta de {conta}
          </h2>
          <p className="mt-1 mb-4 text-[13px] text-tinta-suave">Quem a busca trouxer entra aqui embaixo, com a nota, para você marcar.</p>
          <BuscaDaCampanha
            campanhaId={campanha.id}
            inicial={busca.busca}
            salva={busca.salva}
            saldoHoje={busca.saldoHoje}
            tetoDoDia={busca.tetoDoDia}
            suspensaAte={busca.suspensaAte?.toISOString() ?? null}
            atalhos={atalhos}
            destinoDosLeads={destino}
          />
        </section>
      )}

      <section aria-labelledby="titulo-triar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-triar" className="text-[15px] font-semibold">
            Quem entra na campanha
          </h2>
          <div className="flex flex-wrap gap-2">
            {notas.semNota > 0 && (
              <form action={darNotasDaCampanhaDoPainel}>
                <input type="hidden" name="campanhaId" value={campanha.id} />
                <button type="submit" className="botao botao-pequeno">
                  <Gauge aria-hidden />
                  Dar nota a {Math.min(notas.semNota, 100)}
                </button>
              </form>
            )}
            {notas.acimaDoCorte > 0 && (
              <form action={aprovarAcimaDoCorteDaCampanhaDoPainel}>
                <input type="hidden" name="campanhaId" value={campanha.id} />
                <button type="submit" className="botao botao-pequeno botao-primario">
                  <Check aria-hidden />
                  Marcar os {notas.acimaDoCorte} a partir de {notas.corte}
                </button>
              </form>
            )}
          </div>
        </div>
        {triar.length === 0 ? (
          <p className="vazio mt-3">Ninguém esperando. Busque no LinkedIn ou importe uma lista.</p>
        ) : (
          <form className="cartao mt-3 overflow-hidden">
            <input type="hidden" name="campanhaId" value={campanha.id} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-4 py-3">
              <label className="flex items-center gap-2 text-[13px] text-tinta-suave">
                <SelecionarTodos nome="leadIds" rotulo="Marcar todos" />
                Marcar todos
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" formAction={tirarLeadsDoPainel} className="botao botao-pequeno">
                  <X aria-hidden />
                  Tirar os marcados
                </button>
                <button type="submit" formAction={aprovarLeadsDoPainel} className="botao botao-pequeno botao-primario">
                  <Check aria-hidden />
                  Colocar os marcados na fila
                </button>
              </div>
            </div>
            <ul className="divide-y divide-linha">
              {triar.map((lead) => (
                <li key={lead.id} className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    name="leadIds"
                    value={lead.id}
                    disabled={Boolean(lead.bloqueio)}
                    aria-label={`Marcar ${lead.nome}`}
                    className="mt-1 size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{lead.nome}</span>
                      <Nota nota={lead.nota} corte={notas.corte} />
                      <a href={lead.url} target="_blank" rel="noreferrer" className="text-tinta-fraca hover:text-tinta" aria-label={`Perfil de ${lead.nome} no LinkedIn`}>
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </p>
                    <p className="text-xs text-tinta-suave">{[lead.cargo, lead.empresa, lead.localizacao].filter(Boolean).join(" · ")}</p>
                    {lead.notaMotivo && <p className="mt-1 text-[13px] text-tinta-suave">{lead.notaMotivo}</p>}
                    {lead.bloqueio && <p className="mt-1 text-[13px] text-atencao">Bloqueado: {lead.bloqueio}</p>}
                    {lead.alerta && <p className="mt-1 text-[13px] text-atencao">{lead.alerta}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </form>
        )}
      </section>

      <details className="cartao p-5">
        <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
          <FileUp className="size-4 text-tinta-suave" aria-hidden />
          Importar uma lista
        </summary>
        <div className="mt-4">
          <FormularioImportacao campanhas={[{ id: campanha.id, nome: campanha.nome, perfil: conta }]} inicial={campanha.id} destinoDosLeads={destino} />
        </div>
      </details>
    </div>
  );
}
