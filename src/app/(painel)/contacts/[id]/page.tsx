import { Hand, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { ROTULO_DA_ORIGEM, telefoneLegivel } from "@/domain/contatos";
import { NOME_DO_CANAL, type StatusDoEnvio } from "@/domain/disparos";
import { ROTULO_DO_ESTADO } from "@/domain/estados";
import { obterContato, type ContatoCompleto } from "@/server/contatos/contatos";
import { listarTags } from "@/server/contatos/tags";
import { disparosDoContato } from "@/server/disparos/disparos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { naoContatarMaisDoPainel } from "../acoes";
import { TagsDoContato } from "../tags-do-contato";

const FUSO = "America/Sao_Paulo";

const SITUACAO_DO_ENVIO: Record<StatusDoEnvio, string> = {
  pendente: "Na fila",
  enviando: "Saindo",
  enviado: "Enviada",
  entregue: "Entregue",
  lido: "Lida",
  falhou: "Falhou",
  pulado: "Ficou de fora",
  cancelado: "Cancelada",
};
const data = (valor: Date | string) =>
  new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", year: "numeric" });

function WhatsappDoContato({ contato }: { contato: ContatoCompleto }) {
  if (!contato.telefone) return <p className="text-[13px] text-tinta-fraca">Sem telefone.</p>;
  const numero = <span className="tabular-nums">{telefoneLegivel(contato.telefone)}</span>;
  if (contato.whatsappSaiuEm) {
    return (
      <p className="text-[13px]">
        {numero} · saiu do WhatsApp em {data(contato.whatsappSaiuEm)}
        {contato.whatsappMotivo ? ` (${contato.whatsappMotivo})` : ""}. Não recebe mais disparo por ele.
      </p>
    );
  }
  if (!contato.whatsappAutorizadoEm) {
    return (
      <p className="text-[13px]">
        {numero} · <span className="text-tinta-suave">sem autorização para receber disparo pelo WhatsApp.</span> Para autorizar, importe de novo
        marcando que a pessoa autorizou.
      </p>
    );
  }
  return (
    <p className="text-[13px]">
      {numero} · pode receber disparo. Autorizado em {data(contato.whatsappAutorizadoEm)}
      {contato.whatsappAutorizacao?.arquivo ? `, na importação de ${contato.whatsappAutorizacao.arquivo}` : ""}.
    </p>
  );
}

/** O contato (§4.15): os dados, os canais, as tags e o "Não contatar mais". */
export default async function ContatoPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const operador = await exigirOperadorNoApp();
  const { id } = await params;
  const { msg } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { contato, tags, disparos } = await comOperador(obterDb(), operador.id, async (tx) => ({
    contato: await obterContato(tx, id),
    tags: await listarTags(tx, operador.organizacaoId),
    disparos: await disparosDoContato(tx, id),
  }));
  if (!contato) notFound();
  const comLinkedin = operador.modulos.includes("linkedin");
  const linhas: [string, string | null][] = [
    ["Empresa", contato.empresa],
    ["Cargo", contato.cargo],
    ["E-mail", contato.email],
    ["Veio de", ROTULO_DA_ORIGEM[contato.origem]],
    ["Entrou em", `${data(contato.criadoEm)}${contato.importacao?.arquivo ? `, pela importação de ${contato.importacao.arquivo}` : ""}`],
  ];

  return (
    <>
      <Cabecalho titulo={contato.nome} voltar={{ href: "/contacts", rotulo: "Contatos" }} />
      <div className="grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          {typeof msg === "string" && <Aviso>{msg}</Aviso>}
          {contato.naoContatar && (
            <Aviso tom="atencao">
              Não contatar desde {data(contato.naoContatarEm!)}
              {contato.naoContatarMotivo ? `: ${contato.naoContatarMotivo}` : ""}. Ninguém da organização fala mais com este contato, por nenhum canal.
            </Aviso>
          )}
          <section className="cartao p-5" aria-labelledby="titulo-dados">
            <h2 id="titulo-dados" className="text-[15px] font-semibold">
              Dados
            </h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              {linhas
                .filter(([, valor]) => valor)
                .map(([rotulo, valor]) => (
                  <div key={rotulo} className="flex justify-between gap-3">
                    <dt className="text-tinta-fraca">{rotulo}</dt>
                    <dd className="text-right">{valor}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-canais">
            <h2 id="titulo-canais" className="text-[15px] font-semibold">
              Canais
            </h2>
            <div>
              <p className="text-xs text-tinta-fraca">WhatsApp</p>
              <WhatsappDoContato contato={contato} />
            </div>
            {(contato.telegram || operador.modulos.includes("telegram")) && (
              <div>
                <p className="text-xs text-tinta-fraca">Telegram</p>
                <p className="text-[13px]">
                  {!contato.telegram
                    ? <span className="text-tinta-fraca">Não entrou pelo bot.</span>
                    : contato.telegram === "saiu"
                      ? `${contato.telegramUsuario ? `@${contato.telegramUsuario} · ` : ""}saiu do Telegram${contato.telegramSaiuEm ? ` em ${data(contato.telegramSaiuEm)}` : ""}${contato.telegramMotivo ? ` (${contato.telegramMotivo})` : ""}.`
                      : `${contato.telegramUsuario ? `@${contato.telegramUsuario} · ` : ""}entrou pelo bot e pode receber disparo.`}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-tinta-fraca">LinkedIn</p>
              {contato.lead ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px]">
                    Lead da campanha {contato.lead.campanha}, pela conta {contato.lead.conta}: {ROTULO_DO_ESTADO[contato.lead.estado].toLowerCase()}.
                  </p>
                  {comLinkedin && (
                    <Link href={`/chats/${contato.lead.id}`} className="botao botao-pequeno">
                      <MessagesSquare aria-hidden />
                      Abrir a conversa
                    </Link>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-tinta-fraca">{contato.linkedin ? "Lead sem campanha." : "Não é lead do LinkedIn."}</p>
              )}
            </div>
          </section>

          {disparos.length > 0 && (
            <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-disparos-do-contato">
              <h2 id="titulo-disparos-do-contato" className="text-[15px] font-semibold">
                Disparos
              </h2>
              <ul className="flex flex-col gap-2">
                {disparos.map((d) => (
                  <li key={d.disparoId} className="rounded-xl bg-superficie-alta px-4 py-3 text-[13px]">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/broadcasts/${d.disparoId}`} className="link font-medium">
                        {d.nome}
                      </Link>
                      <span className="text-xs text-tinta-fraca">
                        {NOME_DO_CANAL[d.canal]}
                        {d.em ? ` · ${data(d.em)}` : ""}
                      </span>
                    </p>
                    <p className="mt-0.5 text-tinta-suave">{SITUACAO_DO_ENVIO[d.status]}{d.motivo && (d.status === "falhou" || d.status === "pulado") ? `: ${d.motivo}` : ""}</p>
                    {d.resposta && <p className="mt-1 whitespace-pre-line">Respondeu: “{d.resposta}”</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <section className="cartao p-5" aria-labelledby="titulo-tags">
            <h2 id="titulo-tags" className="mb-3 text-[15px] font-semibold">
              Tags
            </h2>
            <TagsDoContato contatoId={contato.id} tags={contato.tags} todas={tags} voltar={`/contacts/${contato.id}`} />
          </section>

          {!contato.naoContatar && (
            <section className="cartao p-5" aria-labelledby="titulo-nao-contatar">
              <h2 id="titulo-nao-contatar" className="text-[15px] font-semibold">
                Não contatar mais
              </h2>
              <p className="mt-1 text-[13px] text-tinta-suave">
                Para quando a pessoa pediu, por qualquer meio, para não receber mais nada. Ela sai de todo disparo e, se for lead do LinkedIn, o
                SDR para e a sequência é cancelada. Não dá para desfazer.
              </p>
              <details className="mt-3">
                <summary className="text-[13px] text-tinta-suave hover:text-tinta">Marcar este contato</summary>
                <form action={naoContatarMaisDoPainel} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="contatoId" value={contato.id} />
                  <label className="rotulo">
                    Por quê (fica na trilha)
                    <input name="motivo" maxLength={300} placeholder="Ex.: pediu por telefone" className="campo campo-pequeno" />
                  </label>
                  <button type="submit" className="botao botao-perigo botao-pequeno w-fit">
                    <Hand aria-hidden />
                    Não contatar mais
                  </button>
                </form>
              </details>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
