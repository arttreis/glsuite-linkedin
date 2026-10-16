import { z } from "zod";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { ErroUnipile, PECA_A_CHAVE } from "@/server/unipile/erros";
import { contaNovaDoLinkedin } from "./nova-conta";
import { statusMaisGrave } from "./status-conta";

type Dependencias = { db: Db; unipile: ClienteUnipile };

/**
 * Link do hosted auth da Unipile para conectar (ou reconectar) a conta do
 * LinkedIn de um perfil. `name` leva o id do perfil, que volta no callback.
 * O link vale 30 min, mas a Unipile invalida todos no restart diário: por isso
 * ele é gerado a cada clique.
 */
export async function gerarLinkDeConexao(
  deps: Dependencias & { urlApp: string; segredo: string },
  p: { perfilId: string; agora: Date; voltarPara?: string },
): Promise<string> {
  const [perfil] = await deps.db.query<{ id: string; unipile_account_id: string | null; unipile_status: string | null }>(
    "select id, unipile_account_id, unipile_status from public.perfis where id = $1::uuid",
    [p.perfilId],
  );
  if (!perfil) throw new Error("Perfil não encontrado");

  // Conta removida da Unipile não se reconecta: o id não existe mais, então
  // conecta de novo como conta nova e o callback troca o id no perfil.
  const contaParaReconectar = perfil.unipile_status === "DELETED" ? null : perfil.unipile_account_id;
  const notify = new URL("/api/unipile/conta", deps.urlApp);
  notify.searchParams.set("segredo", deps.segredo);
  return deps.unipile.gerarLinkDeConexao({
    tipo: contaParaReconectar ? "reconnect" : "create",
    contaParaReconectar: contaParaReconectar ?? undefined,
    nome: perfil.id,
    notifyUrl: notify.toString(),
    sucessoUrl: new URL(`${p.voltarPara ?? "/settings/linkedin"}?conexao=ok`, deps.urlApp).toString(),
    falhaUrl: new URL(`${p.voltarPara ?? "/settings/linkedin"}?conexao=falhou`, deps.urlApp).toString(),
    expiraEm: new Date(p.agora.getTime() + 30 * 60_000),
  });
}

/**
 * O que a tela diz quando a Unipile não gera o link. O link só usa a chave da
 * API, então 401 aqui é a chave, não a conta. Erro que não é da Unipile sobe.
 */
export function mensagemDaFalhaDoLink(erro: unknown): string {
  if (!(erro instanceof ErroUnipile)) throw erro;
  if (erro.status === 401) return `A Unipile recusou a chave da API (${erro.message}). ${PECA_A_CHAVE}`;
  return `A Unipile não gerou o link de conexão (${erro.message}). Tente de novo em instantes.`;
}

const esquemaNotificacao = z.object({
  status: z.enum(["CREATION_SUCCESS", "RECONNECTED"]),
  account_id: z.string().min(1),
  name: z.uuid(),
});

export type ResultadoConexao = { ok: true; perfilId: string } | { ok: false; motivo: string };

/**
 * Callback do hosted auth. O payload não é assinado, então a conta é
 * confirmada na própria Unipile antes de ser ligada ao perfil. O perfil
 * continua pausado: ativar é sempre um ato humano (§4.4).
 */
export async function registrarContaConectada(
  deps: Dependencias,
  corpo: unknown,
  agora: Date,
): Promise<ResultadoConexao> {
  const notificacao = esquemaNotificacao.safeParse(corpo);
  if (!notificacao.success) return { ok: false, motivo: "payload inválido" };
  const { account_id: accountId, name: perfilId, status } = notificacao.data;
  return ligarContaAoPerfil(deps, {
    perfilId,
    accountId,
    evento: status === "RECONNECTED" ? "conta_reconectada" : "conta_conectada",
    ator: "unipile",
    agora,
  });
}

/**
 * Liga uma conta da Unipile a um perfil: confere na Unipile que a conta é do
 * LinkedIn, lê o dono, recusa conta que já está em outro perfil (de qualquer
 * organização) e grava provider, tipo, limite da nota e status. Usada pelo
 * callback do hosted auth e pela Plataforma. O perfil continua pausado (§4.4).
 */
