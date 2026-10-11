"use client";

import { Check, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { ListaDeFrases, Secao } from "@/components/campos-de-edicao";
import { NOME_DA_PRACA, PRACAS, type Praca, type Publico } from "@/domain/publico";
import { salvarPublicoDoPainel } from "./acoes";

/**
 * O público como formulário (§4.12). Provas só do dossiê confirmado: a lista
 * vem dele, e a prova que saiu do dossiê aparece marcada para alguém tirar.
 */
export function EditorDoPublico({
  id,
  inicial,
  status,
  provasDoDossie,
  destino,
}: {
  id: string | null;
  inicial: Publico;
  status: "novo" | "sugerido" | "ativo";
  provasDoDossie: string[];
  /** Para onde voltar depois de salvar. Sem ele, a página do público. */
  destino?: string;
}) {
  const router = useRouter();
  const [p, setP] = useState<Publico>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (parcial: Partial<Publico>) => {
    setErro(null);
    setP((atual) => ({ ...atual, ...parcial }));
  };

  const salvar = (ativar: boolean) =>
    iniciar(async () => {
      const resultado = await salvarPublicoDoPainel({ id, publico: p, ativar });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const msg = status === "novo" ? "Público criado e escolhido." : ativar ? "Público salvo e escolhido." : "Público salvo.";
      const base = destino ?? `/publicos/${resultado.id}`;
      router.push(`${base}${base.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
    });

  const alternarProva = (texto: string, marcada: boolean) =>
    mudar({ provas: marcada ? [...p.provas, texto] : p.provas.filter((prova) => prova !== texto) });
  const foraDoDossie = p.provas.filter((prova) => !provasDoDossie.includes(prova));

  return (
    <div className="grid gap-3">
      <Secao titulo="Nome" ajuda="Curto e concreto. Vira o nome da campanha e o nicho no RD.">
        <input value={p.nome} maxLength={80} aria-label="Nome" onChange={(e) => mudar({ nome: e.target.value })} className="campo" disabled={pendente} />
      </Secao>

      <Secao titulo="Quem" ajuda="Cargos como aparecem no LinkedIn. Eles viram as palavras da busca.">
        <ListaDeFrases
          nome="Cargo"
          itens={p.quem.cargos}
          maximo={10}
          maxCaracteres={80}
          aoMudar={(cargos) => mudar({ quem: { ...p.quem, cargos } })}
          desabilitado={pendente}
        />
        <label className="rotulo">
          Senioridade
          <input
            value={p.quem.senioridade}
            maxLength={200}
            placeholder="Quem decide ou influencia a compra"
            onChange={(e) => mudar({ quem: { ...p.quem, senioridade: e.target.value } })}
            className="campo"
            disabled={pendente}
          />
        </label>
      </Secao>

      <Secao titulo="Empresa">
        <p className="rotulo">Setores</p>
        <ListaDeFrases
          nome="Setor"
          itens={p.empresa.setores}
          maximo={8}
          maxCaracteres={80}
          aoMudar={(setores) => mudar({ empresa: { ...p.empresa, setores } })}
          desabilitado={pendente}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rotulo">
            Porte
            <input
              value={p.empresa.porte}
              maxLength={200}
              placeholder="50 a 500 funcionários"
              onChange={(e) => mudar({ empresa: { ...p.empresa, porte: e.target.value } })}
              className="campo"
              disabled={pendente}
            />
          </label>
          <label className="rotulo">
            Região
            <input
              value={p.empresa.regiao}
              maxLength={200}
              onChange={(e) => mudar({ empresa: { ...p.empresa, regiao: e.target.value } })}
              className="campo"
              disabled={pendente}
            />
          </label>
        </div>
        <label className="rotulo">
          Praça
          <select value={p.praca} onChange={(e) => mudar({ praca: e.target.value as Praca })} className="campo w-48" disabled={pendente}>
            {PRACAS.map((praca) => (
              <option key={praca} value={praca}>
                {NOME_DA_PRACA[praca]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-tinta-fraca">A praça define o idioma, as regras do país e quais contas do LinkedIn trabalham este público.</p>
      </Secao>

      <Secao titulo="Por que precisa" ajuda="O que o site não diz pode entrar aqui. Sem número e sem promessa no resultado.">
        <label className="rotulo">
          Dor
          <textarea
            value={p.por_que.dor}
            maxLength={400}
            rows={2}
            onChange={(e) => mudar({ por_que: { ...p.por_que, dor: e.target.value } })}
            className="campo"
            disabled={pendente}
          />
        </label>
        <label className="rotulo">
          O que faz agora ser a hora (opcional)
          <textarea
            value={p.por_que.gatilho}
            maxLength={400}
            rows={2}
            onChange={(e) => mudar({ por_que: { ...p.por_que, gatilho: e.target.value } })}
            className="campo"
            disabled={pendente}
          />
        </label>
        <label className="rotulo">
          Resultado
          <textarea
            value={p.por_que.resultado}
            maxLength={400}
            rows={2}
            onChange={(e) => mudar({ por_que: { ...p.por_que, resultado: e.target.value } })}
            className="campo"
            disabled={pendente}
          />
        </label>
      </Secao>

      <Secao titulo="Ângulo" ajuda="A ideia da abordagem em uma frase. Vai para a campanha e para o RD.">
        <textarea value={p.angulo} maxLength={300} rows={2} aria-label="Ângulo" onChange={(e) => mudar({ angulo: e.target.value })} className="campo" disabled={pendente} />
      </Secao>

      <Secao titulo="Provas" ajuda="Só as do dossiê confirmado. As mensagens deste público só citam o que estiver marcado.">
        {provasDoDossie.length === 0 && <p className="text-sm text-tinta-fraca">O dossiê não tem provas.</p>}
        {provasDoDossie.map((prova) => (
          <label key={prova} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={p.provas.includes(prova)} onChange={(e) => alternarProva(prova, e.target.checked)} disabled={pendente} className="mt-1" />
            {prova}
          </label>
        ))}
        {foraDoDossie.map((prova) => (
          <label key={prova} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked onChange={() => alternarProva(prova, false)} disabled={pendente} className="mt-1" />
            <span>
              {prova} <span className="etiqueta etiqueta-atencao">saiu do dossiê: desmarque para salvar</span>
            </span>
          </label>
        ))}
      </Secao>

      <Secao titulo="Quem não é" ajuda="Sinais de que a pessoa não serve, mesmo parecendo servir. A nota de aderência usa isto.">
        <textarea
          value={p.quem_nao_e}
          maxLength={400}
          rows={2}
          aria-label="Quem não é"
          onChange={(e) => mudar({ quem_nao_e: e.target.value })}
          className="campo"
          disabled={pendente}
        />
      </Secao>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t border-linha bg-fundo/90 py-4 backdrop-blur">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex flex-wrap items-center gap-2">
          {status === "sugerido" ? (
            <>
              <button type="button" className="botao botao-primario" onClick={() => salvar(true)} disabled={pendente}>
                <Check aria-hidden />
                Salvar e escolher
              </button>
              <button type="button" className="botao" onClick={() => salvar(false)} disabled={pendente}>
                <Save aria-hidden />
                Salvar sem escolher
              </button>
            </>
          ) : (
            <button type="button" className="botao botao-primario" onClick={() => salvar(false)} disabled={pendente}>
              <Check aria-hidden />
              {status === "novo" ? "Criar público" : "Salvar"}
            </button>
          )}
          <Link href={id ? `/publicos/${id}` : "/publicos"} className="botao">
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  );
}
