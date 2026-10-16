"use client";

import { Pause, Play, Power, Rocket } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import type { StatusDoLancamento } from "@/domain/lancamentos";
import type { Resultado } from "@/server/publicos/publicos";
import { encerrarLancamentoDoPainel, pausarLancamentoDoPainel, porNoArDoPainel, retomarLancamentoDoPainel } from "../acoes";

/** O que "Pôr no ar" mostra antes de confirmar. Por ora, só as datas (os grupos entram no SDR-76). */
export type ConferenciaDoLancamento = {
  fase: string;
  datas: { rotulo: string; quando: string }[];
  problema: string | null;
};

/**
 * Os botões de estado do lançamento (§4.21): Pôr no ar abre a conferência;
 * Encerrar pede confirmação, porque não volta. Pausar e Retomar são na hora.
 * Encerrado não tem botão de estado.
 */
export function ControlesDoLancamento({
  id,
  nome,
  status,
  pausado,
  conferencia,
}: {
  id: string;
  nome: string;
  status: StatusDoLancamento;
  pausado: boolean;
  conferencia: ConferenciaDoLancamento;
}) {
  const [aberto, setAberto] = useState<"conferencia" | "encerrar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mudando, iniciar] = useTransition();

  const executar = (acao: (id: string) => Promise<Resultado>) =>
    iniciar(async () => {
      setErro(null);
      const resultado = await acao(id);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setAberto(null);
    });

  const abrir = (painel: "conferencia" | "encerrar") => {
    setErro(null);
    setAberto(painel);
  };

  if (status === "encerrado") return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "montando" && (
          <button type="button" className="botao botao-primario botao-pequeno" onClick={() => abrir("conferencia")} aria-expanded={aberto === "conferencia"} disabled={mudando}>
            <Rocket aria-hidden />
            Pôr no ar
          </button>
        )}
        {status === "no_ar" && !pausado && (
          <button type="button" className="botao botao-pequeno" onClick={() => executar(pausarLancamentoDoPainel)} disabled={mudando}>
            <Pause aria-hidden />
            Pausar
          </button>
        )}
        {status === "no_ar" && pausado && (
          <button type="button" className="botao botao-primario botao-pequeno" onClick={() => executar(retomarLancamentoDoPainel)} disabled={mudando}>
            <Play aria-hidden />
            Retomar
          </button>
        )}
        <button type="button" className="botao botao-pequeno" onClick={() => abrir("encerrar")} aria-expanded={aberto === "encerrar"} disabled={mudando}>
          <Power aria-hidden />
          Encerrar
        </button>
      </div>

      {aberto === "conferencia" && (
        <section className="cartao flex max-w-xl flex-col gap-3 p-5" aria-labelledby="titulo-conferencia">
          <h2 id="titulo-conferencia" className="text-[15px] font-semibold">
            Pôr {nome} no ar
          </h2>
          <p className="text-[13px] text-tinta-suave">
            Fase de agora: <span className="text-tinta">{conferencia.fase}</span>
          </p>
          {conferencia.datas.length > 0 ? (
            <dl className="flex flex-col gap-1 text-[13px]">
              {conferencia.datas.map((data) => (
                <div key={`${data.rotulo}-${data.quando}`} className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-tinta-suave">{data.rotulo}</dt>
                  <dd className="tabular-nums">{data.quando}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-tinta-suave">Sem datas: o lançamento vai ao ar sem fase.</p>
          )}
          {conferencia.problema && <Aviso tom="erro">{conferencia.problema}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="botao botao-primario botao-pequeno"
              onClick={() => executar(porNoArDoPainel)}
              disabled={mudando || conferencia.problema !== null}
              autoFocus={conferencia.problema === null}
            >
              <Rocket aria-hidden />
              {mudando ? "Pondo no ar…" : "Pôr no ar agora"}
            </button>
            <button type="button" className="botao botao-pequeno" onClick={() => setAberto(null)} disabled={mudando} autoFocus={conferencia.problema !== null}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {aberto === "encerrar" && (
        <section className="cartao flex max-w-xl flex-col gap-3 p-5" aria-labelledby="titulo-encerrar">
          <h2 id="titulo-encerrar" className="text-[15px] font-semibold">
            Encerrar {nome}?
          </h2>
          <p className="text-[13px] text-tinta-suave">O lançamento sai do ar e não volta. Os dados ficam.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="botao botao-perigo botao-pequeno" onClick={() => executar(encerrarLancamentoDoPainel)} disabled={mudando}>
              <Power aria-hidden />
              {mudando ? "Encerrando…" : "Encerrar"}
            </button>
            <button type="button" className="botao botao-pequeno" onClick={() => setAberto(null)} disabled={mudando} autoFocus>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
