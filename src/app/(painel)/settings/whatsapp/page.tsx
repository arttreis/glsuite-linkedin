import { CircleCheck, RefreshCw, Unplug } from "lucide-react";
import { Aviso } from "@/components/aviso";
import type { TemplateDoWhatsapp } from "@/domain/disparos";
import { urlPublicaDoApp } from "@/lib/env";
import { caminhoDoWebhookDoWhatsapp, obterCanal, tokenDeVerificacaoDoWhatsapp, type DadosDoWhatsapp } from "@/server/canais/canais";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterCofre } from "@/server/segredos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { atualizarTemplatesDoPainel, conectarWhatsappDoPainel, desconectarWhatsappDoPainel } from "./acoes";

const FUSO = "America/Sao_Paulo";
const quando = (valor: string | Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const QUALIDADE: Record<string, { rotulo: string; tom: string }> = {
  GREEN: { rotulo: "Qualidade alta", tom: "etiqueta-ok" },
  YELLOW: { rotulo: "Qualidade média", tom: "etiqueta-atencao" },
  RED: { rotulo: "Qualidade baixa", tom: "etiqueta-erro" },
};

const LIMITE: Record<string, string> = {
  TIER_250: "250 pessoas a cada 24 h",
  TIER_1K: "1.000 pessoas a cada 24 h",
  TIER_2K: "2.000 pessoas a cada 24 h",
  TIER_10K: "10.000 pessoas a cada 24 h",
  TIER_100K: "100.000 pessoas a cada 24 h",
  TIER_UNLIMITED: "sem limite diário",
};

const CATEGORIA: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

function Templates({ templates }: { templates: TemplateDoWhatsapp[] }) {
  const aprovados = templates.filter((t) => t.status === "APPROVED");
  const outros = templates.filter((t) => t.status !== "APPROVED");
  return (
    <div className="flex flex-col gap-3">
      {aprovados.length === 0 ? (
        <p className="text-[13px] text-tinta-suave">Nenhum template aprovado ainda. Crie no WhatsApp Manager da Meta e atualize aqui.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {aprovados.map((t) => (
            <li key={t.id} className="rounded-xl bg-superficie-alta px-4 py-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {t.nome}
                <span className="etiqueta">{CATEGORIA[t.categoria] ?? t.categoria}</span>
                <span className="text-xs font-normal text-tinta-fraca">{t.idioma}</span>
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] text-tinta-suave">{t.componentes.find((c) => c.type === "BODY")?.text}</p>
            </li>
          ))}
        </ul>
      )}
      {outros.length > 0 && (
        <p className="text-xs text-tinta-fraca">
          Fora de uso agora ({outros.length}): {outros.map((t) => `${t.nome} (${t.status.toLowerCase()})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** Configurações > WhatsApp (§4.19): conectar o número pela API oficial da Meta, os templates e desconectar. */
export default async function WhatsappPage({ searchParams }: PageProps<"/settings/whatsapp">) {
  const operador = await exigirOperadorComModulo("whatsapp");
  const { msg } = await searchParams;
  const canal = await comOperador(obterDb(), operador.id, (tx) => obterCanal(tx, { organizacaoId: operador.organizacaoId, tipo: "whatsapp" }));
  const admin = operador.papel === "admin";
  const conectado = canal && canal.status !== "desconectado" ? canal : null;
  const dados = conectado?.dados as DadosDoWhatsapp | undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}

      {conectado && dados ? (
        <>
          <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-numero">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="titulo-numero" className="text-[15px] font-semibold">
                  {dados.numero}
                </h2>
                <p className="mt-0.5 text-[13px] text-tinta-suave">{dados.nomeVerificado ?? "Nome ainda não verificado pela Meta"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {conectado.status === "erro" ? (
                  <span className="etiqueta etiqueta-ponto etiqueta-erro">Com erro</span>
                ) : (
                  <span className="etiqueta etiqueta-ponto etiqueta-ok">Conectado</span>
                )}
                {dados.qualidade && QUALIDADE[dados.qualidade] && (
                  <span className={`etiqueta ${QUALIDADE[dados.qualidade]!.tom}`}>{QUALIDADE[dados.qualidade]!.rotulo}</span>
                )}
              </div>
            </div>
            {conectado.erro && <Aviso tom="erro">{conectado.erro} Os disparos do WhatsApp ficam pausados até resolver. Depois, atualize aqui e retome.</Aviso>}
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-tinta-fraca">Limite da Meta</dt>
                <dd className="mt-0.5">{dados.limite ? (LIMITE[dados.limite] ?? dados.limite) : "a Meta não informou"}</dd>
              </div>
              <div>
                <dt className="text-xs text-tinta-fraca">Conferido na Meta</dt>
                <dd className="mt-0.5">{conectado.verificadoEm ? quando(conectado.verificadoEm) : "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-webhook">
            <h2 id="titulo-webhook" className="text-[15px] font-semibold">
              Status e respostas
            </h2>
            {dados.inscricao?.ok ? (
              <p className="flex items-center gap-2 text-[13px] text-tinta-suave">
                <CircleCheck className="size-4 text-ok" aria-hidden />O app foi inscrito na conta: a Meta manda para o Kakou as entregas, as leituras e as respostas.
                {dados.webhookVerificadoEm ? ` Verificado em ${quando(dados.webhookVerificadoEm)}.` : ""}
              </p>
            ) : (
              <Aviso tom="atencao">
                A Meta não aceitou ligar o webhook sozinha{dados.inscricao?.erro ? ` (${dados.inscricao.erro})` : ""}. Os disparos saem, mas sem entregues, lidas
                e respostas até você configurar: no app da Meta, em WhatsApp &gt; Configuração, cole a URL e o token abaixo e assine o campo
                &quot;messages&quot;.
              </Aviso>
            )}
            <dl className="flex flex-col gap-2 text-[13px]">
              <div>
                <dt className="text-xs text-tinta-fraca">URL do webhook</dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{`${urlPublicaDoApp()}${caminhoDoWebhookDoWhatsapp(conectado.id)}`}</dd>
              </div>
              <div>
                <dt className="text-xs text-tinta-fraca">Token de verificação</dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{tokenDeVerificacaoDoWhatsapp(obterCofre(), conectado.id)}</dd>
              </div>
            </dl>
          </section>

          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-templates">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="titulo-templates" className="text-[15px] font-semibold">
                Templates
              </h2>
              <form action={atualizarTemplatesDoPainel}>
                <button type="submit" className="botao botao-pequeno">
                  <RefreshCw aria-hidden />
                  Atualizar da Meta
                </button>
              </form>
            </div>
            <p className="-mt-1 text-[13px] text-tinta-suave">
              Disparo só usa template aprovado pela Meta. Criar e editar é no WhatsApp Manager.
              {dados.templatesEm ? ` Lidos em ${quando(dados.templatesEm)}.` : ""}
            </p>
            <Templates templates={dados.templates ?? []} />
          </section>

          {admin && (
            <details className="cartao p-5">
              <summary className="text-[13px] text-tinta-suave hover:text-tinta">Desconectar o WhatsApp</summary>
              <form action={desconectarWhatsappDoPainel} className="mt-3 flex flex-col gap-2">
                <p className="text-[13px] text-tinta-suave">
                  O token e o segredo saem do Kakou. Os disparos agendados ou saindo pausam. Os contatos e os disparos feitos ficam.
                </p>
                <button type="submit" className="botao botao-perigo botao-pequeno w-fit">
                  <Unplug aria-hidden />
                  Desconectar
                </button>
              </form>
            </details>
          )}
        </>
      ) : (
        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-conectar">
          <h2 id="titulo-conectar" className="text-[15px] font-semibold">
            Conectar o WhatsApp da empresa
          </h2>
          <p className="text-[13px] text-tinta-suave">
            O Kakou dispara pela API oficial da Meta, com o número de WhatsApp Business da empresa e o app dela na Meta. A Meta cobra cada mensagem
            entregue direto na conta da empresa.
          </p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-tinta-suave">
            <li>No Meta for Developers, use um app do tipo Business com o produto WhatsApp (ou crie um).</li>
            <li>
              Em Configurações do negócio &gt; Usuários do sistema, crie um usuário, dê a ele o app e a conta do WhatsApp, e gere um token permanente com
              as permissões whatsapp_business_messaging e whatsapp_business_management.
            </li>
            <li>No WhatsApp Manager, copie o id da conta (WABA) e o id do número.</li>
            <li>No app, em Configurações do app &gt; Básico, copie o segredo do app.</li>
          </ol>
          {admin ? (
            <form action={conectarWhatsappDoPainel} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="rotulo">
                Id da conta do WhatsApp Business (WABA)
                <input name="wabaId" required inputMode="numeric" autoComplete="off" className="campo" />
              </label>
              <label className="rotulo">
                Id do número
                <input name="phoneNumberId" required inputMode="numeric" autoComplete="off" className="campo" />
              </label>
              <label className="rotulo sm:col-span-2">
                Token permanente do usuário do sistema
                <input name="token" type="password" required autoComplete="off" className="campo" />
              </label>
              <label className="rotulo sm:col-span-2">
                Segredo do app
                <input name="segredoDoApp" type="password" required autoComplete="off" className="campo" />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="botao botao-primario">
                  Conectar
                </button>
                <p className="mt-2 text-xs text-tinta-fraca">
                  O token e o segredo ficam guardados cifrados. O Kakou confere o número na Meta e liga o webhook para receber as entregas e as respostas.
                </p>
              </div>
            </form>
          ) : (
            <p className="text-[13px] text-tinta-suave">Só um admin da organização conecta o WhatsApp.</p>
          )}
        </section>
      )}
    </div>
  );
}
