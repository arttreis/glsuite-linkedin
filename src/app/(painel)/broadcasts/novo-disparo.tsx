"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import {
  CAMPOS_DO_CONTATO,
  idDaVariavel,
  preencherTemplate,
  ROTULO_DO_CAMPO,
  rotuloDaVariavel,
  variaveisDoTemplate,
  type CampoDoContato,
  type FonteDaVariavel,
  type TemplateDoWhatsapp,
  type TipoDeCanal,
} from "@/domain/disparos";
import { salvarRascunhoDoPainel } from "./acoes";

export type CanalParaEscolher = { tipo: TipoDeCanal; nome: string; templates: TemplateDoWhatsapp[] };
type Segmento = { id: string; nome: string; contatos: number };

/** Para a prévia: um contato de exemplo, para a pessoa ver o texto como chega. */
const EXEMPLO = { nome: "Ana Souza", primeiroNome: "Ana", empresa: "Acme", cargo: "Diretora de Marketing" };

const TEXTO_FIXO = "texto";

/**
 * Novo disparo (§4.18): o canal, o segmento e a mensagem. No WhatsApp, o
 * template aprovado e de onde vem cada variável. Continuar guarda o rascunho e
 * abre a conferência: nada sai daqui.
 */
export function NovoDisparo({
  canais,
  segmentos,
  rascunho,
}: {
  canais: CanalParaEscolher[];
  segmentos: Segmento[];
  rascunho: { id: string; nome: string; canal: TipoDeCanal; segmentoId: string | null; templateId: string | null; variaveis: Record<string, FonteDaVariavel> } | null;
}) {
  const router = useRouter();
  const [canal, setCanal] = useState<TipoDeCanal>(rascunho?.canal ?? canais[0]!.tipo);
  const [nome, setNome] = useState(rascunho?.nome ?? "");
  const [segmentoId, setSegmentoId] = useState(rascunho?.segmentoId ?? segmentos[0]?.id ?? "");
  const aprovados = canais.find((c) => c.tipo === canal)?.templates.filter((t) => t.status === "APPROVED") ?? [];
  const [templateId, setTemplateId] = useState(rascunho?.templateId ?? aprovados[0]?.id ?? "");
  const [variaveis, setVariaveis] = useState<Record<string, FonteDaVariavel>>(rascunho?.variaveis ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const template = aprovados.find((t) => t.id === templateId) ?? null;
  const pedidas = template ? variaveisDoTemplate(template) : [];
  const previa = template ? preencherTemplate({ tipo: "whatsapp", template, variaveis }, EXEMPLO) : null;
  const faltando = pedidas
    .filter((variavel) => {
      const fonte = variaveis[idDaVariavel(variavel)];
      return !fonte || ("texto" in fonte && !fonte.texto.trim());
    })
    .map(rotuloDaVariavel);

  const escolherTemplate = (id: string) => {
    setTemplateId(id);
    // Sugestão: a primeira variável do texto costuma ser o primeiro nome.
    const novo = aprovados.find((t) => t.id === id);
    const sugeridas: Record<string, FonteDaVariavel> = {};
    for (const variavel of novo ? variaveisDoTemplate(novo) : []) {
      if (variavel.onde === "corpo" && Object.keys(sugeridas).length === 0) sugeridas[idDaVariavel(variavel)] = { campo: "primeiro_nome" };
    }
    setVariaveis(sugeridas);
  };

  const continuar = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await salvarRascunhoDoPainel({
        id: rascunho?.id ?? null,
        canal,
        nome,
        segmentoId,
        conteudo: { tipo: "whatsapp", templateId, variaveis },
      });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      router.push(`/broadcasts/${resultado.id}`);
    });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <section className="cartao flex flex-col gap-4 p-5">
          {canais.length > 1 && (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-[13px] text-tinta-suave">Canal</legend>
              {canais.map((c) => (
                <label key={c.tipo} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="canal" className="size-4" checked={canal === c.tipo} onChange={() => setCanal(c.tipo)} />
                  {c.nome}
                </label>
              ))}
            </fieldset>
          )}
          <label className="rotulo">
            Nome do disparo (só a equipe vê)
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Oferta de outubro para clientes" className="campo" />
          </label>
          <label className="rotulo">
            Para quem
            {segmentos.length === 0 ? (
              <span className="text-[13px] text-tinta-suave">
                Crie um segmento antes, em{" "}
                <Link href="/contacts/segments/new" className="link">
                  Contatos &gt; Segmentos
                </Link>
                .
              </span>
            ) : (
              <select value={segmentoId} onChange={(e) => setSegmentoId(e.target.value)} className="campo">
                {segmentos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} ({s.contatos.toLocaleString("pt-BR")} {s.contatos === 1 ? "contato" : "contatos"})
                  </option>
                ))}
              </select>
            )}
          </label>
        </section>

        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-mensagem">
          <h2 id="titulo-mensagem" className="text-[15px] font-semibold">
            A mensagem
          </h2>
          {aprovados.length === 0 ? (
            <p className="text-[13px] text-tinta-suave">
              Nenhum template aprovado. Crie no WhatsApp Manager da Meta e atualize em{" "}
              <Link href="/settings/whatsapp" className="link">
                Configurações &gt; WhatsApp
              </Link>
              .
            </p>
          ) : (
            <>
              <label className="rotulo">
                Template aprovado
                <select value={templateId} onChange={(e) => escolherTemplate(e.target.value)} className="campo">
                  {aprovados.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} · {t.idioma}
                    </option>
                  ))}
                </select>
              </label>
              {pedidas.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] text-tinta-suave">De onde vem cada variável. Contato sem o campo fica de fora, com o motivo.</p>
                  {pedidas.map((variavel) => {
                    const id = idDaVariavel(variavel);
                    const fonte = variaveis[id];
                    const valorDoSeletor = variavel.onde === "midia" ? TEXTO_FIXO : fonte && "campo" in fonte ? fonte.campo : fonte ? TEXTO_FIXO : "";
                    return (
                      <div key={id} className="flex flex-col gap-1.5 rounded-xl bg-superficie-alta p-3">
                        <span className="text-xs text-tinta-fraca">{rotuloDaVariavel(variavel)}</span>
                        <div className="flex flex-wrap gap-2">
                          {variavel.onde !== "midia" && (
                            <select
                              aria-label={`De onde vem ${rotuloDaVariavel(variavel)}`}
                              value={valorDoSeletor}
                              onChange={(e) =>
                                setVariaveis((atual) => ({
                                  ...atual,
                                  [id]: e.target.value === TEXTO_FIXO ? { texto: "" } : { campo: e.target.value as CampoDoContato },
                                }))
                              }
                              className="campo campo-pequeno w-auto"
                            >
                              <option value="" disabled>
                                Escolha
                              </option>
                              {CAMPOS_DO_CONTATO.map((campo) => (
                                <option key={campo} value={campo}>
                                  {ROTULO_DO_CAMPO[campo]} do contato
                                </option>
                              ))}
                              <option value={TEXTO_FIXO}>Texto igual para todos</option>
                            </select>
                          )}
                          {(variavel.onde === "midia" || (fonte && "texto" in fonte)) && (
                            <input
                              aria-label={`Texto de ${rotuloDaVariavel(variavel)}`}
                              value={fonte && "texto" in fonte ? fonte.texto : ""}
                              onChange={(e) => setVariaveis((atual) => ({ ...atual, [id]: { texto: e.target.value } }))}
                              placeholder={variavel.onde === "midia" ? "https://… (link público do arquivo)" : "O texto"}
                              className="campo campo-pequeno min-w-0 flex-1"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-como-chega">
          <h2 id="titulo-como-chega" className="text-[15px] font-semibold">
            Como chega (exemplo)
          </h2>
          {previa?.ok ? (
            <p className="whitespace-pre-line rounded-xl bg-superficie-alta p-3 text-sm">{previa.texto}</p>
          ) : (
            <p className="text-[13px] text-tinta-suave">
              {faltando.length > 0 ? `Falta dizer de onde vem: ${faltando.join(", ")}.` : "Escolha um template."}
            </p>
          )}
          <p className="text-xs text-tinta-fraca">Com um contato de exemplo (Ana, da Acme). Na próxima tela você vê quem recebe e quem fica de fora.</p>
        </section>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <button
          type="button"
          className="botao botao-primario"
          onClick={continuar}
          disabled={salvando || !nome.trim() || !segmentoId || !template || !previa?.ok}
        >
          {salvando ? "Guardando…" : "Conferir quem recebe"}
          <ArrowRight aria-hidden />
        </button>
        <p className="text-xs text-tinta-fraca">Nada sai ainda. A próxima tela mostra tudo antes de você confirmar.</p>
      </aside>
    </div>
  );
}
