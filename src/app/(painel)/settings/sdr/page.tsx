import { History, MessagesSquare, Sparkles } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { historicoDoSdr, obterSdr, type Origem } from "@/server/sdr/sdr";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { montarSdrDoPainel, trocarModoDaConta, voltarParaVersaoDoPainel } from "../acoes";
import { EditorDoSdr } from "./editor-do-sdr";

const ORIGEM: Record<Origem, string> = {
  ia: "Montado da análise do site",
  humano: "Editado",
  ajuste: "Ajustado no chat de teste",
  desfazer: "Volta para uma versão anterior",
};

const quando = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** SDR (§4.12): os campos, o teste no chat, o histórico com voltar e o modo de resposta de cada conta. */
export default async function SdrPage({ searchParams }: PageProps<"/settings/sdr">) {
  const operador = await exigirOperadorNoApp();
  const { msg } = await searchParams;
  const { sdr, historico, contas } = await comOperador(obterDb(), operador.id, async (tx) => ({
    sdr: await obterSdr(tx, operador.organizacaoId),
    historico: await historicoDoSdr(tx, operador.organizacaoId),
    contas: await tx.query<{ id: string; nome: string; modo_resposta: "aprovacao" | "automatico"; praca: string }>(
      "select id, nome, modo_resposta, praca from public.perfis where not casa and public.pode_ver_perfil(id) order by nome",
    ),
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}

      {!sdr ? (
        <section className="cartao cartao-vitrine p-6">
          <h2 className="text-[15px] font-semibold">O SDR ainda não foi montado</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Até lá, cada conta responde com a própria voz. O SDR sai da análise do site confirmada; depois você testa no chat e ajusta.
          </p>
          <form action={montarSdrDoPainel} className="mt-4">
            <button type="submit" className="botao botao-primario">
              <Sparkles aria-hidden />
              Montar o SDR
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="cartao cartao-vitrine flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0 flex-1 basis-72">
              <p className="font-medium">Teste o SDR como se fosse um lead</p>
              <p className="mt-1 text-[13px] text-tinta-suave">
                O mesmo agente que responde os leads. Quando uma resposta não ficar boa, ajuste ali mesmo e veja ele responder de novo.
              </p>
            </div>
            <Link href="/settings/sdr/test" className="botao botao-primario">
              <MessagesSquare aria-hidden />
              Testar no chat
            </Link>
          </section>
          <EditorDoSdr key={sdr.versao} inicial={sdr.sdr} />
        </>
      )}

      {contas.length > 0 && (
        <section className="cartao p-5" aria-labelledby="titulo-modo">
          <h2 id="titulo-modo" className="text-[15px] font-semibold">
            Como cada conta responde
          </h2>
          <p className="mt-1 text-[13px] text-tinta-suave">
            Sozinho: o SDR responde e chama você quando precisa. Aprovo cada resposta: a resposta espera você no chat, com Enviar, Editar e
            Descartar. Vale para a próxima resposta.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {contas.map((conta) => (
              <li key={conta.id}>
                <form action={trocarModoDaConta} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linha px-4 py-3">
                  <input type="hidden" name="perfilId" value={conta.id} />
                  <span className="text-sm font-medium">{conta.nome}</span>
                  <span className="flex items-center gap-2">
                    <select name="modo" defaultValue={conta.modo_resposta} aria-label={`Modo de resposta de ${conta.nome}`} className="campo campo-pequeno w-auto">
                      {conta.praca !== "espanha" && <option value="automatico">O SDR responde sozinho</option>}
                      <option value="aprovacao">Aprovo cada resposta</option>
                    </select>
                    <button type="submit" className="botao botao-pequeno">
                      Trocar
                    </button>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {historico.length > 0 && (
        <section className="cartao p-5" aria-labelledby="titulo-historico">
          <h2 id="titulo-historico" className="flex items-center gap-2 text-[15px] font-semibold">
            <History className="size-4 text-tinta-suave" aria-hidden />
            Histórico
          </h2>
          <ol className="mt-4 flex flex-col divide-y divide-linha">
            {historico.map((versao, indice) => (
              <li key={versao.versao} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="text-sm">
                    <span className="mr-2 text-xs tabular-nums text-tinta-fraca">v{versao.versao}</span>
                    {ORIGEM[versao.origem]}
                    {versao.por ? ` por ${versao.por}` : ""}
                    <span className="ml-2 text-xs text-tinta-fraca">{quando(versao.em)}</span>
                  </p>
                  {versao.pedido && <p className="mt-0.5 text-[13px] text-tinta-suave">Pedido: “{versao.pedido}”</p>}
                  {versao.resumo && <p className="mt-0.5 text-[13px] text-tinta-suave">{versao.resumo}</p>}
                </div>
                {indice === 0 ? (
                  <span className="etiqueta etiqueta-ok">atual</span>
                ) : (
                  <form action={voltarParaVersaoDoPainel}>
                    <input type="hidden" name="versao" value={versao.versao} />
                    <button type="submit" className="botao botao-pequeno">
                      Voltar para esta
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
