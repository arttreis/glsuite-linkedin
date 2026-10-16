import { FileJson, Link2, Pause, Pencil, Play, Plus, RefreshCw, Unlink, Webhook } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { Avatar } from "@/components/avatar";
import { Aviso } from "@/components/aviso";
import { EtiquetaDoPerfil } from "@/components/etiquetas";
import type { Janela } from "@/domain/calendario";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { resumoDaRampa } from "@/domain/ativacao";
import type { EtapaDaRampa } from "@/domain/rampa";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { desfechoDaConexao } from "@/server/perfis/conexao";
import { contasParaLigar, ERRO_DA_ULTIMA_MARCA, perfisDaMarca, type ContaDaMarca } from "@/server/perfis/marcas-dos-perfis";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import {
  atualizarStatusDasContasDoPainel,
  editarContaDoPainel,
  pausarContaDoPainel,
  reconectarConta,
  registrarEvalDoPainel,
  registrarWebhooksDoPainel,
  retomarContaDoPainel,
  vincularOutraConta,
} from "../acoes";
import { ligarContaNaMarca, tirarContaDaMarca } from "./acoes";
import { TirarDaMarca } from "./tirar-da-marca";

type Conta = {
  id: string;
  nome: string;
  operador_id: string | null;
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

const CONTA_EM_OUTRA_ORGANIZACAO = "Essa conta do LinkedIn já está conectada em outra organização do Kakou. Fale com a GuessLess.";

const CONEXAO: Record<string, { tom: "ok" | "erro"; texto: string }> = {
  ok: { tom: "ok", texto: "LinkedIn vinculado. Conta nova nasce pausada: ative no Dashboard quando quiser começar." },
  falhou: { tom: "erro", texto: "A conexão não foi concluída na Unipile. Tente de novo." },
};

/** "Kakou, Aulão" ou "Kakou e mais 2": nunca o nome de uma marca que o operador não vê (§4.30). */
function outrasMarcas({ visiveis, ocultas }: ContaDaMarca["outrasMarcas"]): string | null {
  if (visiveis.length === 0) return ocultas === 0 ? null : ocultas === 1 ? "outra marca" : `outras ${ocultas} marcas`;
  return ocultas === 0 ? visiveis.join(", ") : `${visiveis.join(", ")} e mais ${ocultas}`;
}

/** Na volta do hosted auth, o que o callback decidiu sobre a conta (§4.30). */
async function desfecho(conexao: unknown, perfil: unknown, desde: unknown, marca: string) {
  const id = z.uuid().safeParse(perfil);
  const quando = new Date(Number(desde));
  if (conexao !== "ok" || !id.success || Number.isNaN(quando.getTime())) return undefined;
  const resultado = await desfechoDaConexao(obterDb(), { perfilId: id.data, desde: quando });
  if (resultado === "ligada_a_existente") {
    return { tom: "ok" as const, texto: `Essa conta do LinkedIn já estava conectada. Ela foi ligada à ${marca}, sem criar outra conta: o teto continua um só.` };
  }
  if (resultado === "outra_organizacao") return { tom: "erro" as const, texto: CONTA_EM_OUTRA_ORGANIZACAO };
  return undefined;
}

const TIPO: Record<string, string> = { gratuita: "conta gratuita", premium: "Premium", sales_navigator: "Sales Navigator" };

/** LinkedIn (§4.12): as contas, status, rampa, teto e janela; editar nome e janela; pausar, retomar, reconectar e vincular outra. */
export default async function LinkedinPage({ searchParams }: PageProps<"/settings/linkedin">) {
  const operador = await exigirOperadorComModulo("linkedin");
  const { msg, conexao, perfil, desde } = await searchParams;
  const marca = operador.marcaNome;
  const { contas, daMarca, paraLigar } = await comOperador(obterDb(), operador.id, async (tx) => {
    // Só as contas da marca atual (§4.30): a mesma conta pode estar em outras marcas.
    const daMarca = new Map((await perfisDaMarca(tx, operador.marcaId)).map((conta) => [conta.perfilId, conta]));
    const contas = await tx.query<Conta>(
      `select id, nome, operador_id, status, motivo_pausa, unipile_account_id is not null as conectada, unipile_status, tipo_conta,
              rampa, teto_convites_semana, janela, fuso, modo_resposta, ativado_em
         from public.perfis
        where not casa and public.pode_ver_perfil(id) and id = any($1::uuid[])
        order by nome`,
      [[...daMarca.keys()]],
    );
    return { contas, daMarca, paraLigar: await contasParaLigar(tx, operador.marcaId) };
  });
  const aviso = (await desfecho(conexao, perfil, desde, marca)) ?? (typeof conexao === "string" ? CONEXAO[conexao] : undefined);
  const podeUsar = paraLigar.some((conta) => conta.podeLigar);
  const usar = (
    <details className="cartao p-5">
      <summary className="flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-4" aria-hidden />
        Usar uma conta já conectada
      </summary>
      {paraLigar.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-suave">Todas as contas que você pode ver já estão na {marca}.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {paraLigar.map((conta) => {
            const em = outrasMarcas({ visiveis: conta.marcas, ocultas: conta.ocultas });
            return (
              <li key={conta.perfilId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-superficie-alta px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nome={conta.nome} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{conta.nome}</p>
                    {em && <p className="text-xs text-tinta-suave">Em: {em}</p>}
                  </div>
                  <EtiquetaDoPerfil status={conta.status} nuncaAtivado={false} />
                </div>
                {conta.podeLigar && (
                  <form action={ligarContaNaMarca}>
                    <input type="hidden" name="perfilId" value={conta.perfilId} />
                    <button type="submit" className="botao botao-pequeno botao-primario">
                      Usar na {marca}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      {contas.length === 0 && (
        <section className="cartao p-6">
          <h2 className="text-[15px] font-semibold">Nenhuma conta do LinkedIn na {marca}</h2>
          <p className="mt-1 text-sm text-tinta-suave">Vincule uma conta nova ou use uma que já está conectada em outra marca.</p>
          <form action={vincularOutraConta} className="mt-4">
            <button type="submit" className="botao botao-primario">
              <Plus aria-hidden />
              Vincular uma conta do LinkedIn
            </button>
          </form>
        </section>
      )}
      {contas.length === 0 && podeUsar && usar}

      <ul className="flex flex-col gap-4">
        {contas.map((conta) => {
          const saudavel = conta.conectada && (conta.unipile_status === null || STATUS_SAUDAVEIS.has(conta.unipile_status));
          const nuncaAtivada = conta.ativado_em === null;
          const podeEditar = operador.papel === "admin" || conta.operador_id === operador.id;
          const tambem = outrasMarcas(daMarca.get(conta.id)?.outrasMarcas ?? { visiveis: [], ocultas: 0 });
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
                    {tambem && <p className="text-xs text-tinta-suave">Também em: {tambem}</p>}
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

              {podeEditar && (
                <details className="mt-4">
                  <summary className="flex w-fit cursor-pointer items-center gap-1.5 text-[13px] text-tinta-suave hover:text-tinta">
                    <Pencil className="size-3.5" aria-hidden />
                    Editar nome e horário
                  </summary>
                  <form action={editarContaDoPainel} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="perfilId" value={conta.id} />
                    <label className="rotulo">
                      Nome da conta
                      <input name="nome" defaultValue={conta.nome} required minLength={2} maxLength={80} className="campo w-72 max-w-full" />
                    </label>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="rotulo">
                        Começa às
                        <input type="time" name="inicio" defaultValue={conta.janela.inicio} required className="campo w-32" />
                      </label>
                      <label className="rotulo">
                        Termina às
                        <input type="time" name="fim" defaultValue={conta.janela.fim} required className="campo w-32" />
                      </label>
                      <button type="submit" className="botao botao-primario">
                        Salvar
                      </button>
                    </div>
                    <p className="text-xs text-tinta-fraca">
                      O SDR só envia convites e mensagens nesse horário, em dias úteis,{" "}
                      {conta.fuso === "America/Sao_Paulo" ? "no horário de Brasília" : `no fuso ${conta.fuso}`}. Nas conversas desta conta, o SDR
                      escreve em nome de quem está no nome.
                    </p>
                  </form>
                </details>
              )}

              {conta.status === "pausado" && !nuncaAtivada && conta.motivo_pausa && <p className="recuo mt-4">{conta.motivo_pausa}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-linha pt-4">
                {/* Reconectar fica sempre à mão: a Unipile pode recusar a conta com o status ainda OK. */}
                <form action={reconectarConta}>
                  <input type="hidden" name="perfilId" value={conta.id} />
                  <button type="submit" className={`botao botao-pequeno ${saudavel ? "" : "botao-primario"}`}>
                    <Link2 aria-hidden />
                    {conta.conectada ? "Reconectar o LinkedIn" : "Vincular o LinkedIn"}
                  </button>
                </form>
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
                {podeEditar &&
                  (tambem ? (
                    <TirarDaMarca perfilId={conta.id} conta={conta.nome} marca={marca} acao={tirarContaDaMarca} />
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <button type="button" className="botao botao-pequeno" disabled>
                        <Unlink aria-hidden />
                        Tirar desta marca
                      </button>
                      <span className="text-xs text-tinta-fraca">{ERRO_DA_ULTIMA_MARCA}</span>
                    </span>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>

      {contas.length > 0 && (
        <>
          <form action={vincularOutraConta}>
            <button type="submit" className="botao">
              <Plus aria-hidden />
              Vincular outra conta do LinkedIn
            </button>
          </form>
          {(podeUsar || operador.papel === "admin") && usar}
        </>
      )}

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
