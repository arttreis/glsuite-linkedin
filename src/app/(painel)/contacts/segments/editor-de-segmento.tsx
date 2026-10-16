"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { ORIGENS_DO_CONTATO, ROTULO_DA_ORIGEM, type CorDaTag } from "@/domain/contatos";
import { CANAIS_DO_FILTRO, type FiltroDeContatos } from "@/domain/filtro-de-contatos";
import { COLUNAS_DO_PIPELINE } from "@/domain/pipeline";
import { previaDoSegmentoDoPainel, salvarSegmentoDoPainel, type PreviaNaTela } from "./acoes";

type Opcao = { id: string; nome: string };
type Etapa = FiltroDeContatos["linkedin"]["etapas"][number];

const ROTULO_DO_CANAL: Record<(typeof CANAIS_DO_FILTRO)[number], string> = {
  whatsapp: "Podem receber pelo WhatsApp",
  telegram: "Podem receber pelo Telegram",
  linkedin: "São leads do LinkedIn",
};

const alternar = <T,>(lista: readonly T[], valor: T): T[] => (lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

/** Um botão por tag, que liga e desliga; a cor fica no ponto, como em toda tag (§4.16). */
function EscolherTags({ tags, escolhidas, aoMudar, rotulo }: { tags: (Opcao & { cor: CorDaTag })[]; escolhidas: string[]; aoMudar: (ids: string[]) => void; rotulo: string }) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const escolhida = escolhidas.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={escolhida}
            onClick={() => aoMudar(alternar(escolhidas, tag.id))}
            className={`tag cursor-pointer ${escolhida ? "border-tinta-suave text-tinta" : "opacity-70 hover:opacity-100"}`}
            data-cor={tag.cor}
          >
            {tag.nome}
          </button>
        );
      })}
    </div>
  );
}

/**
 * O editor do segmento (§4.17): as condições, juntas, e ao lado quantos
 * contatos cumprem agora, a descrição em português e os primeiros. Nada é
 * salvo até "Salvar segmento".
 */
