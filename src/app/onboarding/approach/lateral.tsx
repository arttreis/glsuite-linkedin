import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnelDaNota } from "@/components/anel-da-nota";
import type { Dossie } from "@/domain/dossie";
import type { Sdr } from "@/domain/sdr";
import type { PublicoSalvo } from "@/server/publicos/publicos";
import { sugerirOutrosPublicos, trocarParaPublico } from "./acoes";
import { BotaoQueEspera } from "./enviando";

function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-linha pt-5 first:border-t-0 first:pt-0">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-tinta-fraca">{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  );
}

const linkPequeno = "text-xs text-tinta-suave underline-offset-4 hover:text-tinta hover:underline";

/**
 * O que o Kakou já entendeu, em uma coluna (SDR-56): a empresa, o que o
 * cliente usa no lugar, o SDR e os públicos pela aderência. Trocar de público
 * busca outras pessoas e reescreve as mensagens.
 */
export function Lateral({
  analise,
  sdr,
  publicos,
  corte,
}: {
  analise: Dossie | null;
  sdr: Sdr | null;
  publicos: PublicoSalvo[];
  corte: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      {analise && (
        <Secao
          titulo="Sua empresa"
          acao={
            <Link href="/onboarding/analysis" className={linkPequeno}>
              Rever
            </Link>
          }
        >
          <p className="font-medium">{analise.empresa.nome}</p>
          <p className="mt-1 line-clamp-5 text-sm text-tinta-suave">{analise.empresa.resumo}</p>
        </Secao>
      )}

      {analise && analise.mercado.alternativas.length > 0 && (
        <Secao titulo="O que usam no lugar">
          <ul className="flex flex-wrap gap-1.5">
            {analise.mercado.alternativas.map((alternativa) => (
              <li key={alternativa} className="etiqueta max-w-full truncate" title={alternativa}>
                {alternativa}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {sdr && (
        <Secao
          titulo="Seu SDR"
          acao={
            <Link href="/onboarding/sdr" className={linkPequeno}>
              Conversar de novo
            </Link>
          }
        >
          <p className="text-sm text-tinta-suave">
            <span className="text-tinta">Objetivo:</span> {sdr.objetivo}
          </p>
        </Secao>
      )}

      <Secao titulo={`Públicos · ${publicos.length}`}>
        <ul className="flex flex-col gap-1.5">
          {publicos.map((publico) => {
            const emUso = publico.status === "ativo";
            const conteudo = (
              <>
                <AnelDaNota nota={publico.aderencia?.nota ?? null} corte={corte} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{publico.nome}</span>
                  {emUso && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-destaque">
                      <Check className="size-3" aria-hidden />
                      em uso
                    </span>
                  )}
                </span>
              </>
            );
            return (
              <li key={publico.id}>
                {emUso ? (
                  <div className="flex items-center gap-3 rounded-xl border border-destaque/40 bg-destaque/[0.06] p-2.5" title={publico.aderencia?.motivo}>
                    {conteudo}
                  </div>
                ) : (
                  <form action={trocarParaPublico}>
                    <input type="hidden" name="publico" value={publico.id} />
                    <BotaoQueEspera
                      className="flex w-full items-center gap-3 rounded-xl border border-linha p-2.5 text-left transition-colors hover:border-linha-forte hover:bg-superficie-alta disabled:opacity-60"
                      title={`${publico.aderencia?.motivo ?? ""} Usar este público busca outras pessoas e reescreve as mensagens.`.trim()}
                      esperando={
                        <>
                          {conteudo}
                          <span className="sr-only">Trocando de público...</span>
                        </>
                      }
                    >
                      {conteudo}
                    </BotaoQueEspera>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <form action={sugerirOutrosPublicos} className="mt-3">
          <BotaoQueEspera className="botao botao-pequeno" esperando="Pensando em outros...">
            <Sparkles aria-hidden />
            Sugerir outros
          </BotaoQueEspera>
        </form>
      </Secao>
    </div>
  );
}
