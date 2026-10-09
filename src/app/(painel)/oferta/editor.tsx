"use client";

import { Check, Plus, Save, Trash2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import type { Dossie } from "@/domain/dossie";
import { salvarDossieDoPainel } from "./acoes";

type Prova = Dossie["provas"][number];

const TIPOS_DE_PROVA: Record<Prova["tipo"], string> = {
  case: "Case",
  numero: "Número",
  cliente: "Cliente",
  depoimento: "Depoimento",
  selo: "Selo",
};

const IDIOMAS: Record<Dossie["idioma"], string> = { pt: "Português", en: "Inglês", es: "Espanhol" };

/** Troca o item `indice` da lista. */
const trocar = <T,>(lista: T[], indice: number, item: T) => lista.map((atual, i) => (i === indice ? item : atual));
const tirar = <T,>(lista: T[], indice: number) => lista.filter((_, i) => i !== indice);

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="cartao p-5">
      <h2 className="font-medium">{titulo}</h2>
      {ajuda && <p className="mt-0.5 text-xs text-tinta-fraca">{ajuda}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Remover({ rotulo, aoClicar, desabilitado }: { rotulo: string; aoClicar: () => void; desabilitado: boolean }) {
  return (
    <button type="button" className="botao botao-pequeno shrink-0 px-2" aria-label={rotulo} title={rotulo} onClick={aoClicar} disabled={desabilitado}>
      <Trash2 aria-hidden />
    </button>
  );
}

function Adicionar({ rotulo, aoClicar, desabilitado }: { rotulo: string; aoClicar: () => void; desabilitado: boolean }) {
  return (
    <button type="button" className="botao botao-pequeno self-start" onClick={aoClicar} disabled={desabilitado}>
      <Plus aria-hidden />
      {rotulo}
    </button>
  );
}

/** Lista de frases curtas (diferenciais, dores): uma linha por item. */
function ListaDeFrases({
  nome,
  itens,
  maximo,
  aoMudar,
  desabilitado,
}: {
  nome: string;
  itens: string[];
  maximo: number;
  aoMudar: (itens: string[]) => void;
  desabilitado: boolean;
}) {
  return (
    <>
      {itens.map((item, indice) => (
        <div key={indice} className="flex items-start gap-2">
          <input
            value={item}
            maxLength={200}
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

/**
 * O dossiê como formulário (§4.11). O humano corrige o que a IA leu, completa o
 * que o site não diz e confirma. Item deixado em branco é descartado ao salvar.
 */
export function EditorDoDossie({ inicial, desabilitado }: { inicial: Dossie; desabilitado: boolean }) {
  const [d, setD] = useState<Dossie>(inicial);
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const travado = desabilitado || pendente;

  const mudar = (parcial: Partial<Dossie>) => {
    setRetorno(null);
    setD((atual) => ({ ...atual, ...parcial }));
  };

  const enviar = (confirmar: boolean) =>
    iniciar(async () => {
      const resultado = await salvarDossieDoPainel({ dossie: d, confirmar });
      setRetorno(
        resultado.ok
          ? { tom: "ok", texto: confirmar ? "Dossiê confirmado. É ele que vale para os públicos." : "Rascunho salvo. Ainda não vale: falta confirmar." }
          : { tom: "erro", texto: resultado.erro },
      );
    });

  return (
    <div className="mt-5 grid gap-3">
      <Secao titulo="Empresa">
        <label className="rotulo">
          Nome
          <input value={d.empresa.nome} maxLength={80} onChange={(e) => mudar({ empresa: { ...d.empresa, nome: e.target.value } })} className="campo" disabled={travado} />
        </label>
        <label className="rotulo">
          Resumo
          <textarea
            value={d.empresa.resumo}
            maxLength={600}
            rows={3}
            onChange={(e) => mudar({ empresa: { ...d.empresa, resumo: e.target.value } })}
            className="campo"
            disabled={travado}
          />
        </label>
      </Secao>

      <Secao titulo="O que vocês vendem" ajuda="Pelo menos um produto ou serviço, até 8.">
        {d.produtos.map((produto, indice) => (
          <div key={indice} className="recuo flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <label className="rotulo flex-1">
                Nome
                <input
                  value={produto.nome}
                  maxLength={80}
                  onChange={(e) => mudar({ produtos: trocar(d.produtos, indice, { ...produto, nome: e.target.value }) })}
                  className="campo"
                  disabled={travado}
                />
              </label>
              <Remover rotulo={`Remover o produto ${indice + 1}`} aoClicar={() => mudar({ produtos: tirar(d.produtos, indice) })} desabilitado={travado} />
            </div>
            <label className="rotulo">
              Descrição
              <textarea
                value={produto.descricao}
                maxLength={400}
                rows={2}
                onChange={(e) => mudar({ produtos: trocar(d.produtos, indice, { ...produto, descricao: e.target.value }) })}
                className="campo"
                disabled={travado}
              />
            </label>
            <label className="rotulo">
              Para quem
              <input
                value={produto.para_quem}
                maxLength={300}
                onChange={(e) => mudar({ produtos: trocar(d.produtos, indice, { ...produto, para_quem: e.target.value }) })}
                className="campo"
                disabled={travado}
              />
            </label>
          </div>
        ))}
        {d.produtos.length < 8 && (
          <Adicionar
            rotulo="Adicionar produto"
            aoClicar={() => mudar({ produtos: [...d.produtos, { nome: "", descricao: "", para_quem: "" }] })}
            desabilitado={travado}
          />
        )}
      </Secao>

      <Secao titulo="Para quem">
        <textarea
          value={d.para_quem}
          maxLength={500}
          rows={2}
          aria-label="Para quem"
          onChange={(e) => mudar({ para_quem: e.target.value })}
          className="campo"
          disabled={travado}
        />
      </Secao>

      <Secao titulo="Por que escolhem vocês" ajuda="Diferenciais, até 8.">
        <ListaDeFrases nome="Diferencial" itens={d.diferenciais} maximo={8} aoMudar={(diferenciais) => mudar({ diferenciais })} desabilitado={travado} />
      </Secao>

      <Secao
        titulo="Provas"
        ajuda="Cases, números e clientes que dá para citar. A IA só usa o que estiver aqui. Prova que você escrever vale como fato."
      >
        {d.provas.map((prova, indice) => (
          <div key={indice} className="recuo flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <label className="rotulo">
                Tipo
                <select
                  value={prova.tipo}
                  onChange={(e) => mudar({ provas: trocar(d.provas, indice, { ...prova, tipo: e.target.value as Prova["tipo"] }) })}
                  className="campo"
                  disabled={travado}
                >
                  {Object.entries(TIPOS_DE_PROVA).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rotulo flex-1">
                Fonte (opcional)
                <input
                  value={prova.fonte_url ?? ""}
                  placeholder="https://"
                  onChange={(e) => mudar({ provas: trocar(d.provas, indice, { ...prova, fonte_url: e.target.value }) })}
                  className="campo"
                  disabled={travado}
                />
              </label>
              <Remover rotulo={`Remover a prova ${indice + 1}`} aoClicar={() => mudar({ provas: tirar(d.provas, indice) })} desabilitado={travado} />
            </div>
            <textarea
              value={prova.texto}
              maxLength={300}
              rows={2}
              aria-label={`Texto da prova ${indice + 1}`}
              onChange={(e) => mudar({ provas: trocar(d.provas, indice, { ...prova, texto: e.target.value }) })}
              className="campo"
              disabled={travado}
            />
          </div>
        ))}
        {d.provas.length === 0 && <p className="text-sm text-tinta-fraca">Nenhuma prova. Sem prova, as mensagens não citam resultado.</p>}
        {d.provas.length < 12 && (
          <Adicionar
            rotulo="Adicionar prova"
            aoClicar={() => mudar({ provas: [...d.provas, { tipo: "case", texto: "", fonte_url: null }] })}
            desabilitado={travado}
          />
        )}
      </Secao>

      <Secao titulo="Dores que vocês resolvem" ajuda="Até 8.">
        <ListaDeFrases nome="Dor" itens={d.dores} maximo={8} aoMudar={(dores) => mudar({ dores })} desabilitado={travado} />
      </Secao>

      <Secao titulo="Objeções prováveis" ajuda="O que o cliente diz para não comprar, e o que vocês respondem. Até 8.">
        {d.objecoes.map((objecao, indice) => (
          <div key={indice} className="recuo flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <label className="rotulo flex-1">
                Objeção
                <input
                  value={objecao.objecao}
                  maxLength={200}
                  onChange={(e) => mudar({ objecoes: trocar(d.objecoes, indice, { ...objecao, objecao: e.target.value }) })}
                  className="campo"
                  disabled={travado}
                />
              </label>
              <Remover rotulo={`Remover a objeção ${indice + 1}`} aoClicar={() => mudar({ objecoes: tirar(d.objecoes, indice) })} desabilitado={travado} />
            </div>
            <label className="rotulo">
              Resposta
              <textarea
                value={objecao.resposta}
                maxLength={300}
                rows={2}
                onChange={(e) => mudar({ objecoes: trocar(d.objecoes, indice, { ...objecao, resposta: e.target.value }) })}
                className="campo"
                disabled={travado}
              />
            </label>
          </div>
        ))}
        {d.objecoes.length < 8 && (
          <Adicionar
            rotulo="Adicionar objeção"
            aoClicar={() => mudar({ objecoes: [...d.objecoes, { objecao: "", resposta: "" }] })}
            desabilitado={travado}
          />
        )}
      </Secao>

      <Secao titulo="Tom de voz">
        <textarea
          value={d.tom_de_voz}
          maxLength={600}
          rows={3}
          aria-label="Tom de voz"
          onChange={(e) => mudar({ tom_de_voz: e.target.value })}
          className="campo"
          disabled={travado}
        />
        <label className="rotulo">
          Idioma do site
          <select value={d.idioma} onChange={(e) => mudar({ idioma: e.target.value as Dossie["idioma"] })} className="campo w-48" disabled={travado}>
            {Object.entries(IDIOMAS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </Secao>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t border-linha bg-fundo/90 py-4 backdrop-blur">
        {retorno && <Aviso tom={retorno.tom}>{retorno.texto}</Aviso>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="botao botao-primario" onClick={() => enviar(true)} disabled={travado}>
            <Check aria-hidden />
            Confirmar dossiê
          </button>
          <button type="button" className="botao" onClick={() => enviar(false)} disabled={travado}>
            <Save aria-hidden />
            Salvar rascunho
          </button>
          <span className="text-xs text-tinta-fraca">Só o dossiê confirmado vale para os públicos e as mensagens.</span>
        </div>
      </div>
    </div>
  );
}
