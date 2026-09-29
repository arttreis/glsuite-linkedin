"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { validarCopyDaSequencia, type ContextoDoPerfil } from "@/domain/campanha";
import { sequenciaPadrao, tetoDoPasso, type Sequencia } from "@/domain/sequencia";
import type { ValoresDoTemplate } from "@/domain/template";
import { salvarCampanhaDoPainel } from "./acoes";

export type PerfilDoEditor = { id: string; nome: string; contexto: ContextoDoPerfil };

export type CampanhaDoEditor = {
  id?: string;
  perfilId: string;
  nome: string;
  angulo: string;
  nicho: string | null;
  modoCopy: "template" | "personalizada";
  maxLeads: number | null;
  sequencia: Sequencia;
};

const QUANDO: Record<string, string> = { inicio: "da aprovação", aceite: "do aceite", anterior: "do toque anterior" };
const campo = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";

export function EditorDeCampanha({
  perfis,
  angulos,
  exemplo,
  inicial,
}: {
  perfis: PerfilDoEditor[];
  angulos: string[];
  exemplo: ValoresDoTemplate;
  inicial?: CampanhaDoEditor;
}) {
  const router = useRouter();
  const [campanha, setCampanha] = useState<CampanhaDoEditor>(
    inicial ?? {
      perfilId: perfis[0]?.id ?? "",
      nome: "",
      angulo: angulos[0] ?? "",
      nicho: null,
      modoCopy: "template",
      maxLeads: null,
      sequencia: sequenciaPadrao(),
    },
  );
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, iniciar] = useTransition();

  const perfil = perfis.find((p) => p.id === campanha.perfilId);
  const manualNaEspanha = perfil?.contexto.praca === "espanha";
  const problemas = useMemo(
    () =>
      perfil
        ? validarCopyDaSequencia(campanha.sequencia, perfil.contexto, exemplo, { t1PelaIa: campanha.modoCopy === "personalizada" })
        : [],
    [campanha.sequencia, campanha.modoCopy, perfil, exemplo],
  );
  const temProblema = problemas.some((p) => p.violacoes.length > 0);

  const atualizarPasso = (indice: number, mudanca: Partial<Sequencia[number]>) =>
    setCampanha((atual) => ({
      ...atual,
      sequencia: atual.sequencia.map((passo, i) => (i === indice ? { ...passo, ...mudanca } : passo)),
    }));

  function salvar() {
    setErros([]);
    iniciar(async () => {
      const resultado = await salvarCampanhaDoPainel(campanha);
      if (resultado.ok) {
        router.push(`/campanhas/${resultado.campanhaId}?salva=1`);
        router.refresh();
      } else {
        setErros(resultado.erros);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid max-w-3xl grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Perfil
          <select
            value={campanha.perfilId}
            disabled={Boolean(campanha.id)}
            onChange={(e) => setCampanha({ ...campanha, perfilId: e.target.value })}
            className={campo}
          >
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nome
          <input value={campanha.nome} onChange={(e) => setCampanha({ ...campanha, nome: e.target.value })} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Ângulo de abertura
          <select value={campanha.angulo} onChange={(e) => setCampanha({ ...campanha, angulo: e.target.value })} className={campo}>
            {angulos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nicho
          <input
            value={campanha.nicho ?? ""}
            onChange={(e) => setCampanha({ ...campanha, nicho: e.target.value || null })}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Copy do T1
          <select
            value={campanha.modoCopy}
            onChange={(e) => setCampanha({ ...campanha, modoCopy: e.target.value as CampanhaDoEditor["modoCopy"] })}
            className={campo}
          >
            <option value="template">Template</option>
            <option value="personalizada">Personalizada pela IA (com aprovação)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Máximo de leads (opcional)
          <input
            type="number"
            min={1}
            value={campanha.maxLeads ?? ""}
            onChange={(e) => setCampanha({ ...campanha, maxLeads: e.target.value ? Number(e.target.value) : null })}
            className={campo}
          />
        </label>
      </div>

      <p className="text-xs text-neutral-500">
        Use só {"{{first_name}}"} e {"{{company}}"}. A prévia usa valores longos de exemplo ({exemplo.first_name},{" "}
        {exemplo.company}).
        {manualNaEspanha && " Na Espanha, T2 a T4 viram tarefa manual: o texto é o roteiro de apoio do JP."}
      </p>

      {campanha.sequencia.map((passo, indice) => {
        const problema = problemas[indice];
        const texto = passo.template;
        return (
          <section key={passo.toque} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-medium">
                {passo.toque} · {passo.tipo === "convite" ? "Convite" : manualNaEspanha ? "Roteiro (manual)" : "DM"}
              </h3>
              {indice > 0 && (
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  +
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={passo.offset_dias_uteis}
                    onChange={(e) => atualizarPasso(indice, { offset_dias_uteis: Number(e.target.value) })}
                    className="w-14 rounded border border-neutral-300 px-1 py-0.5"
                  />
                  dias úteis {QUANDO[passo.ancora]}
                </label>
              )}
              <label className="flex items-center gap-1 text-xs text-neutral-600">
                teto
                <input
                  type="number"
                  min={1}
                  max={passo.tipo === "convite" ? 300 : 2000}
                  value={tetoDoPasso(passo)}
                  onChange={(e) => atualizarPasso(indice, { max_caracteres: Number(e.target.value) })}
                  className="w-16 rounded border border-neutral-300 px-1 py-0.5"
                />
                caracteres
              </label>
            </div>
            <textarea
              value={texto}
              onChange={(e) => atualizarPasso(indice, { template: e.target.value })}
              rows={3}
              placeholder={
                passo.tipo === "convite"
                  ? campanha.modoCopy === "personalizada"
                    ? "A IA escreve o T1 de cada lead (opcional: base de estilo)."
                    : "Nota curta, sem oferta, sem link. Vazio = convite sem nota."
                  : ""
              }
              className={`${campo} mt-2 w-full font-mono`}
            />
            {problema?.previa && (
              <p className="mt-2 rounded bg-neutral-50 p-2 text-sm text-neutral-700">
                <span className="text-xs uppercase tracking-wide text-neutral-400">Prévia · {problema.previa.length} caracteres</span>
                <br />
                {problema.previa}
              </p>
            )}
            {problema?.violacoes.map((violacao) => (
              <p key={violacao.regra} className="mt-1 text-sm text-red-700">
                {violacao.mensagem}
              </p>
            ))}
          </section>
        );
      })}

      {erros.map((erro) => (
        <p key={erro} className="text-sm text-red-700">
          {erro}
        </p>
      ))}
      <div>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || temProblema || !campanha.nome.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {salvando ? "Salvando..." : temProblema ? "Corrija a copy para salvar" : "Salvar campanha"}
        </button>
      </div>
    </div>
  );
}
