"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { Adicionar, ListaDeFrases, Remover, Secao } from "@/components/campos-de-edicao";
import type { Sdr } from "@/domain/sdr";
import { salvarSdrDoPainel } from "../acoes";

/**
 * Os campos do SDR (§4.3), editáveis. Salvar valida e grava uma versão nova:
 * dá para voltar no histórico. As regras da casa ficam por cima e não moram
 * aqui.
 */
export function EditorDoSdr({ inicial }: { inicial: Sdr }) {
  const [s, setS] = useState<Sdr>(inicial);
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudar = (parcial: Partial<Sdr>) => {
    setRetorno(null);
    setS((atual) => ({ ...atual, ...parcial }));
  };

  const salvar = () =>
    iniciar(async () => {
      const resultado = await salvarSdrDoPainel({ sdr: s });
      setRetorno(resultado.ok ? { tom: "ok", texto: `Salvo como versão ${resultado.versao}. Vale para a próxima resposta.` } : { tom: "erro", texto: resultado.erro });
    });

  return (
    <div className="grid gap-3">
      <Secao titulo="Objetivo" ajuda="O que conta como sucesso. Ex.: marcar 20 minutos com você.">
        <input value={s.objetivo} maxLength={300} aria-label="Objetivo" onChange={(e) => mudar({ objetivo: e.target.value })} className="campo" disabled={pendente} />
      </Secao>
      <Secao titulo="Voz" ajuda="Como você fala: tom, tratamento, o que soa como você.">
        <textarea value={s.voz} maxLength={600} rows={3} aria-label="Voz" onChange={(e) => mudar({ voz: e.target.value })} className="campo" disabled={pendente} />
      </Secao>
      <Secao titulo="Abertura" ajuda="O jeito da primeira mensagem depois do convite aceito.">
        <textarea value={s.abertura} maxLength={400} rows={3} aria-label="Abertura" onChange={(e) => mudar({ abertura: e.target.value })} className="campo" disabled={pendente} />
      </Secao>
      <Secao titulo="Qualificação" ajuda="Os sinais e as perguntas que mostram que o lead serve.">
        <ListaDeFrases nome="Sinal" itens={s.qualificacao} maximo={6} aoMudar={(qualificacao) => mudar({ qualificacao })} desabilitado={pendente} />
      </Secao>
      <Secao titulo="Objeções" ajuda="O que costumam dizer e como responder.">
        {s.objecoes.map((item, indice) => (
          <div key={indice} className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <input
                value={item.objecao}
                maxLength={200}
                placeholder="A objeção"
                aria-label={`Objeção ${indice + 1}`}
                onChange={(e) => mudar({ objecoes: s.objecoes.map((o, i) => (i === indice ? { ...o, objecao: e.target.value } : o)) })}
                className="campo"
                disabled={pendente}
              />
              <input
                value={item.resposta}
                maxLength={300}
                placeholder="Como responder"
                aria-label={`Resposta à objeção ${indice + 1}`}
                onChange={(e) => mudar({ objecoes: s.objecoes.map((o, i) => (i === indice ? { ...o, resposta: e.target.value } : o)) })}
                className="campo"
                disabled={pendente}
              />
            </div>
            <Remover rotulo={`Tirar a objeção ${indice + 1}`} aoClicar={() => mudar({ objecoes: s.objecoes.filter((_, i) => i !== indice) })} desabilitado={pendente} />
          </div>
        ))}
        {s.objecoes.length < 8 && (
          <Adicionar rotulo="Adicionar objeção" aoClicar={() => mudar({ objecoes: [...s.objecoes, { objecao: "", resposta: "" }] })} desabilitado={pendente} />
        )}
      </Secao>
      <Secao titulo="Regras" ajuda='As suas regras. Ex.: "não falo de preço por mensagem".'>
        <ListaDeFrases nome="Regra" itens={s.regras} maximo={12} aoMudar={(regras) => mudar({ regras })} desabilitado={pendente} />
      </Secao>
      <Secao titulo="Quando chamar você" ajuda="O que faz o SDR parar e passar a conversa para você. Preço, reclamação e dúvida já chamam sempre.">
        <ListaDeFrases nome="Caso" itens={s.quando_chamar_voce} maximo={8} aoMudar={(quando_chamar_voce) => mudar({ quando_chamar_voce })} desabilitado={pendente} />
      </Secao>
      <Secao titulo="Link de agenda" ajuda="Vai só depois que o lead aceitar conversar. Sem link, o SDR chama você na hora de marcar.">
        <input
          type="url"
          value={s.link_agenda ?? ""}
          placeholder="https://cal.com/voce"
          aria-label="Link de agenda"
          onChange={(e) => mudar({ link_agenda: e.target.value.trim() || null })}
          className="campo"
          disabled={pendente}
        />
      </Secao>
      {retorno && <Aviso tom={retorno.tom}>{retorno.texto}</Aviso>}
      <div className="flex justify-end">
        <button type="button" className="botao botao-primario" onClick={salvar} disabled={pendente}>
          <Save aria-hidden />
          {pendente ? "Salvando..." : "Salvar o SDR"}
        </button>
      </div>
    </div>
  );
}
