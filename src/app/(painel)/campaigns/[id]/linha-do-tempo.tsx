"use client";

import { CircleAlert, Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import type { ProblemaDoBloco } from "@/domain/fluxo";
import type { PassoDaLinha } from "@/domain/linha-do-tempo";
import { salvarTextosDoPainel } from "../acoes";

const ROTULO = { convite: "Convite", mensagem: "Mensagem", tarefa: "Tarefa (você escreve à mão)" } as const;

/**
 * A abordagem como linha do tempo (§4.11): cada texto na ordem em que sai, com
 * quando. Salvar valida tudo; com lead andando, nasce uma versão nova do fluxo
 * para quem entrar depois.
 */
export function LinhaDoTempoDaCampanha({
  campanhaId,
  passos,
  editavel,
  comLeads,
}: {
  campanhaId: string;
  passos: PassoDaLinha[];
  editavel: boolean;
  comLeads: boolean;
}) {
  const [textos, setTextos] = useState<Record<string, string>>(() => Object.fromEntries(passos.map((p) => [p.nodeId, p.texto])));
  const [problemas, setProblemas] = useState<ProblemaDoBloco[]>([]);
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudou = useMemo(() => passos.some((p) => textos[p.nodeId] !== p.texto), [passos, textos]);
  // "Mensagem 1", "Mensagem 2": o convite não entra na conta.
  const titulos = passos.map((passo, indice) =>
    passo.tipo === "convite"
      ? ROTULO.convite
      : `${ROTULO[passo.tipo]} ${passos.slice(0, indice + 1).filter((p) => p.tipo !== "convite").length}`,
  );

  const salvar = () =>
    iniciar(async () => {
      setRetorno(null);
      const alterados = Object.fromEntries(passos.filter((p) => textos[p.nodeId] !== p.texto).map((p) => [p.nodeId, textos[p.nodeId]!]));
      const resultado = await salvarTextosDoPainel({ campanhaId, textos: alterados });
      setProblemas(resultado.ok ? [] : resultado.problemas);
      setRetorno(
        resultado.ok
          ? { tom: "ok", texto: comLeads ? "Salvo. Vale para quem entrar na campanha daqui para frente." : "Salvo." }
          : { tom: "erro", texto: resultado.erro },
      );
    });

  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col gap-5 border-l border-linha-forte pl-6">
        {passos.map((passo, indice) => {
          const violacoes = problemas.find((p) => p.toque === passo.nodeId)?.violacoes ?? [];
          return (
            <li key={passo.nodeId} className="relative">
              <span className="absolute top-1.5 -left-[1.85rem] size-2.5 rounded-full border-2 border-destaque bg-fundo" aria-hidden />
              <p className="text-xs text-tinta-fraca">{passo.quando}</p>
              <p className="mt-0.5 text-sm font-medium">{titulos[indice]}</p>
              <textarea
                value={textos[passo.nodeId] ?? ""}
                onChange={(e) => {
                  setRetorno(null);
                  setTextos((atual) => ({ ...atual, [passo.nodeId]: e.target.value }));
                }}
                rows={passo.tipo === "convite" ? 3 : 4}
                disabled={!editavel || pendente}
                aria-label={`${ROTULO[passo.tipo]} ${passo.nodeId}`}
                className="campo mt-2 w-full resize-y"
              />
              <p className="mt-1 text-[11px] text-tinta-fraca tabular-nums">{(textos[passo.nodeId] ?? "").length} caracteres</p>
              {violacoes.map((v) => (
                <p key={v.regra} className="mt-1 flex items-start gap-1.5 text-[13px] text-erro">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {v.mensagem}
                </p>
              ))}
            </li>
          );
        })}
      </ol>
      {retorno && <Aviso tom={retorno.tom}>{retorno.texto}</Aviso>}
      {editavel && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-tinta-fraca">Use {"{{first_name}}"} e {"{{company}}"} para o nome e a empresa da pessoa.</p>
          <button type="button" className="botao botao-primario" onClick={salvar} disabled={!mudou || pendente}>
            <Save aria-hidden />
            {pendente ? "Salvando..." : "Salvar os textos"}
          </button>
        </div>
      )}
    </div>
  );
}
