"use client";

import { Lock, MessagesSquare, Save } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { ListaDeFrases } from "@/components/campos-de-edicao";
import { CAUTELA_PADRAO, CAUTELAS, NIVEIS_DE_CAUTELA, SEMPRE_CHAMA, type Cautela } from "@/domain/passagem";
import { salvarPassagemDoPainel } from "../acoes";

/**
 * Quando o SDR passa a conversa para você (§4.7), numa seção só: o que sempre
 * chama, os casos da pessoa e o quanto ele arrisca sozinho. Salvar grava uma
 * versão nova do SDR, como o editor.
 */
export function PassagemParaVoce({
  inicial,
  temLinkDeAgenda,
}: {
  inicial: { quando_chamar_voce: string[]; cautela?: Cautela };
  temLinkDeAgenda: boolean;
}) {
  const [casos, setCasos] = useState(inicial.quando_chamar_voce);
  const [cautela, setCautela] = useState<Cautela>(inicial.cautela ?? CAUTELA_PADRAO);
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const salvar = () =>
    iniciar(async () => {
      const resultado = await salvarPassagemDoPainel({ quando_chamar_voce: casos, cautela });
      setRetorno(resultado.ok ? { tom: "ok", texto: `Salvo como versão ${resultado.versao}. Vale para a próxima resposta.` } : { tom: "erro", texto: resultado.erro });
    });

  return (
    <section className="cartao p-5" aria-labelledby="titulo-passagem">
      <h2 id="titulo-passagem" className="text-[15px] font-semibold">
        Quando o SDR passa a conversa para você
      </h2>
      <p className="mt-1 text-[13px] text-tinta-suave">
        Nesses casos ele para de responder aquela conversa, não manda nada e avisa você. Confira aqui e teste no chat se ele chama na hora certa.
      </p>

      <h3 className="mt-5 text-xs uppercase tracking-[0.12em] text-tinta-fraca">Sempre passa, em qualquer conta</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {SEMPRE_CHAMA.map((item) => (
          <li key={item.caso} className="flex items-start gap-2.5 text-sm">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-tinta-fraca" aria-hidden />
            <span>
              {item.caso}. <span className="text-tinta-suave">{item.detalhe}</span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2.5 text-sm">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-tinta-fraca" aria-hidden />
          {temLinkDeAgenda ? (
            <span>
              Quer marcar a conversa e não há link de agenda.{" "}
              <span className="text-tinta-suave">Você tem link: ele manda o link quando a pessoa aceitar conversar, sem chamar você.</span>
            </span>
          ) : (
            <span>
              Quer marcar a conversa e não há link de agenda.{" "}
              <span className="text-atencao">Você ainda não tem link: toda reunião passa por você. Preencha o Link de agenda acima.</span>
            </span>
          )}
        </li>
      </ul>

      <h3 className="mt-6 text-xs uppercase tracking-[0.12em] text-tinta-fraca">Seus casos</h3>
      <p className="mt-1 text-xs text-tinta-fraca">Situações do seu negócio em que você quer assumir. Ex.: pedido de proposta formal, pergunta técnica.</p>
      <div className="mt-3 flex flex-col gap-3">
        <ListaDeFrases
          nome="Caso"
          itens={casos}
          maximo={8}
          aoMudar={(itens) => {
            setRetorno(null);
            setCasos(itens);
          }}
          desabilitado={pendente}
        />
      </div>

      <fieldset className="mt-6">
        <legend className="text-xs uppercase tracking-[0.12em] text-tinta-fraca">Quando ficar em dúvida</legend>
        <p className="mt-1 text-xs text-tinta-fraca">A cada resposta, o SDR diz o quanto tem certeza. Abaixo do nível escolhido, ele chama você.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {CAUTELAS.map((valor) => (
            <label
              key={valor}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-linha p-3 has-[:checked]:border-destaque/50 has-[:checked]:bg-destaque/[0.05]"
            >
              <input
                type="radio"
                name="cautela"
                value={valor}
                checked={cautela === valor}
                onChange={() => {
                  setRetorno(null);
                  setCautela(valor);
                }}
                disabled={pendente}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{NIVEIS_DE_CAUTELA[valor].rotulo}</span>
                <span className="mt-0.5 block text-[13px] text-tinta-suave">{NIVEIS_DE_CAUTELA[valor].descricao}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {retorno && (
        <Aviso tom={retorno.tom} className="mt-4">
          {retorno.texto}
        </Aviso>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <Link href="/settings/sdr/test" className="botao">
          <MessagesSquare aria-hidden />
          Testar no chat
        </Link>
        <button type="button" className="botao botao-primario" onClick={salvar} disabled={pendente}>
          <Save aria-hidden />
          {pendente ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </section>
  );
}