export function EditorDeSegmento({
  segmento,
  tags,
  campanhas,
  comLinkedin,
}: {
  segmento: { id: string | null; nome: string; filtros: FiltroDeContatos };
  tags: (Opcao & { cor: CorDaTag })[];
  campanhas: Opcao[];
  comLinkedin: boolean;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(segmento.nome);
  const [filtros, setFiltros] = useState<FiltroDeContatos>(segmento.filtros);
  const [modoDasTags, setModoDasTags] = useState<"alguma" | "todas">(segmento.filtros.tags.todas.length > 0 ? "todas" : "alguma");
  const [previa, setPrevia] = useState<PreviaNaTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const comTags = modoDasTags === "todas" ? filtros.tags.todas : filtros.tags.alguma;
  const mudar = (mudanca: Partial<FiltroDeContatos>) => setFiltros((atual) => ({ ...atual, ...mudanca }));
  const mudarLinkedin = (mudanca: Partial<FiltroDeContatos["linkedin"]>) => setFiltros((atual) => ({ ...atual, linkedin: { ...atual.linkedin, ...mudanca } }));
  const mudarComTags = (ids: string[], modo = modoDasTags) =>
    mudar({ tags: { ...filtros.tags, todas: modo === "todas" ? ids : [], alguma: modo === "alguma" ? ids : [] } });

  // A prévia acompanha o filtro, sem esperar o salvar; espera a pessoa parar de mexer.
  useEffect(() => {
    let valido = true;
    const espera = setTimeout(async () => {
      try {
        const nova = await previaDoSegmentoDoPainel(filtros);
        if (valido) setPrevia(nova);
      } catch {
        if (valido) setPrevia(null);
      }
    }, 350);
    return () => {
      valido = false;
      clearTimeout(espera);
    };
  }, [filtros]);

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await salvarSegmentoDoPainel({ id: segmento.id, nome, filtros });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      router.push(`/contacts/segments?msg=${encodeURIComponent(segmento.id ? "Segmento salvo." : "Segmento criado.")}`);
    });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <section className="cartao flex flex-col gap-3 p-5">
          <label className="rotulo">
            Nome do segmento
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Clientes no WhatsApp" className="campo" />
          </label>
        </section>

        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-condicao-tags">
          <h2 id="titulo-condicao-tags" className="text-[15px] font-semibold">
            Tags
          </h2>
          {tags.length === 0 ? (
            <p className="text-[13px] text-tinta-suave">A organização ainda não tem tags.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-tinta-suave">
                  Têm
                  <select
                    aria-label="Como as tags valem"
                    value={modoDasTags}
                    onChange={(e) => {
                      const modo = e.target.value as "alguma" | "todas";
                      setModoDasTags(modo);
                      mudarComTags(comTags, modo);
                    }}
                    className="campo campo-pequeno w-auto"
                  >
                    <option value="alguma">pelo menos uma destas tags</option>
                    <option value="todas">todas estas tags</option>
                  </select>
                </div>
                <EscolherTags tags={tags} escolhidas={comTags} aoMudar={(ids) => mudarComTags(ids)} rotulo="Tags que os contatos têm" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-tinta-suave">Não têm nenhuma destas tags</p>
                <EscolherTags
                  tags={tags}
                  escolhidas={filtros.tags.nenhuma}
                  aoMudar={(ids) => mudar({ tags: { ...filtros.tags, nenhuma: ids } })}
                  rotulo="Tags que os contatos não têm"
                />
              </div>
            </>
          )}
        </section>

        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-condicao-canal">
          <h2 id="titulo-condicao-canal" className="text-[15px] font-semibold">
            Canal e origem
          </h2>
          <label className="rotulo max-w-sm">
            Canal
            <select
              value={filtros.canal ?? ""}
              onChange={(e) => mudar({ canal: (e.target.value || undefined) as FiltroDeContatos["canal"] })}
              className="campo campo-pequeno"
            >
              <option value="">Qualquer canal</option>
              {CANAIS_DO_FILTRO.map((canal) => (
                <option key={canal} value={canal}>
                  {ROTULO_DO_CANAL[canal]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            <legend className="mb-2 text-[13px] text-tinta-suave">Vieram de (qualquer um destes)</legend>
            {ORIGENS_DO_CONTATO.map((origem) => (
              <label key={origem} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4" checked={filtros.origens.includes(origem)} onChange={() => mudar({ origens: alternar(filtros.origens, origem) })} />
                {ROTULO_DA_ORIGEM[origem]}
              </label>
            ))}
          </fieldset>
        </section>

        {comLinkedin && (
          <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-condicao-linkedin">
            <h2 id="titulo-condicao-linkedin" className="text-[15px] font-semibold">
              LinkedIn
            </h2>
            <p className="-mt-2 text-[13px] text-tinta-suave">As condições daqui valem juntas para o mesmo lead da pessoa.</p>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
              <legend className="mb-2 text-[13px] text-tinta-suave">Etapa do Pipeline (qualquer uma destas)</legend>
              {COLUNAS_DO_PIPELINE.map((coluna) => (
                <label key={coluna.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={filtros.linkedin.etapas.includes(coluna.id)}
                    onChange={() => mudarLinkedin({ etapas: alternar<Etapa>(filtros.linkedin.etapas, coluna.id) })}
                  />
                  {coluna.rotulo}
                </label>
              ))}
            </fieldset>
            {campanhas.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] text-tinta-suave">Campanha (qualquer uma destas)</legend>
                {campanhas.map((campanha) => (
                  <label key={campanha.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={filtros.linkedin.campanhas.includes(campanha.id)}
                      onChange={() => mudarLinkedin({ campanhas: alternar(filtros.linkedin.campanhas, campanha.id) })}
                    />
                    {campanha.nome}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="rotulo w-48">
              Nota de aderência a partir de
              <input
                type="number"
                min={0}
                max={100}
                value={filtros.linkedin.notaMinima ?? ""}
                onChange={(e) => mudarLinkedin({ notaMinima: e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
                placeholder="qualquer"
                className="campo campo-pequeno"
              />
            </label>
          </section>
        )}

        <section className="cartao flex flex-wrap gap-4 p-5" aria-label="Texto e data">
          <label className="rotulo min-w-0 flex-1 basis-56">
            Com este texto no nome, na empresa ou no cargo
            <input value={filtros.texto ?? ""} onChange={(e) => mudar({ texto: e.target.value || undefined })} maxLength={100} className="campo campo-pequeno" />
          </label>
          <label className="rotulo">
            Entraram a partir de
            <input type="date" value={filtros.desde ?? ""} onChange={(e) => mudar({ desde: e.target.value || undefined })} className="campo campo-pequeno" />
          </label>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <section className="cartao flex flex-col gap-3 p-5" aria-live="polite" aria-labelledby="titulo-previa">
          <h2 id="titulo-previa" className="text-[15px] font-semibold">
            Agora
          </h2>
          {previa ? (
            <>
              <p className="text-3xl font-semibold tabular-nums">{previa.total.toLocaleString("pt-BR")}</p>
              <p className="text-[13px] text-tinta-suave">{previa.descricao}.</p>
              {previa.primeiros.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-linha pt-3 text-[13px]">
                  {previa.primeiros.map((c) => (
                    <li key={c.id} className="truncate">
                      {c.nome}
                      {c.empresa && <span className="text-tinta-fraca"> · {c.empresa}</span>}
                    </li>
                  ))}
                  {previa.total > previa.primeiros.length && (
                    <li className="text-tinta-fraca">e mais {(previa.total - previa.primeiros.length).toLocaleString("pt-BR")}</li>
                  )}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[13px] text-tinta-fraca">Contando…</p>
          )}
          <p className="text-xs text-tinta-fraca">Quem pediu para não ser contatado nunca entra. O segmento é recalculado sempre que é usado.</p>
        </section>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <button type="button" className="botao botao-primario" onClick={salvar} disabled={salvando || !nome.trim()}>
          <Save aria-hidden />
          {salvando ? "Salvando…" : "Salvar segmento"}
        </button>
      </aside>
    </div>
  );
}
