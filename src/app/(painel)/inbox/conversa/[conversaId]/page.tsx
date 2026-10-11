import { randomUUID } from "node:crypto";
import { ExternalLink, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { responderExterna } from "../../acoes";

type Conversa = {
  id: string;
  nome: string | null;
  url: string | null;
  perfil: string;
  perfil_status: string;
  campanha: string | null;
};

type Mensagem = { id: string; direcao: "entrada" | "saida"; texto: string; em: Date };

const hora = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Conversa do LinkedIn fora de campanha (§4.6): só leitura e resposta humana. */
export default async function ConversaExternaPage({ params, searchParams }: PageProps<"/inbox/conversa/[conversaId]">) {
  const operador = await exigirOperadorNoApp();
  const { conversaId } = await params;
  const { msg } = await searchParams;

  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const [conversa] = await tx.query<Conversa>(
      `select c.id, c.contraparte_nome as nome, c.contraparte_url as url, pf.nome as perfil, pf.status as perfil_status,
              (select ca.nome from public.leads l
                 join public.pessoas pe on pe.id = l.pessoa_id
                 join public.campanhas ca on ca.id = l.campanha_id
                where l.perfil_id = c.perfil_id and pe.provider_id = c.contraparte_provider_id
                  and l.estado not in ('triagem', 'rejeitado')
                order by l.criado_em desc limit 1) as campanha
         from public.conversas c join public.perfis pf on pf.id = c.perfil_id
        where c.id = $1::uuid and c.lead_id is null`,
      [conversaId],
    );
    if (!conversa) return null;
    const mensagens = await tx.query<Mensagem>(
      "select id, direcao, texto, em from public.mensagens where conversa_id = $1::uuid order by em",
      [conversaId],
    );
    return { conversa, mensagens };
  });
  if (!dados) notFound();
  const { conversa, mensagens } = dados;
  const pausado = conversa.perfil_status !== "ativo";

  return (
    <>
      <Cabecalho
        titulo={conversa.nome ?? "Conversa do LinkedIn"}
        descricao={`Conversa do perfil ${conversa.perfil} fora de campanha. Aqui não há IA nem prazo de resposta: só você lê e responde.`}
        voltar={{ href: "/inbox", rotulo: "Inbox" }}
      >
        {conversa.url && (
          <a href={conversa.url} target="_blank" rel="noreferrer" className="botao botao-pequeno">
            <ExternalLink aria-hidden />
            Abrir no LinkedIn
          </a>
        )}
      </Cabecalho>

      <div className="max-w-3xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}
        {conversa.campanha && (
          <Aviso className="mb-5">
            Esta pessoa está na campanha {conversa.campanha}. Na próxima mensagem dela, a conversa passa para a campanha.
          </Aviso>
        )}

        <ol className="flex flex-col gap-3">
          {mensagens.length === 0 && <li className="vazio">Sem mensagens guardadas.</li>}
          {mensagens.map((m) => (
            <li
              key={m.id}
              className={`max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm ${
                m.direcao === "entrada"
                  ? "self-start rounded-tl-md border-linha bg-superficie"
                  : "self-end rounded-tr-md border-linha-forte bg-superficie-alta"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>
              <p className="mt-1.5 text-[11px] text-tinta-fraca">{hora(m.em)}</p>
            </li>
          ))}
        </ol>

        <form action={responderExterna} className="cartao mt-6 flex flex-col gap-3 p-4">
          <input type="hidden" name="conversaId" value={conversa.id} />
          <input type="hidden" name="chave" value={randomUUID()} />
          <textarea
            name="texto"
            rows={3}
            required
            disabled={pausado}
            aria-label={`Resposta para ${conversa.nome ?? "a pessoa"}`}
            placeholder={pausado ? "O perfil está pausado." : "Escreva a resposta."}
            className="campo w-full"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-tinta-fraca">
              {pausado
                ? "Despause o perfil no Início para responder pelo painel."
                : "Sai na hora pelo LinkedIn, depois de passar pelas regras de texto do perfil."}
            </p>
            <button type="submit" className="botao botao-primario" disabled={pausado}>
              <Send aria-hidden />
              Enviar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
