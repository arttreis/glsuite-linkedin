"use client";

import { Plus, Save, X } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Aviso } from "@/components/aviso";
import { MAX_PERGUNTA, MAX_PERGUNTAS, MAX_PRECO, MAX_RESPOSTA, MAX_SDR_SABE, type PerguntaFrequente } from "@/domain/lancamentos";
import { salvarSdrDoLancamentoDoPainel } from "../../acoes";

type Dados = { preco: string; perguntas: PerguntaFrequente[]; sdrSabe: string; linkDoCarrinho: string };
type LinhaDaPergunta = PerguntaFrequente & { chave: number };

/**
 * O que o SDR sabe do lançamento (§4.21): o preço e as condições, as
 * perguntas frequentes, o resto (até 2.000 caracteres) e o link do carrinho.
 */
export function FormularioDoSdr({ id, inicial }: { id: string; inicial: Dados }) {
  const proxima = useRef(inicial.perguntas.length);
  const [preco, setPreco] = useState(inicial.preco);
  const [perguntas, setPerguntas] = useState<LinhaDaPergunta[]>(inicial.perguntas.map((p, chave) => ({ ...p, chave })));
  const [sdrSabe, setSdrSabe] = useState(inicial.sdrSabe);
  const [linkDoCarrinho, setLinkDoCarrinho] = useState(inicial.linkDoCarrinho);
  const [retorno, setRetorno] = useState<{ ok: true } | { ok: false; erro: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const mudarPergunta = (chave: number, mudanca: Partial<LinhaDaPergunta>) =>
    setPerguntas((atuais) => atuais.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p)));
  const adicionarPergunta = () => {
    const chave = proxima.current++;
    setPerguntas((atuais) => [...atuais, { chave, pergunta: "", resposta: "" }]);
  };
  const mexeu = () => setRetorno(null);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    iniciar(async () => {
      setRetorno(null);
      const resultado = await salvarSdrDoLancamentoDoPainel(id, {
        preco,
        perguntas: perguntas.map(({ pergunta, resposta }) => ({ pergunta, resposta })),
        sdrSabe,
        linkDoCarrinho,
      });
      setRetorno(resultado.ok ? { ok: true } : { ok: false, erro: resultado.erro });
    });
  };

  return (
    <form onSubmit={enviar} onChange={mexeu} noValidate className="flex max-w-3xl flex-col gap-5">
      <p className="text-[13px] text-tinta-suave">O que o SDR precisa saber deste lançamento para responder quem chega por ele.</p>

      <section className="cartao flex flex-col gap-2 p-5">
        <label className="rotulo">
          Preço e condições
          <textarea
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            maxLength={MAX_PRECO}
            rows={3}
            placeholder="Ex.: R$ 997 à vista ou 12x de R$ 97. Garantia de 7 dias."
            className="campo"
          />
        </label>
      </section>

      <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-perguntas">
        <h2 id="titulo-perguntas" className="text-[15px] font-semibold">
          Perguntas frequentes
        </h2>
        {perguntas.length === 0 && <p className="text-[13px] text-tinta-suave">Nenhuma ainda. O que as pessoas mais perguntam antes de comprar?</p>}
        {perguntas.map((linha, indice) => (
          <div key={linha.chave} className="flex flex-col gap-2 rounded-xl bg-superficie-alta p-3">
            <label className="rotulo">
              Pergunta {indice + 1}
              <input value={linha.pergunta} onChange={(e) => mudarPergunta(linha.chave, { pergunta: e.target.value })} maxLength={MAX_PERGUNTA} className="campo campo-pequeno" />
            </label>
            <label className="rotulo">
              Resposta
              <textarea
                value={linha.resposta}
                onChange={(e) => mudarPergunta(linha.chave, { resposta: e.target.value })}
                maxLength={MAX_RESPOSTA}
                rows={2}
                className="campo campo-pequeno"
              />
            </label>
            <button
              type="button"
              className="botao botao-pequeno w-fit"
              onClick={() => {
                mexeu();
                setPerguntas((atuais) => atuais.filter((p) => p.chave !== linha.chave));
              }}
              aria-label={`Tirar a pergunta ${indice + 1}`}
            >
              <X aria-hidden />
              Tirar
            </button>
          </div>
        ))}
        {perguntas.length < MAX_PERGUNTAS && (
          <button
            type="button"
            className="botao botao-pequeno w-fit"
            onClick={() => {
              mexeu();
              adicionarPergunta();
            }}
          >
            <Plus aria-hidden />
            Adicionar pergunta
          </button>
        )}
      </section>

      <section className="cartao flex flex-col gap-2 p-5">
        <label className="rotulo">
          O que mais o SDR precisa saber
          <textarea
            value={sdrSabe}
            onChange={(e) => setSdrSabe(e.target.value)}
            rows={6}
            aria-describedby="contador-sdr-sabe"
            placeholder="Para quem é, o que não é, o bônus de quem compra na abertura..."
            className="campo"
          />
        </label>
        <p id="contador-sdr-sabe" className={`text-xs tabular-nums ${sdrSabe.length > MAX_SDR_SABE ? "text-erro" : "text-tinta-fraca"}`} aria-live="polite">
          {sdrSabe.length.toLocaleString("pt-BR")} de {MAX_SDR_SABE.toLocaleString("pt-BR")}
        </p>
      </section>

      <section className="cartao flex flex-col gap-2 p-5">
        <label className="rotulo">
          Link do carrinho
          <input type="url" value={linkDoCarrinho} onChange={(e) => setLinkDoCarrinho(e.target.value)} placeholder="https://" className="campo" />
        </label>
      </section>

      {retorno && !retorno.ok && <Aviso tom="erro">{retorno.erro}</Aviso>}
      {retorno?.ok && <Aviso tom="ok">Salvo.</Aviso>}
      <button type="submit" className="botao botao-primario w-fit" disabled={salvando}>
        <Save aria-hidden />
        {salvando ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
