"use client";

import { CircleAlert, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
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
      <section className="cartao p-5">
        <h2 className="text-[15px] font-semibold">Dados da campanha</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="rotulo">
            Perfil
            <select
              value={campanha.perfilId}
              disabled={Boolean(campanha.id)}
              onChange={(e) => setCampanha({ ...campanha, perfilId: e.target.value })}
              className="campo"
            >
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="rotulo">
            Nome
            <input value={campanha.nome} onChange={(e) => setCampanha({ ...campanha, nome: e.target.value })} className="campo" />
          </label>
          <label className="rotulo">
            Ângulo de abertura
            <select value={campanha.angulo} onChange={(e) => setCampanha({ ...campanha, angulo: e.target.value })} className="campo">
              {angulos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="rotulo">
            Nicho
            <input
              value={campanha.nicho ?? ""}
              onChange={(e) => setCampanha({ ...campanha, nicho: e.target.value || null })}
              className="campo"
            />
          </label>
          <label className="rotulo">
            Copy do T1
            <select
              value={campanha.modoCopy}
              onChange={(e) => setCampanha({ ...campanha, modoCopy: e.target.value as CampanhaDoEditor["modoCopy"] })}
              className="campo"
            >
              <option value="template">Template</option>
              <option value="personalizada">Personalizada pela IA (com aprovação)</option>
            </select>
          </label>
          <label className="rotulo">
            Máximo de leads (opcional)
            <input
              type="number"
              min={1}
              value={campanha.maxLeads ?? ""}
              onChange={(e) => setCampanha({ ...campanha, maxLeads: e.target.value ? Number(e.target.value) : null })}
              className="campo"
            />
          </label>
        </div>
      </section>

      <p className="flex items-start gap-2 text-[13px] text-tinta-suave">
        <Info className="mt-0.5 size-4 shrink-0 text-tinta-fraca" aria-hidden />
        <span>
          Use só {"{{first_name}}"} e {"{{company}}"}. A prévia usa valores longos de exemplo ({exemplo.first_name},{" "}
          {exemplo.company}).
          {manualNaEspanha && " Na Espanha, T2 a T4 viram tarefa manual: o texto é o roteiro de apoio do JP."}
        </span>
      </p>

      {campanha.sequencia.map((passo, indice) => {
        const problema = problemas[indice];
        const texto = passo.template;
        return (
          <section key={passo.toque} className="cartao p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <h3 className="flex items-center gap-2.5 font-medium">
                <span className="etiqueta font-semibold text-tinta">{passo.toque}</span>
                {passo.tipo === "convite" ? "Convite" : manualNaEspanha ? "Roteiro (manual)" : "DM"}
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tinta-suave sm:ml-auto">
                {indice > 0 && (
                  <label className="flex items-center gap-1.5">
                    +
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={passo.offset_dias_uteis}
                      onChange={(e) => atualizarPasso(indice, { offset_dias_uteis: Number(e.target.value) })}
                      className="campo campo-pequeno w-16 tabular-nums"
                    />
                    dias úteis {QUANDO[passo.ancora]}
                  </label>
                )}
                <label className="flex items-center gap-1.5">
                  teto
                  <input
                    type="number"
                    min={1}
                    max={passo.tipo === "convite" ? 300 : 2000}
                    value={tetoDoPasso(passo)}
                    onChange={(e) => atualizarPasso(indice, { max_caracteres: Number(e.target.value) })}
                    className="campo campo-pequeno w-20 tabular-nums"
                  />
                  caracteres
                </label>
              </div>
            </div>
            <textarea
              value={texto}
              onChange={(e) => atualizarPasso(indice, { template: e.target.value })}
              rows={3}
              aria-label={`Texto do ${passo.toque}`}
              placeholder={
                passo.tipo === "convite"
                  ? campanha.modoCopy === "personalizada"
                    ? "Braço de controle do A/B: parte dos leads recebe este texto (vazio = convite sem nota); a outra recebe o T1 escrito pela IA. Também serve de base de estilo."
                    : "Nota curta, sem oferta, sem link. Vazio = convite sem nota."
                  : ""
              }
              className="campo mt-4 w-full"
            />
            {problema?.previa && (
              <div className="recuo mt-3">
                <p className="text-xs text-tinta-fraca tabular-nums">Prévia, {problema.previa.length} caracteres</p>
                <p className="mt-1 whitespace-pre-wrap text-tinta">{problema.previa}</p>
              </div>
            )}
            {problema?.violacoes.map((violacao) => (
              <p key={violacao.regra} className="mt-2 flex items-start gap-1.5 text-sm text-erro">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {violacao.mensagem}
              </p>
            ))}
          </section>
        );
      })}

      {erros.length > 0 && (
        <Aviso tom="erro">
          {erros.map((erro) => (
            <p key={erro}>{erro}</p>
          ))}
        </Aviso>
      )}
      <div>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || temProblema || !campanha.nome.trim()}
          className="botao botao-primario"
        >
          {salvando ? "Salvando..." : temProblema ? "Corrija a copy para salvar" : "Salvar campanha"}
        </button>
      </div>
    </div>
  );
}
