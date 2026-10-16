"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { sincronizarMarcaDaJanela, trocarDeMarcaDoPainel } from "@/app/(painel)/acoes";
import { CANAL_DA_MARCA, COOKIE_DA_MARCA } from "@/domain/marcas";
import type { Marca } from "@/server/marcas/marcas";
import { Aviso } from "./aviso";
import { SeloDaMarca } from "./selo-da-marca";

/** Com mais marcas que isso, a lista ganha a busca. */
const MARCAS_SEM_BUSCA = 8;

let idDaAba: string | undefined;
const estaAba = () => (idDaAba ??= crypto.randomUUID());

function marcaDoCookie(): string | null {
  const par = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${COOKIE_DA_MARCA}=`));
  return par ? decodeURIComponent(par.slice(COOKIE_DA_MARCA.length + 1)) : null;
}

/**
 * A guarda de janela no navegador (§4.30). Ao montar, confere o cookie contra
 * a marca da página e, se divergir, regrava o cookie com a marca que a página
 * mostra. Quando outra aba do mesmo navegador troca de marca, esta recarrega.
 * Vai uma vez por página, na moldura.
 */
export function GuardaDaJanela({ marcaId }: { marcaId: string }) {
  useEffect(() => {
    if (!marcaId) return;
    if (marcaDoCookie() !== marcaId) void sincronizarMarcaDaJanela(marcaId);
    if (typeof BroadcastChannel === "undefined") return;
    const canal = new BroadcastChannel(CANAL_DA_MARCA);
    canal.onmessage = (evento: MessageEvent<{ aba?: string; marcaId?: string }>) => {
      if (evento.data?.aba !== estaAba() && evento.data?.marcaId !== marcaId) window.location.reload();
    };
    return () => canal.close();
  }, [marcaId]);
  return null;
}

/**
 * O seletor de marca no topo da barra lateral (§4.30). Com uma marca, ou com a
 * troca desligada (`marcas.ativo`), é só o selo. Com duas ou mais, abre a
 * lista; com `folha`, a lista é uma folha de baixo (a barra de cima do
 * celular). Trocar recarrega a página já na marca nova, e as outras abas
 * recarregam sozinhas.
 */
export function SeletorDeMarca({
  marca,
  marcas,
  trocaLigada,
  folha = false,
}: {
  marca: Marca;
  marcas: Marca[];
  trocaLigada: boolean;
  folha?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, iniciar] = useTransition();
  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const fechar = () => {
    setAberto(false);
    setBusca("");
    setErro(null);
    botao.current?.focus();
  };

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        // O Esc fecha a lista, não o menu do celular por baixo dela.
        evento.stopImmediatePropagation();
        fechar();
      }
    };
    const aoTocarFora = (evento: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) fechar();
    };
    window.addEventListener("keydown", aoTeclar, true);
    if (!folha) document.addEventListener("pointerdown", aoTocarFora);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
      document.removeEventListener("pointerdown", aoTocarFora);
    };
  }, [aberto, folha]);

  if (marcas.length < 2 || !trocaLigada) return <SeloDaMarca marca={marca} className="min-h-11" />;

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = termo ? marcas.filter((m) => m.nome.toLocaleLowerCase("pt-BR").includes(termo)) : marcas;

  const escolher = (escolhida: Marca) => {
    if (escolhida.id === marca.id) return fechar();
    setErro(null);
    iniciar(async () => {
      const resultado = await trocarDeMarcaDoPainel(escolhida.id);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      if (typeof BroadcastChannel !== "undefined") {
        const canal = new BroadcastChannel(CANAL_DA_MARCA);
        canal.postMessage({ aba: estaAba(), marcaId: escolhida.id });
        canal.close();
      }
      window.location.reload();
    });
  };

  const lista = (
    <div className="flex flex-col gap-1">
      {marcas.length > MARCAS_SEM_BUSCA && (
        <input
          type="search"
          className="campo mb-1"
          placeholder="Buscar marca"
          aria-label="Buscar marca"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          autoFocus
        />
      )}
      {erro && (
        <Aviso tom="erro" className="mb-1">
          {erro}
        </Aviso>
      )}
      <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto" aria-label="Marcas">
        {visiveis.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left hover:bg-superficie-alta disabled:opacity-60"
              aria-current={m.id === marca.id ? "true" : undefined}
              disabled={trocando}
              onClick={() => escolher(m)}
            >
              <SeloDaMarca marca={m} />
              {m.id === marca.id && <Check aria-hidden className="size-4 shrink-0 text-destaque" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div ref={caixa} className="relative min-w-0">
      <button
        ref={botao}
        type="button"
        className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-1 hover:bg-superficie-alta"
        aria-label={`Trocar de marca, agora em ${marca.nome}`}
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => (aberto ? fechar() : setAberto(true))}
      >
        <SeloDaMarca marca={marca} />
        <ChevronDown aria-hidden className="size-4 shrink-0 text-tinta-fraca" />
      </button>

      {aberto && !folha && (
        <div className="cartao absolute left-0 top-full z-50 mt-1 w-64 p-2 shadow-lg">{lista}</div>
      )}

      {/* No body: o blur da barra de cima prenderia o `fixed` dentro dela. */}
      {aberto &&
        folha &&
        createPortal(
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Trocar de marca">
            <button type="button" tabIndex={-1} aria-hidden className="absolute inset-0 bg-black/70" onClick={fechar} />
            <div className="cartao absolute inset-x-0 bottom-0 rounded-b-none p-3 pb-6">
              <p className="px-2 pb-2 text-sm font-semibold">Trocar de marca</p>
              {lista}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