export async function ligarContaAoPerfil(
  deps: Dependencias,
  p: { perfilId: string; accountId: string; evento: "conta_conectada" | "conta_reconectada"; ator: string; agora: Date },
): Promise<ResultadoConexao> {
  const { perfilId, accountId } = p;
  const [perfil] = await deps.db.query<{ id: string }>("select id from public.perfis where id = $1::uuid", [perfilId]);
  if (!perfil) return { ok: false, motivo: "perfil desconhecido" };

  const conta = await deps.unipile.obterConta(accountId);
  if (conta.tipo !== "LINKEDIN") return { ok: false, motivo: `conta ${conta.tipo} não é do LinkedIn` };
  const dono = await deps.unipile.obterDonoDaConta(accountId);
  const tipoConta = dono.salesNavigator ? "sales_navigator" : dono.premium ? "premium" : "gratuita";

  return deps.db.transacao(async (tx) => {
    const [outro] = await tx.query<{ slug: string }>(
      "select slug from public.perfis where unipile_account_id = $1 and id <> $2::uuid",
      [accountId, perfilId],
    );
    if (outro) return { ok: false as const, motivo: `conta já ligada ao perfil ${outro.slug}` };

    // Conta nova no perfil leva o nome de quem é dono no LinkedIn; reconectar a
    // mesma conta mantém o nome que alguém tenha editado.
    await tx.query(
      `update public.perfis
          set unipile_account_id = $2, linkedin_provider_id = $3, tipo_conta = $4,
              limite_nota_convite = $5, unipile_status = $6, unipile_status_em = $7,
              nome = case when unipile_account_id is distinct from $2 and $8 <> '' then $8 else nome end
        where id = $1::uuid`,
      [perfilId, accountId, dono.providerId, tipoConta, tipoConta === "gratuita" ? 200 : 300, statusMaisGrave(conta.status), p.agora, dono.nome.trim()],
    );
    await registrarEvento(tx, {
      tipo: p.evento,
      entidade: "perfil",
      entidadeId: perfilId,
      perfilId,
      payload: { account_id: accountId, tipo_conta: tipoConta, provider_id: dono.providerId },
      ator: p.ator,
      em: p.agora,
    });
    return { ok: true as const, perfilId };
  });
}

/** Uma conta do LinkedIn na Unipile que nenhum perfil tem (§4.14). */
export type ContaSemPerfil = { id: string; nome: string | null; status: string; criadaEm: Date | null };

/**
 * As contas `LINKEDIN` do workspace da Unipile cujo id não está em nenhum
 * perfil, de nenhuma organização: as que foram conectadas direto no dashboard
 * da Unipile. O workspace é um só para todas as organizações, então só a
 * Plataforma chama, pela conexão do sistema, depois de `PLATAFORMA_ADMINS`.
 */
export async function contasSemPerfil(deps: Dependencias): Promise<ContaSemPerfil[]> {
  const contas = await deps.unipile.listarContas();
  const ligadas = await deps.db.query<{ id: string }>(
    "select unipile_account_id as id from public.perfis where unipile_account_id is not null",
  );
  const ids = new Set(ligadas.map((linha) => linha.id));
  return contas
    .filter((conta) => conta.tipo === "LINKEDIN" && !ids.has(conta.id))
    .map((conta) => ({
      id: conta.id,
      nome: conta.nome,
      status: statusMaisGrave(conta.status),
      criadaEm: conta.criadaEm ? new Date(conta.criadaEm) : null,
    }));
}

/** Para onde a Plataforma pode ligar uma conta solta: os perfis livres de cada organização. */
export type DestinoDaLigacao = {
  organizacaoId: string;
  organizacaoNome: string;
  perfis: { id: string; nome: string; casa: boolean; contaApagada: boolean }[];
};

/**
 * Cada organização com os perfis que podem receber uma conta: sem conta ou
 * com a conta apagada na Unipile (`DELETED`). A organização entra mesmo sem
 * perfil livre, porque dá para ligar numa conta nova. Só pela conexão do sistema.
 */
export async function destinosDaLigacao(db: Db): Promise<DestinoDaLigacao[]> {
  const organizacoes = await db.query<{ id: string; nome: string }>("select id, nome from public.organizacoes order by criado_em");
  const perfis = await db.query<{ id: string; nome: string; casa: boolean; contaApagada: boolean; organizacaoId: string }>(
    `select id, nome, casa, unipile_account_id is not null as "contaApagada", organizacao_id as "organizacaoId"
       from public.perfis
      where unipile_account_id is null or unipile_status = 'DELETED'
      order by casa desc, nome`,
  );
  return organizacoes.map((organizacao) => ({
    organizacaoId: organizacao.id,
    organizacaoNome: organizacao.nome,
    perfis: perfis
      .filter((perfil) => perfil.organizacaoId === organizacao.id)
      .map(({ id, nome, casa, contaApagada }) => ({ id, nome, casa, contaApagada })),
  }));
}

/**
 * Liga pela Plataforma uma conta que já está na Unipile (§4.14): num perfil
 * livre da organização ou numa conta nova dela. A conta nova fica com quem é
 * admin da organização há mais tempo, que é quem a opera. A recusa de conta
 * já ligada vem antes de criar a conta nova, para não deixar perfil vazio.
 * O perfil segue pausado. Só pela conexão do sistema, depois de `PLATAFORMA_ADMINS`.
 */
