import { Check, RotateCcw, UserRound, X } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { AbasDeConversas } from "@/components/abas-de-conversas";
import { Cabecalho } from "@/components/cabecalho";
import { ROTULO_DO_ESTADO, type EstadoDoLead } from "@/domain/estados";
import { rotuloDoToque } from "@/domain/rotulos";
import { listarFila, taxaDeEdicao, type ItemDaFila } from "@/server/aprovacao/fila";
import { listarParados, type LeadParado } from "@/server/aprovacao/parados";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorLiberado } from "@/server/supabase/servidor";
import { aprovar, assumirDoPainel, rejeitar, tentarDeNovoDoPainel } from "./acoes";

const hora = (valor: Date | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";

const SUGESTOES: Record<string, string> = {
  responder: "IA sugere responder",
  propor_reuniao: "IA sugere propor reunião",
  encerrar: "IA sugere encerrar",
};

/** Abaixo disso a IA está pouco segura; o mesmo limiar do modo automático. */
const CONFIANCA_BAIXA = 0.7;

function rotuloDoEstado(estado: string) {
  return ROTULO_DO_ESTADO[estado as EstadoDoLead] ?? estado;
}

function ItemParaAprovar({ item }: { item: ItemDaFila }) {
  const respostaDeConversa = item.toque === null;
  return (
    <li className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={item.pessoa} />
          <div className="min-w-0">
            <Link href={`/inbox/${item.leadId}`} className="link font-medium">
              {item.pessoa}
            </Link>
            <p className="text-xs text-tinta-fraca">
              {item.empresa ?? "sem empresa"}, perfil {item.perfil}, {rotuloDoEstado(item.estadoLead).toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="etiqueta">{rotuloDoToque(item.toque, item.origem, item.tipo)}</span>
          {item.acaoSugerida && <span className="etiqueta">{SUGESTOES[item.acaoSugerida] ?? item.acaoSugerida}</span>}
          {item.confianca !== null && item.confianca < CONFIANCA_BAIXA && (
            <span className="etiqueta etiqueta-atencao tabular-nums">IA pouco segura ({Math.round(item.confianca * 100)}%)</span>
          )}
        </div>
      </div>

      {item.ultimaEntrada && (
        <div className="recuo mt-4">
          <p className="text-xs text-tinta-fraca">O que a pessoa escreveu, {hora(item.ultimaEntradaEm)}</p>
          <p className="mt-1 whitespace-pre-wrap text-tinta">{item.ultimaEntrada}</p>
        </div>
      )}
      {item.motivoRevisao && (
        <Aviso tom="atencao" className="mt-3">
          <span className="font-medium">Por que parou aqui:</span> {item.motivoRevisao}
        </Aviso>
      )}
      {item.motivoDoAgente && (
        <p className="mt-3 text-xs text-tinta-suave">
          <span className="text-tinta-fraca">Por que a IA sugeriu isso:</span> {item.motivoDoAgente}
        </p>
      )}
      {item.gancho && (
        <p className="mt-1.5 text-xs text-tinta-suave">
          <span className="text-tinta-fraca">Em que o convite se apoia:</span> {item.gancho}
        </p>
      )}

      <form className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="acaoId" value={item.acaoId} />
        <textarea
          name="texto"
          defaultValue={item.textoFinal ?? item.textoGerado ?? ""}
          rows={4}
          aria-label={`Texto para ${item.pessoa}`}
          className="campo w-full"
        />
        <p className="text-xs text-tinta-fraca">
          Pode editar à vontade: sai o que estiver na caixa.{" "}
          {respostaDeConversa
            ? "Ao aprovar, a resposta sai na hora pelo LinkedIn."
            : "Ao aprovar, a mensagem sai no próximo horário permitido do perfil."}
          {item.acaoSugerida === "encerrar" && " Depois do envio a conversa fecha como \"Disse não\"."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button formAction={aprovar} className="botao botao-primario">
            <Check aria-hidden />
            Aprovar e enviar
          </button>
          <button formAction={rejeitar} className="botao botao-perigo">
            <X aria-hidden />
            Rejeitar
          </button>
          <span className="text-xs text-tinta-fraca">
            {respostaDeConversa
              ? "Rejeitar não envia nada: a pessoa fica sem resposta até alguém responder pela Inbox."
              : "Rejeitar não envia nada: o lead fica parado até alguém decidir."}
          </span>
        </div>
      </form>
    </li>
  );
}

function Parado({ lead }: { lead: LeadParado }) {
  return (
    <li className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={lead.pessoa} />
          <div className="min-w-0">
            <Link href={`/inbox/${lead.leadId}`} className="link font-medium">
              {lead.pessoa}
            </Link>
            <p className="text-xs text-tinta-fraca">
              {lead.empresa ?? "sem empresa"}, perfil {lead.perfil}, {rotuloDoEstado(lead.estado).toLowerCase()}
            </p>
          </div>
        </div>
        {lead.toque && <span className="etiqueta">{rotuloDoToque(lead.toque)}</span>}
      </div>
      <Aviso tom="atencao" className="mt-4">
        <span className="font-medium">Por que parou:</span> {lead.motivo}
      </Aviso>
      {lead.texto && <p className="recuo mt-3 whitespace-pre-wrap">{lead.texto}</p>}
      <form className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="leadId" value={lead.leadId} />
        <button formAction={tentarDeNovoDoPainel} className="botao">
          <RotateCcw aria-hidden />
          Tentar de novo
        </button>
        <button formAction={assumirDoPainel} className="botao">
          <UserRound aria-hidden />
          Assumir à mão
        </button>
      </form>
      <p className="mt-2 text-xs text-tinta-fraca">
        Tentar de novo devolve a mensagem para aprovação, onde você corrige o texto. Assumir à mão para a sequência e passa a
        pessoa para a Inbox, com você.
      </p>
    </li>
  );
}

export default async function AprovacaoPage({ searchParams }: PageProps<"/aprovacao">) {
  const operador = await exigirOperadorLiberado();
  const { msg } = await searchParams;
  const { itens, parados, taxas } = await comOperador(obterDb(), operador.id, async (tx) => ({
    itens: await listarFila(tx),
    parados: await listarParados(tx),
    taxas: await taxaDeEdicao(tx, { agora: new Date() }),
  }));

  return (
    <>
      <Cabecalho
        titulo="Aprovação"
        descricao="Mensagens que o sistema escreveu e esperam o seu ok antes de sair: respostas da IA para quem respondeu, convites personalizados e mensagens barradas por uma regra de texto. Nada daqui sai sem você aprovar."
      />
      <div className="max-w-4xl">
        <AbasDeConversas atual="/aprovacao" />
        {typeof msg === "string" && <Aviso className="mb-6">{msg}</Aviso>}

        {parados.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[15px] font-semibold">Leads parados ({parados.length})</h2>
            <p className="mt-1 text-[13px] text-tinta-suave">
              Uma mensagem foi rejeitada ou falhou no envio, e a sequência dessas pessoas não anda até alguém decidir.
            </p>
            <ul className="mt-4 flex flex-col gap-4">
              {parados.map((lead) => (
                <Parado key={lead.leadId} lead={lead} />
              ))}
            </ul>
          </section>
        )}

        <h2 className="text-[15px] font-semibold">Esperando aprovação ({itens.length})</h2>
        {itens.length === 0 ? (
          <p className="vazio mt-4">
            Nada esperando aprovação. Aparecem aqui as respostas da IA quando alguém responde, os convites personalizados e as
            mensagens barradas por uma regra de texto.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {itens.map((item) => (
              <ItemParaAprovar key={item.acaoId} item={item} />
            ))}
          </ul>
        )}

        <section className="mt-10 border-t border-linha pt-6">
          <h2 className="text-[13px] font-medium text-tinta-suave">Quanto você corrige a IA (últimos 14 dias)</h2>
          <p className="mt-1 text-xs text-tinta-fraca">
            Respostas da IA editadas ou rejeitadas, por perfil. Com pouca correção por duas semanas, o perfil pode passar para o
            modo automático em Perfis.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {taxas.map((t) => (
              <div key={t.perfilId} className="cartao px-4 py-3">
                <dt className="text-xs text-tinta-suave">{t.perfil}</dt>
                <dd className="mt-1.5 text-lg leading-none tabular-nums">{t.taxa === null ? "—" : `${Math.round(t.taxa * 100)}%`}</dd>
                <dd className="mt-1.5 text-xs text-tinta-fraca">
                  {t.decididas > 0
                    ? `${t.editadas} editadas e ${t.rejeitadas} rejeitadas de ${t.decididas}`
                    : "sem decisões no período"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
