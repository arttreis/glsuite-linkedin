"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

/** Troca o item `indice` da lista. */
export const trocar = <T,>(lista: T[], indice: number, item: T) => lista.map((atual, i) => (i === indice ? item : atual));
export const tirar = <T,>(lista: T[], indice: number) => lista.filter((_, i) => i !== indice);

/** Bloco de um editor (dossiê, público): título, ajuda e os campos. */
export function Secao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="cartao p-5">
      <h2 className="font-medium">{titulo}</h2>
      {ajuda && <p className="mt-0.5 text-xs text-tinta-fraca">{ajuda}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Remover({ rotulo, aoClicar, desabilitado }: { rotulo: string; aoClicar: () => void; desabilitado: boolean }) {
  return (
    <button type="button" className="botao botao-pequeno shrink-0 px-2" aria-label={rotulo} title={rotulo} onClick={aoClicar} disabled={desabilitado}>
      <Trash2 aria-hidden />
    </button>
  );
}

export function Adicionar({ rotulo, aoClicar, desabilitado }: { rotulo: string; aoClicar: () => void; desabilitado: boolean }) {
  return (
    <button type="button" className="botao botao-pequeno self-start" onClick={aoClicar} disabled={desabilitado}>
      <Plus aria-hidden />
      {rotulo}
    </button>
  );
}

/** Lista de frases curtas (diferenciais, dores, cargos): uma linha por item. */
export function ListaDeFrases({
  nome,
  itens,
  maximo,
  maxCaracteres = 200,
  aoMudar,
  desabilitado,
}: {
  nome: string;
  itens: string[];
  maximo: number;
  maxCaracteres?: number;
  aoMudar: (itens: string[]) => void;
  desabilitado: boolean;
}) {
  return (
    <>
      {itens.map((item, indice) => (
        <div key={indice} className="flex items-start gap-2">
          <input
            value={item}
            maxLength={maxCaracteres}
            aria-label={`${nome} ${indice + 1}`}
            onChange={(e) => aoMudar(trocar(itens, indice, e.target.value))}
            className="campo w-full"
            disabled={desabilitado}
          />
          <Remover rotulo={`Remover ${nome.toLowerCase()} ${indice + 1}`} aoClicar={() => aoMudar(tirar(itens, indice))} desabilitado={desabilitado} />
        </div>
      ))}
      {itens.length < maximo && <Adicionar rotulo="Adicionar" aoClicar={() => aoMudar([...itens, ""])} desabilitado={desabilitado} />}
    </>
  );
}
