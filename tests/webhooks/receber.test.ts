import { beforeEach, describe, expect, it } from "vitest";
import { processarWebhook, reprocessarWebhooksPendentes, type Manipuladores } from "@/server/webhooks/processar";
import { receberWebhookUnipile } from "@/server/webhooks/receber";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";
import { mensagemRecebida } from "../support/payloads-unipile";

const SEGREDO = "segredo-dos-webhooks-123";
const AGORA = new Date("2026-10-01T14:00:00Z");

function requisicao(corpo: unknown, segredo: string | null = SEGREDO) {
  return new Request("https://sdr.guessless.com.br/api/webhooks/unipile", {
    method: "POST",
    headers: segredo ? { "Unipile-Auth": segredo } : {},
    body: JSON.stringify(corpo),
  });
}

describe("receptor de webhooks da Unipile", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let receber: (req: Request, manipuladores?: Manipuladores) => Promise<Response>;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    receber = (req, manipuladores) =>
      receberWebhookUnipile(req, {
        db: banco.db,
        segredo: SEGREDO,
        agora: () => AGORA,
        processar: (id) => processarWebhook({ db: banco.db, unipile, agora: AGORA }, id, manipuladores),
      });
  });

  const contar = async (sql: string) => (await banco.db.query<{ n: number }>(`select count(*)::int as n from ${sql}`))[0]!.n;

  it("recusa entrega sem o header secreto", async () => {
    expect((await receber(requisicao(mensagemRecebida(), null))).status).toBe(401);
    expect((await receber(requisicao(mensagemRecebida(), "outro-segredo"))).status).toBe(401);
    expect(await contar("public.webhooks_recebidos")).toBe(0);
  });

  it("o mesmo webhook entregue 2× gera 1 efeito", async () => {
    let efeitos = 0;
    const contarEfeito: Manipuladores = {
      mensagem: async () => {
        efeitos += 1;
      },
      novaRelacao: async () => undefined,
      statusDaConta: async () => undefined,
    };

    const primeira = await receber(requisicao(mensagemRecebida()), contarEfeito);
    const segunda = await receber(requisicao(mensagemRecebida()), contarEfeito);

    expect(await primeira.json()).toEqual({ ok: true });
    expect(await segunda.json()).toEqual({ ok: true, duplicado: true });
    expect(efeitos).toBe(1);
    expect(await contar("public.webhooks_recebidos where processado_em is not null")).toBe(1);
  });

  it("conta desconectada muda o perfil para pausado com motivo", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    const desconectada = { AccountStatus: { account_id: "acc-arthur", account_type: "LINKEDIN", message: "CREDENTIALS" } };

    await receber(requisicao(desconectada));
    await receber(requisicao(desconectada));

    const [perfil] = await banco.db.query<{ status: string; motivo_pausa: string; unipile_status: string }>(
      "select status, motivo_pausa, unipile_status from public.perfis where slug = 'arthur'",
    );
    expect(perfil).toMatchObject({ status: "pausado", unipile_status: "CREDENTIALS" });
    expect(perfil!.motivo_pausa).toMatch(/desconectada/);
    expect(await contar("public.eventos where tipo = 'perfil_pausado'")).toBe(1);
  });

  it("status OK depois da pausa não reativa o perfil (despausar é manual)", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await receber(requisicao({ AccountStatus: { account_id: "acc-arthur", message: "CREDENTIALS" } }));
    await receber(requisicao({ AccountStatus: { account_id: "acc-arthur", message: "RECONNECTED" } }));
    const [perfil] = await banco.db.query<{ status: string; unipile_status: string }>(
      "select status, unipile_status from public.perfis where slug = 'arthur'",
    );
    expect(perfil).toEqual({ status: "pausado", unipile_status: "RECONNECTED" });
  });

  it("guarda o erro de processamento e reprocessa depois sem duplicar", async () => {
    let falhar = true;
    let efeitos = 0;
    const instavel: Manipuladores = {
      mensagem: async (ctx) => {
        await ctx.db.query("insert into public.eventos (tipo, entidade) values ('efeito', 'teste')");
        if (falhar) throw new Error("banco indisponível");
        efeitos += 1;
      },
      novaRelacao: async () => undefined,
      statusDaConta: async () => undefined,
    };

    expect((await receber(requisicao(mensagemRecebida()), instavel)).status).toBe(200);
    const [registro] = await banco.db.query<{ erro: string; tentativas: number }>(
      "select erro, tentativas from public.webhooks_recebidos",
    );
    expect(registro).toEqual({ erro: "banco indisponível", tentativas: 1 });
    // A transação voltou: o efeito parcial não ficou gravado.
    expect(await contar("public.eventos where tipo = 'efeito'")).toBe(0);

    falhar = false;
    expect(await reprocessarWebhooksPendentes({ db: banco.db, unipile, agora: AGORA }, instavel)).toBe(1);
    expect(await reprocessarWebhooksPendentes({ db: banco.db, unipile, agora: AGORA }, instavel)).toBe(0);
    expect(efeitos).toBe(1);
    expect(await contar("public.eventos where tipo = 'efeito'")).toBe(1);
  });
});
