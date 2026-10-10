"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PASSO_INICIAL, PASSOS_DO_PRIMEIRO_ACESSO, type IdDoPassoInicial } from "@/domain/primeiro-acesso";

/**
 * Os seis passos do primeiro acesso no topo da tela. Passo feito vira link
 * (para corrigir); o atual acende; os da frente ficam apagados. No celular,
 * só uma régua: o título do passo já diz onde a pessoa está.
 */
export function Trilha({ feitos, atual }: { feitos: readonly IdDoPassoInicial[]; atual: IdDoPassoInicial }) {
  const caminho = usePathname();
  const aberto = PASSOS_DO_PRIMEIRO_ACESSO.find((passo) => caminho.startsWith(`/comecar/${passo}`)) ?? atual;
  const indiceAberto = PASSOS_DO_PRIMEIRO_ACESSO.indexOf(aberto);
  const indiceAtual = PASSOS_DO_PRIMEIRO_ACESSO.indexOf(atual);

  return (
    <nav aria-label="Passos do primeiro acesso">
      <div className="sm:hidden">
        <p className="sr-only">
          Passo {indiceAberto + 1} de {PASSOS_DO_PRIMEIRO_ACESSO.length}: {PASSO_INICIAL[aberto].rotulo}
        </p>
        <div className="grid grid-cols-6 gap-1" aria-hidden>
          {PASSOS_DO_PRIMEIRO_ACESSO.map((passo, indice) => (
            <span
              key={passo}
              className={`h-1 rounded-full ${indice <= indiceAtual ? "bg-destaque" : "bg-linha-forte"} ${
                indice === indiceAberto ? "" : "opacity-60"
              }`}
            />
          ))}
        </div>
      </div>

      <ol className="hidden items-center justify-center gap-2 sm:flex">
        {PASSOS_DO_PRIMEIRO_ACESSO.map((passo, indice) => {
          const feito = feitos.includes(passo);
          const disponivel = indice <= indiceAtual;
          const eAberto = passo === aberto;
          const conteudo = (
            <>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                  eAberto
                    ? "border-destaque bg-destaque text-fundo"
                    : feito
                      ? "border-destaque/50 text-destaque"
                      : "border-linha-forte text-tinta-fraca"
                }`}
              >
                {feito && !eAberto ? <Check className="size-3.5" aria-hidden /> : indice + 1}
              </span>
              <span className={eAberto ? "text-tinta" : disponivel ? "text-tinta-suave" : "text-tinta-fraca"}>
                {PASSO_INICIAL[passo].rotulo}
              </span>
            </>
          );
          return (
            <li key={passo} className="flex items-center gap-2">
              {indice > 0 && (
                <span aria-hidden className={`h-px w-6 lg:w-10 ${disponivel ? "bg-destaque/40" : "bg-linha-forte"}`} />
              )}
              {disponivel && !eAberto ? (
                <Link href={`/comecar/${passo}`} className="flex items-center gap-2 rounded-full text-sm hover:text-tinta">
                  {conteudo}
                </Link>
              ) : (
                <span className="flex items-center gap-2 text-sm" aria-current={eAberto ? "step" : undefined}>
                  {conteudo}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
