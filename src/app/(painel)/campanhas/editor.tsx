"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import type { ContextoDoPerfil } from "@/domain/campanha";
import { fluxoPadrao, validarCopyDoFluxo, validarFluxo, type Fluxo } from "@/domain/fluxo";
import { problemasDeProvas } from "@/domain/fluxo-gerado";
import type { ValoresDoTemplate } from "@/domain/template";
import { salvarCampanhaDoPainel } from "./acoes";
import { EditorDeFluxo } from "./editor-de-fluxo";

export type PerfilDoEditor = { id: string; nome: string; contexto: ContextoDoPerfil };

export type CampanhaDoEditor = {
  id?: string;
  perfilId: string;
  nome: string;
  angulo: string;
  nicho: string | null;
  modoCopy: "template" | "personalizada";
  maxLeads: number | null;
  fluxo: Fluxo;
  /** Campanha que nasceu de um público: conta e ângulo vêm dele e não mudam aqui; número só das provas dele. */
  publico?: { id: string; nome: string; provas: string[] } | null;
};

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
      fluxo: fluxoPadrao(perfis[0]?.contexto.praca ?? "domestico"),
    },
  );
  // Campanha nova acompanha a praça do perfil escolhido até o operador mexer no fluxo.
  const [fluxoMexido, setFluxoMexido] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, iniciar] = useTransition();

  const perfil = perfis.find((p) => p.id === campanha.perfilId);
  const espanha = perfil?.contexto.praca === "espanha";
  const problemasDeCopy = useMemo(
    () => (perfil ? validarCopyDoFluxo(campanha.fluxo, perfil.contexto, exemplo) : []),
    [campanha.fluxo, perfil, exemplo],
  );
  const problemasDoFluxo = useMemo(() => validarFluxo(campanha.fluxo), [campanha.fluxo]);
  const foraDasProvas = useMemo(
    () => (campanha.publico ? problemasDeProvas(campanha.fluxo, campanha.publico.provas) : []),
    [campanha.fluxo, campanha.publico],
  );
  const temProblemaDeCopy = problemasDeCopy.some((p) => p.violacoes.length > 0);

  function trocarPerfil(perfilId: string) {
    const novo = perfis.find((p) => p.id === perfilId);
    setCampanha((atual) => ({
      ...atual,
      perfilId,
      fluxo: !atual.id && !fluxoMexido && novo ? fluxoPadrao(novo.contexto.praca) : atual.fluxo,
    }));
  }

  function mudarFluxo(fluxo: Fluxo) {
    setFluxoMexido(true);
    setCampanha((atual) => ({ ...atual, fluxo }));
  }

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
              onChange={(e) => trocarPerfil(e.target.value)}
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
          {campanha.publico ? (
            <div className="rotulo">
              Ângulo de abertura
              <p className="text-sm font-normal text-tinta">
                {campanha.angulo}{" "}
                <Link href={`/publicos/${campanha.publico.id}`} className="link text-xs">
                  vem do público {campanha.publico.nome}
                </Link>
              </p>
            </div>
          ) : (
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
          )}
          <label className="rotulo">
            Nicho
            <input
              value={campanha.nicho ?? ""}
              onChange={(e) => setCampanha({ ...campanha, nicho: e.target.value || null })}
              className="campo"
            />
          </label>
          <label className="rotulo">
            Texto do convite
            <select
              value={campanha.modoCopy}
              onChange={(e) => setCampanha({ ...campanha, modoCopy: e.target.value as CampanhaDoEditor["modoCopy"] })}
              className="campo"
            >
              <option value="template">O texto do bloco Convite</option>
              <option value="personalizada">Personalizado pela IA (com aprovação)</option>
            </select>
            {campanha.modoCopy === "personalizada" && (
              <span className="text-xs font-normal text-tinta-fraca">
                Parte dos leads recebe o texto do bloco Convite (vazio = sem nota) e a outra parte, uma nota escrita pela IA
                no mesmo estilo. Você aprova cada nota da IA antes de sair.
              </span>
            )}
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

      <section className="cartao flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Fluxo</h2>
          <p className="mt-1 flex items-start gap-2 text-[13px] text-tinta-suave">
            <Info className="mt-0.5 size-4 shrink-0 text-tinta-fraca" aria-hidden />
            <span>
              O caminho de cada lead, do Início até um Fim. Nos textos, use só {"{{first_name}}"} e {"{{company}}"}; a prévia
              usa valores longos de exemplo ({exemplo.first_name}, {exemplo.company}).
              {espanha && " Na Espanha, cada Mensagem vira tarefa manual: o texto é o roteiro de apoio do JP."}
            </span>
          </p>
        </div>
        {problemasDoFluxo.length > 0 && (
          <Aviso tom="atencao">
            O fluxo ainda está incompleto: dá para salvar como rascunho, mas a campanha só ativa com o fluxo completo.
          </Aviso>
        )}
        {foraDasProvas.length > 0 && (
          <Aviso tom="atencao">
            <p>Número fora das provas do público: a campanha não ativa até corrigir.</p>
            <ul className="mt-1 list-disc pl-5">
              {foraDasProvas.map((p) => (
                <li key={p.toque}>
                  {p.toque}: {p.mensagem}
                </li>
              ))}
            </ul>
          </Aviso>
        )}
        <EditorDeFluxo
          fluxo={campanha.fluxo}
          onChange={mudarFluxo}
          problemasDeCopy={problemasDeCopy}
          problemasDoFluxo={problemasDoFluxo}
          espanha={espanha}
        />
      </section>

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
          disabled={salvando || temProblemaDeCopy || !campanha.nome.trim()}
          className="botao botao-primario"
        >
          {salvando ? "Salvando..." : temProblemaDeCopy ? "Corrija os textos para salvar" : "Salvar campanha"}
        </button>
      </div>
    </div>
  );
}
