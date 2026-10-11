import { FileJson, Link2, Pause, Play, Plus, RefreshCw, Webhook } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Aviso } from "@/components/aviso";
import { EtiquetaDoPerfil } from "@/components/etiquetas";
import type { Janela } from "@/domain/calendario";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { resumoDaRampa } from "@/domain/ativacao";
import type { EtapaDaRampa } from "@/domain/rampa";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import {
  atualizarStatusDasContasDoPainel,
  pausarContaDoPainel,
  reconectarConta,
  registrarEvalDoPainel,
  registrarWebhooksDoPainel,
  retomarContaDoPainel,
  vincularOutraConta,
} from "../acoes";

type Conta = {
  id: string;
  nome: string;
  status: "ativo" | "pausado";
  motivo_pausa: string | null;
  conectada: boolean;
  unipile_status: string | null;
  tipo_conta: string | null;
  rampa: EtapaDaRampa[];
  teto_convites_semana: number;
  janela: Janela;
  fuso: string;
  modo_resposta: "aprovacao" | "automatico";
  ativado_em: Date | null;
};

const CONEXAO: Record<string, { tom: "ok" | "erro"; texto: string }> = {
  ok: { tom: "ok", texto: "LinkedIn vinculado. Conta nova nasce pausada: ative no Dashboard quando quiser começar." },
  falhou: { tom: "erro", texto: "A conexão não foi concluída na Unipile. Tente de novo." },
};

const TIPO: Record<string, string> = { gratuita: "conta gratuita", premium: "Premium", sales_navigator: "Sales Navigator" };

/** LinkedIn (§4.12): as contas, status, rampa, teto e janela; pausar, retomar, reconectar e vincular outra. */
export default async function LinkedinPage({ searchParams }: PageProps<"/settings/linkedin">) {
  const operador = await exigirOperadorNoApp();
  const { msg, conexao } = await searchParams;
  const contas = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<Conta>(
      `select id, nome, status, motivo_pausa, unipile_account_id is not null as conectada, unipile_status, tipo_conta,
              rampa, teto_convites_semana, janela, fuso, modo_resposta, ativado_em
         from public.perfis
        where not casa and public.pode_ver_perfil(id)
        order by nome`,
    ),
  );
  const aviso = typeof conexao === "string" ? CONEXAO[conexao] : undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      <ul className="flex flex-col gap-4">
        {contas.map((conta) => {
          const saudavel = conta.conectada && (conta.unipile_status === null || STATUS_SAUDAVEIS.has(conta.unipile_status));
          const nuncaAtivada = conta.ativado_em === null;
          return (
            <li key={conta.id} id={`conta-${conta.id}`} className="cartao scroll-mt-6 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nome={conta.nome} />
                  <div className="min-w-0">
                    <p className="font-medium">{conta.nome}</p>
                    <p className="text-xs text-tinta-suave">
                      {conta.conectada
                        ? `LinkedIn vinculado${conta.tipo_conta ? `, ${TIPO[conta.tipo_conta] ?? conta.tipo_conta}` : ""}${saudavel ? "" : ` (a Unipile informa ${conta.unipile_status})`}`
                        : "LinkedIn não vinculado"}
                    </p>
                  </div>
                </div>
                <EtiquetaDoPerfil status={conta.status} nuncaAtivado={nuncaAtivada} />
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta-fraca">Convites por dia (rampa)</dt>
                  <dd className="tabular-nums">{resumoDaRampa(conta.rampa, "convites_dia")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta-fraca">Mensagens por dia</dt>
                  <dd className="tabular-nums">{resumoDaRampa(conta.rampa, "dms_dia")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta-fraca">Teto de convites na semana</dt>
                  <dd className="tabular-nums">{conta.teto_convites_semana}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta-fraca">Janela</dt>
                  <dd>
                    Dias úteis, {conta.janela.inicio} às {conta.janela.fim}
                  </dd>
                </div>
              </dl>

              {conta.status === "pausado" && !nuncaAtivada && conta.motivo_pausa && <p className="recuo mt-4">{conta.motivo_pausa}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-linha pt-4">
                {(!conta.conectada || !saudavel) && (
                  <form action={reconectarConta}>
                    <input type="hidden" name="perfilId" value={conta.id} />
                    <button type="submit" className="botao botao-pequeno botao-primario">
                      <Link2 aria-hidden />
                      {conta.conectada ? "Reconectar o LinkedIn" : "Vincular o LinkedIn"}
                    </button>
                  </form>
                )}
                {conta.status === "ativo" && (
                  <form action={pausarContaDoPainel} className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <input type="hidden" name="perfilId" value={conta.id} />
                    <input name="motivo" required minLength={3} placeholder="Motivo da pausa" aria-label={`Motivo da pausa de ${conta.nome}`} className="campo campo-pequeno min-w-0 flex-1 basis-48" />
                    <button type="submit" className="botao botao-pequeno">
                      <Pause aria-hidden />
                      Pausar
                    </button>
                  </form>
                )}
                {conta.status === "pausado" && !nuncaAtivada && (
                  <form action={retomarContaDoPainel}>
                    <input type="hidden" name="perfilId" value={conta.id} />
                    <button type="submit" className="botao botao-pequeno botao-primario" disabled={!saudavel}>
                      <Play aria-hidden />
                      Retomar
                    </button>
                  </form>
                )}
                {nuncaAtivada && conta.conectada && (
                  <Link href={`/#conta-${conta.id}`} className="botao botao-pequeno botao-primario">
                    <Play aria-hidden />
                    Ativar no Dashboard
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form action={vincularOutraConta}>
        <button type="submit" className="botao">
          <Plus aria-hidden />
          Vincular outra conta do LinkedIn
        </button>
      </form>

      {operador.papel === "admin" && (
        <section className="cartao mt-2 p-5">
          <h2 className="text-[15px] font-semibold">Administração</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={atualizarStatusDasContasDoPainel}>
              <button type="submit" className="botao botao-pequeno">
                <RefreshCw aria-hidden />
                Atualizar o status das contas
              </button>
            </form>
            <form action={registrarWebhooksDoPainel}>
              <button type="submit" className="botao botao-pequeno">
                <Webhook aria-hidden />
                Registrar webhooks na Unipile
              </button>
            </form>
          </div>
          <form action={registrarEvalDoPainel} className="mt-4 flex flex-wrap items-center gap-2 border-t border-linha pt-4">
            <label className="flex items-center gap-2 text-[13px] text-tinta-suave">
              <FileJson className="size-4" aria-hidden />
              Resultado do eval (relatorio.json), para comparar versões de prompt
              <input type="file" name="relatorio" accept="application/json" className="text-xs" />
            </label>
            <button type="submit" className="botao botao-pequeno">
              Registrar
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