export async function ligarContaPelaPlataforma(
  deps: Dependencias,
  p: {
    accountId: string;
    destino: { perfilId: string } | { organizacaoId: string };
    nomeDaConta: string;
    /** E-mail de quem é da plataforma. */
    ator: string;
    agora: Date;
  },
): Promise<Resultado<{ perfilId: string; mensagem: string }>> {
  const [outro] = await deps.db.query<{ slug: string }>("select slug from public.perfis where unipile_account_id = $1", [p.accountId]);
  if (outro) return { ok: false, erro: `A conta já está ligada ao perfil ${outro.slug}.` };

  let perfilId: string;
  if ("perfilId" in p.destino) {
    const [perfil] = await deps.db.query<{ id: string; nome: string; livre: boolean }>(
      `select id, nome, unipile_account_id is null or unipile_status = 'DELETED' as livre
         from public.perfis where id = $1::uuid`,
      [p.destino.perfilId],
    );
    if (!perfil) return { ok: false, erro: "Perfil não encontrado." };
    if (!perfil.livre) return { ok: false, erro: `O perfil ${perfil.nome} já tem uma conta do LinkedIn.` };
    perfilId = perfil.id;
  } else {
    const [organizacao] = await deps.db.query<{ nome: string; operadorId: string | null }>(
      `select g.nome,
              (select o.id from public.operadores o
                where o.organizacao_id = g.id and o.ativo
                order by o.papel = 'admin' desc, o.criado_em limit 1) as "operadorId"
         from public.organizacoes g where g.id = $1::uuid`,
      [p.destino.organizacaoId],
    );
    if (!organizacao) return { ok: false, erro: "Organização não encontrada." };
    if (!organizacao.operadorId) return { ok: false, erro: `${organizacao.nome} não tem ninguém ativo na equipe para operar a conta nova.` };
    perfilId = await contaNovaDoLinkedin(deps.db, {
      organizacaoId: p.destino.organizacaoId,
      operadorId: organizacao.operadorId,
      nome: p.nomeDaConta,
      agora: p.agora,
    });
  }

  // O nome do perfil antes de ligar: ligar troca o nome pelo do dono no LinkedIn.
  const [antes] = await deps.db.query<{ nome: string; organizacao: string }>(
    `select p.nome, g.nome as organizacao
       from public.perfis p join public.organizacoes g on g.id = p.organizacao_id
      where p.id = $1::uuid`,
    [perfilId],
  );
  const resultado = await ligarContaAoPerfil(deps, {
    perfilId,
    accountId: p.accountId,
    evento: "conta_conectada",
    ator: p.ator,
    agora: p.agora,
  });
  if (!resultado.ok) return { ok: false, erro: `A conta não foi ligada: ${resultado.motivo}.` };
  return {
    ok: true,
    perfilId,
    mensagem: `Conta de ${p.nomeDaConta} ligada ao perfil ${antes!.nome} (${antes!.organizacao}). O perfil segue pausado.`,
  };
}

const FONTES_DE_WEBHOOK = ["messaging", "users", "account_status"] as const;

const EVENTOS_DE_STATUS = [
  "creation_success",
  "creation_fail",
  "deleted",
  "reconnected",
  "sync_success",
  "stopped",
  "ok",
  "connecting",
  "error",
  "credentials",
  "permissions",
];

/**
 * Garante os 3 webhooks do SDR na Unipile, com o header secreto. Idempotente:
 * não recria o que já existe para a mesma URL e fonte.
 */
export async function garantirWebhooks(
  unipile: ClienteUnipile,
  p: { urlApp: string; segredo: string },
): Promise<{ criados: string[]; existentes: string[] }> {
  const url = new URL("/api/webhooks/unipile", p.urlApp).toString();
  const atuais = await unipile.listarWebhooks();
  const criados: string[] = [];
  const existentes: string[] = [];
  for (const fonte of FONTES_DE_WEBHOOK) {
    if (atuais.some((w) => w.url === url && w.fonte === fonte)) {
      existentes.push(fonte);
      continue;
    }
    await unipile.criarWebhook({
      url,
      fonte,
      nome: `guessless-sdr ${fonte}`,
      headers: { "Unipile-Auth": p.segredo, "Content-Type": "application/json" },
      eventos:
        fonte === "account_status" ? EVENTOS_DE_STATUS : fonte === "messaging" ? ["message_received"] : ["new_relation"],
    });
    criados.push(fonte);
  }
  return { criados, existentes };
}
