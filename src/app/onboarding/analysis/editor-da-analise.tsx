"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import type { Dossie } from "@/domain/dossie";
import type { ResultadoDaEdicao } from "@/server/oferta/oferta";
import { confirmarAnaliseNoPrimeiroAcesso, salvarAnalise } from "../acoes";
import { ListaDeFrases, ListaEditavel, TextoEditavel } from "./itens";

type Prova = Dossie["provas"][number];

const TIPOS_DE_PROVA: Record<Prova["tipo"], string> = {
  case: "Case",
  numero: "Número",
  cliente: "Cliente",
  depoimento: "Depoimento",
  selo: "Selo",
};

const IDIOMAS: Record<Dossie["idioma"], string> = { pt: "Português", en: "Inglês", es: "Espanhol" };

/** Negócio, Produto e Mercado: os dois primeiros são fato do site, o terceiro é hipótese (§4.2). */
function Bloco({ titulo, origem, hipotese, children }: { titulo: string; origem: string; hipotese?: boolean; children: ReactNode }) {
  return (
    <section
      className={
        hipotese ? "rounded-[1.125rem] border border-dashed border-destaque/40 bg-destaque/[0.03] p-6" : "cartao p-6"
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-medium tracking-tight">{titulo}</h2>
        <span className={hipotese ? "etiqueta etiqueta-destaque" : "etiqueta"}>{origem}</span>
      </header>
      <div className="mt-6 flex flex-col gap-7">{children}</div>
    </section>
  );
}

function Grupo({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-tinta-fraca">{titulo}</h3>
      {ajuda && <p className="mt-1 text-xs text-tinta-fraca">{ajuda}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

type Salvamento = { tipo: "salvando" } | { tipo: "salvo" } | { tipo: "confirmado" } | { tipo: "erro"; texto: string } | null;

/**
 * A análise do site para corrigir item a item (§4.2). Cada correção grava na
 * hora como rascunho; "Está certo, seguir" confirma e leva ao SDR.
 */
export function EditorDaAnalise({
  inicial,
  confirmarAnalise = confirmarAnaliseNoPrimeiroAcesso,
  rotuloDeConfirmar = "Está certo, seguir",
}: {
  inicial: Dossie;
  /** No primeiro acesso, confirma e segue para o SDR; em Configurações, só confirma. */
  confirmarAnalise?: (entrada: { dossie: unknown }) => Promise<ResultadoDaEdicao>;
  rotuloDeConfirmar?: string;
}) {
  const [d, setD] = useState<Dossie>(inicial);
  const [salvamento, setSalvamento] = useState<Salvamento>(null);
  const [, iniciarSalvamento] = useTransition();
  const [confirmando, iniciarConfirmacao] = useTransition();

  const mudar = (parcial: Partial<Dossie>) => {
    const novo = { ...d, ...parcial };
    setD(novo);
    setSalvamento({ tipo: "salvando" });
    iniciarSalvamento(async () => {
      const resultado = await salvarAnalise({ dossie: novo });
      setSalvamento(resultado.ok ? { tipo: "salvo" } : { tipo: "erro", texto: resultado.erro });
    });
  };
  const mudarMercado = (parcial: Partial<Dossie["mercado"]>) => mudar({ mercado: { ...d.mercado, ...parcial } });

  const confirmar = () =>
    iniciarConfirmacao(async () => {
      const resultado = await confirmarAnalise({ dossie: d });
      if (resultado && !resultado.ok) setSalvamento({ tipo: "erro", texto: resultado.erro });
      else if (resultado?.ok) setSalvamento({ tipo: "confirmado" });
    });

  const travado = confirmando;

  return (
    <div className="mt-10 flex flex-col gap-5">
      <Bloco titulo="Negócio" origem="do seu site">
        <Grupo titulo="Empresa">
          <TextoEditavel
            nome="o nome da empresa"
            valor={d.empresa.nome}
            max={80}
            ver={(nome) => <p className="text-lg font-medium">{nome}</p>}
            aoMudar={(nome) => mudar({ empresa: { ...d.empresa, nome } })}
            desabilitado={travado}
          />
          <div className="mt-2">
            <TextoEditavel
              nome="o resumo"
              valor={d.empresa.resumo}
              max={600}
              multilinha
              ver={(resumo) => <p className="text-tinta-suave">{resumo}</p>}
              aoMudar={(resumo) => mudar({ empresa: { ...d.empresa, resumo } })}
              desabilitado={travado}
            />
          </div>
        </Grupo>
        <Grupo titulo="Para quem">
          <TextoEditavel
            nome="para quem"
            valor={d.para_quem}
            max={500}
            multilinha
            aoMudar={(para_quem) => mudar({ para_quem })}
            desabilitado={travado}
          />
        </Grupo>
        <Grupo titulo="Como vocês falam">
          <TextoEditavel
            nome="o tom de voz"
            valor={d.tom_de_voz}
            max={600}
            multilinha
            aoMudar={(tom_de_voz) => mudar({ tom_de_voz })}
            desabilitado={travado}
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-tinta-suave">
            Idioma do site
            <select
              value={d.idioma}
              onChange={(e) => mudar({ idioma: e.target.value as Dossie["idioma"] })}
              className="campo campo-pequeno w-36"
              disabled={travado}
            >
              {Object.entries(IDIOMAS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
        </Grupo>
      </Bloco>

      <Bloco titulo="Produto" origem="do seu site">
        <Grupo titulo="O que vocês vendem">
          <ListaEditavel
            nome="produto"
            itens={d.produtos}
            minimo={1}
            maximo={8}
            campos={[
              { chave: "nome", rotulo: "Nome", max: 80, obrigatorio: true },
              { chave: "descricao", rotulo: "O que é", max: 400, obrigatorio: true, multilinha: true },
              { chave: "para_quem", rotulo: "Para quem", max: 300 },
            ]}
            ver={(produto) => (
              <>
                <p className="font-medium">{produto.nome}</p>
                <p className="text-sm text-tinta-suave">{produto.descricao}</p>
                {produto.para_quem && <p className="mt-0.5 text-xs text-tinta-fraca">Para {produto.para_quem}</p>}
              </>
            )}
            novo={() => ({ nome: "", descricao: "", para_quem: "" })}
            aoMudar={(produtos) => mudar({ produtos })}
            desabilitado={travado}
          />
        </Grupo>
        <Grupo titulo="Por que escolhem vocês">
          <ListaDeFrases
            nome="diferencial"
            itens={d.diferenciais}
            maximo={8}
            aoMudar={(diferenciais) => mudar({ diferenciais })}
            desabilitado={travado}
            vazio="O site não diz. Se souber, adicione."
          />
        </Grupo>
        <Grupo titulo="Provas" ajuda="O SDR só cita resultado que estiver aqui.">
          <ListaEditavel<Prova>
            nome="prova"
            itens={d.provas}
            maximo={12}
            campos={[
              { chave: "tipo", rotulo: "Tipo", opcoes: TIPOS_DE_PROVA },
              { chave: "texto", rotulo: "Prova", max: 300, obrigatorio: true, multilinha: true },
              { chave: "fonte_url", rotulo: "Onde está (opcional)", placeholder: "https://", vazioViraNull: true },
            ]}
            ver={(prova) => (
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="etiqueta">{TIPOS_DE_PROVA[prova.tipo]}</span>
                <span>{prova.texto}</span>
                {prova.fonte_url && (
                  <a href={prova.fonte_url} target="_blank" rel="noreferrer" className="text-tinta-fraca hover:text-tinta" title="Ver no site">
                    <ExternalLink className="inline size-3.5" aria-label="Ver no site" />
                  </a>
                )}
              </p>
            )}
            novo={() => ({ tipo: "case", texto: "", fonte_url: null })}
            aoMudar={(provas) => mudar({ provas })}
            desabilitado={travado}
            vazio="Nenhuma prova no site. Sem prova, o SDR não cita resultado."
          />
        </Grupo>
        <Grupo titulo="O que vocês resolvem">
          <ListaDeFrases nome="dor" itens={d.dores} maximo={8} aoMudar={(dores) => mudar({ dores })} desabilitado={travado} />
        </Grupo>
      </Bloco>

      <Bloco titulo="Mercado" origem="hipótese do Kakou" hipotese>
        <p className="-mt-2 text-sm text-tinta-suave">
          O site não diz isso: é a nossa leitura de quem compra. Corrija com o que você sabe do seu mercado.
        </p>
        <Grupo titulo="Quem compra">
          <ListaEditavel
            nome="segmento"
            itens={d.mercado.segmentos}
            maximo={5}
            campos={[
              { chave: "nome", rotulo: "Segmento", max: 80, obrigatorio: true },
              { chave: "por_que", rotulo: "Por que compra", max: 300, obrigatorio: true, multilinha: true },
            ]}
            ver={(segmento) => (
              <>
                <p className="font-medium">{segmento.nome}</p>
                <p className="text-sm text-tinta-suave">{segmento.por_que}</p>
              </>
            )}
            novo={() => ({ nome: "", por_que: "" })}
            aoMudar={(segmentos) => mudarMercado({ segmentos })}
            desabilitado={travado}
            vazio="Ainda sem segmentos. Adicione quem mais compra de vocês."
          />
        </Grupo>
        <Grupo titulo="O que usam hoje no lugar">
          <ListaDeFrases
            nome="alternativa"
            itens={d.mercado.alternativas}
            maximo={6}
            aoMudar={(alternativas) => mudarMercado({ alternativas })}
            desabilitado={travado}
          />
        </Grupo>
        <Grupo titulo="O que faz ser a hora de comprar">
          <ListaDeFrases
            nome="gatilho"
            itens={d.mercado.gatilhos}
            maximo={6}
            aoMudar={(gatilhos) => mudarMercado({ gatilhos })}
            desabilitado={travado}
          />
        </Grupo>
        <Grupo titulo="O que dizem para não comprar">
          <ListaEditavel
            nome="objeção"
            itens={d.objecoes}
            maximo={8}
            campos={[
              { chave: "objecao", rotulo: "Objeção", max: 200, obrigatorio: true },
              { chave: "resposta", rotulo: "Como vocês respondem", max: 300, obrigatorio: true, multilinha: true },
            ]}
            ver={(objecao) => (
              <>
                <p>“{objecao.objecao}”</p>
                <p className="text-sm text-tinta-suave">{objecao.resposta}</p>
              </>
            )}
            novo={() => ({ objecao: "", resposta: "" })}
            aoMudar={(objecoes) => mudar({ objecoes })}
            desabilitado={travado}
          />
        </Grupo>
      </Bloco>

      <div className="sticky bottom-0 -mx-5 mt-3 flex flex-col gap-3 border-t border-linha bg-fundo/90 px-5 py-4 backdrop-blur">
        {salvamento?.tipo === "erro" && <Aviso tom="erro">{salvamento.texto}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="botao botao-primario" onClick={confirmar} disabled={confirmando}>
            {confirmando ? "Confirmando..." : rotuloDeConfirmar}
            <ArrowRight aria-hidden />
          </button>
          <span className="text-xs text-tinta-fraca" aria-live="polite">
            {salvamento?.tipo === "salvando"
              ? "Salvando a correção..."
              : salvamento?.tipo === "salvo"
                ? "Correção salva. Vale depois de confirmar."
                : salvamento?.tipo === "confirmado"
                  ? "Análise confirmada. O SDR e as próximas abordagens já usam esta versão."
                  : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
