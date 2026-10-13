"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { AnelDaNota } from "@/components/anel-da-nota";
import { Aviso } from "@/components/aviso";
import type { PessoaDaPrevia } from "@/domain/previa";
import { marcarPessoaDaPrevia, seguirComAPrevia } from "./acoes";

/**
 * As pessoas que a prévia trouxe (§4.4), pela nota. Quem passa do corte já vem
 * marcado; a pessoa tira quem não quer. Cada marcação grava na hora.
 */
export function ListaDaPrevia({ inicial, corte }: { inicial: PessoaDaPrevia[]; corte: number }) {
  const [pessoas, setPessoas] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciarMarcacao] = useTransition();
  const [seguindo, iniciarSeguir] = useTransition();
  const marcadas = pessoas.filter((pessoa) => pessoa.marcada).length;

  const marcar = (providerId: string, marcada: boolean) => {
    setErro(null);
    setPessoas((atuais) => atuais.map((pessoa) => (pessoa.providerId === providerId ? { ...pessoa, marcada } : pessoa)));
    iniciarMarcacao(async () => {
      const { ok } = await marcarPessoaDaPrevia({ providerId, marcada });
      if (!ok) {
        setPessoas((atuais) => atuais.map((pessoa) => (pessoa.providerId === providerId ? { ...pessoa, marcada: !marcada } : pessoa)));
        setErro("Não consegui gravar a marcação. Tente de novo.");
      }
    });
  };

  const seguir = () =>
    iniciarSeguir(async () => {
      const resultado = await seguirComAPrevia();
      if (resultado && !resultado.ok) setErro(resultado.erro);
    });

  return (
    <div className="mt-6">
      <ul className="cartao divide-y divide-linha overflow-hidden">
        {pessoas.map((pessoa) => (
          <li key={pessoa.providerId}>
            <label className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors hover:bg-superficie-alta ${pessoa.marcada ? "" : "opacity-60"}`}>
              <input
                type="checkbox"
                checked={pessoa.marcada}
                onChange={(e) => marcar(pessoa.providerId, e.target.checked)}
                className="mt-3 size-4 shrink-0"
              />
              <AnelDaNota nota={pessoa.nota} corte={corte} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{pessoa.nome}</span>
                  <a
                    href={pessoa.urlPublica}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-tinta-fraca hover:text-tinta"
                    title="Ver no LinkedIn"
                  >
                    <ExternalLink className="size-3.5" aria-label={`Ver ${pessoa.nome} no LinkedIn`} />
                  </a>
                </span>
                <span className="block truncate text-sm text-tinta-suave">
                  {[pessoa.cargo, pessoa.empresa].filter(Boolean).join(" · ") || "Sem cargo na busca"}
                </span>
                {pessoa.motivo && <span className="mt-1 block text-xs text-tinta-fraca">{pessoa.motivo}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 -mx-5 mt-5 flex flex-col gap-3 border-t border-linha bg-fundo/90 px-5 py-4 backdrop-blur">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="botao botao-primario" onClick={seguir} disabled={seguindo || marcadas === 0}>
            {seguindo ? "Seguindo..." : `Seguir com ${marcadas} ${marcadas === 1 ? "pessoa" : "pessoas"}`}
            <ArrowRight aria-hidden />
          </button>
          <span className="text-xs text-tinta-fraca">
            Nota {corte} ou mais já vem marcada. Ninguém recebe nada antes de você permitir e vincular o seu LinkedIn.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Prévia sem nomes: segue mesmo assim, e a lista vem pela conta da pessoa. */
export function SeguirSemNomes() {
  const [erro, setErro] = useState<string | null>(null);
  const [seguindo, iniciar] = useTransition();
  return (
    <div className="mt-6">
      {erro && (
        <Aviso tom="erro" className="mb-3">
          {erro}
        </Aviso>
      )}
      <button
        type="button"
        className="botao botao-primario"
        disabled={seguindo}
        onClick={() =>
          iniciar(async () => {
            const resultado = await seguirComAPrevia();
            if (resultado && !resultado.ok) setErro(resultado.erro);
          })
        }
      >
        {seguindo ? "Seguindo..." : "Seguir sem os nomes"}
        <ArrowRight aria-hidden />
      </button>
    </div>
  );
}
