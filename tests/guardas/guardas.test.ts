import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal, somarDiasUteis } from "@/domain/calendario";
import { enviarAlertasPendentes, type EnviadorDeEmail } from "@/server/alertas/alertas";
import { avaliarGuardas } from "@/server/guardas/guardas";
import { despausarPerfil, ErroDeAtivacao, pausarPerfil } from "@/server/perfis/pausa";
import { executarTick } from "@/server/tick";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarOperador } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

// Quinta 01/10/2026, 14h em São Paulo.
const AGORA = instanteLocal("2026-10-01", "14:00", SP);
const DIAS_DE_ENVIO = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];

describe("guardas de conta (SDR-08)", () => {
  let banco: BancoDeTeste;
  let arthur: string;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    arthur = await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-09-01T12:00:00Z", accountId: "acc-arthur" });
    operador = await criarOperador(banco.db, { nome: "Juliano", perfis: ["arthur"] });
    await banco.db.query("update public.configuracoes set valor = '\"arthur@guessless.com.br\"' where chave = 'alerta_admin_email'");
    await banco.db.query("update public.perfis set email_alerta = 'dono@guessless.com.br' where id = $1::uuid", [arthur]);
  });

  /** `total` convites já enviados (5 por dia útil), `aceitos` deles aceitos no dia seguinte. */
  async function convitesEnviados(
    total: number,
    aceitos: number,
    dias = DIAS_DE_ENVIO,
    aceitoSe: (i: number) => boolean = (i) => i < aceitos,
  ) {
    const campanha = await criarCampanha(banco.db);
    const leads = await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: total, desde: AGORA });
    for (const [i, leadId] of leads.entries()) {
      const dia = dias[Math.floor(i / 5) % dias.length]!;
      const enviadaEm = instanteLocal(dia, "10:00", SP);
      await banco.db.query(
        "update public.acoes set status = 'enviada', enviada_em = $2 where lead_id = $1::uuid and tipo = 'convite'",
        [leadId, enviadaEm],
      );
      const aceito = aceitoSe(i);
      await banco.db.query(
        "update public.leads set estado = $2, convite_enviado_em = $3, aceito_em = $4 where id = $1::uuid",
        [
          leadId,
          aceito ? "aceito" : "convite_enviado",
          enviadaEm,
          aceito ? instanteLocal(somarDiasUteis(dia, 1, new Set()), "11:00", SP) : null,
        ],
      );
    }
  }

  const perfil = async () =>
    (await banco.db.query<{ status: string; motivo_pausa: string | null }>(
      "select status, motivo_pausa from public.perfis where id = $1::uuid",
      [arthur],
    ))[0]!;

  it.each([
    [25, 2, "8%"],
    [25, 3, "12%"],
  ])("aceite de ~10%% com %i convites (%i aceitos) pausa o perfil", async (total, aceitos, taxa) => {
    await convitesEnviados(total, aceitos);

    const resultado = await avaliarGuardas(banco.db, arthur, AGORA);

    expect(resultado.pausou).toBe(true);
    expect(await perfil()).toEqual({
      status: "pausado",
      motivo_pausa: `Taxa de aceite de ${taxa} em 3 dias úteis (${aceitos} de ${total} convites), abaixo de 15%.`,
    });
    const [alerta] = await banco.db.query<{ destinatarios: string[]; assunto: string }>(
      "select destinatarios, assunto from public.alertas",
    );
    expect(alerta).toEqual({
      destinatarios: ["dono@guessless.com.br", "arthur@guessless.com.br"],
      assunto: "[SDR] Perfil Arthur pausado",
    });
  });

  it("não pausa com aceite saudável", async () => {
    await convitesEnviados(25, 8);
    expect((await avaliarGuardas(banco.db, arthur, AGORA)).pausou).toBe(false);
  });

  it("não pausa abaixo da amostra mínima", async () => {
    await convitesEnviados(19, 0);
    expect((await avaliarGuardas(banco.db, arthur, AGORA)).pausou).toBe(false);
  });

  it("não conta convite que ainda não teve os 3 dias úteis para ser aceito", async () => {
    await convitesEnviados(25, 0, ["2026-09-30", "2026-10-01"]);
    expect((await avaliarGuardas(banco.db, arthur, AGORA)).pausou).toBe(false);
    expect((await perfil()).status).toBe("ativo");
  });

  it("despausar exige ação humana registrada em eventos, e o contador recomeça", async () => {
    await convitesEnviados(25, 2);
    await avaliarGuardas(banco.db, arthur, AGORA);
    expect((await perfil()).status).toBe("pausado");

    // Nenhuma rodada automática despausa.
    await avaliarGuardas(banco.db, arthur, new Date(AGORA.getTime() + 3_600_000));
    expect((await perfil()).status).toBe("pausado");

    const depois = new Date(AGORA.getTime() + 2 * 3_600_000);
    await despausarPerfil(banco.db, { perfilId: arthur, operadorId: operador, agora: depois });

    const [evento] = await banco.db.query<{ ator: string; payload: { primeira_ativacao: boolean; motivo_da_pausa: string } }>(
      "select ator, payload from public.eventos where tipo = 'perfil_despausado'",
    );
    expect(evento!.ator).toBe(operador);
    expect(evento!.payload.primeira_ativacao).toBe(false);
    expect(evento!.payload.motivo_da_pausa).toMatch(/^Taxa de aceite/);

    // Os convites de antes do despausar não pausam de novo.
    expect((await avaliarGuardas(banco.db, arthur, new Date(depois.getTime() + 60_000))).pausou).toBe(false);
    expect((await perfil()).status).toBe("ativo");
  });

  it("erro de limite do LinkedIn que se repete pausa o perfil", async () => {
    for (const minutos of [10, 40]) {
      await banco.db.query(
        "insert into public.eventos (tipo, entidade, entidade_id, perfil_id, em) values ('erro_limite', 'perfil', $1, $2::uuid, $3)",
        [arthur, arthur, new Date(AGORA.getTime() - minutos * 60_000)],
      );
    }
    expect((await avaliarGuardas(banco.db, arthur, AGORA)).pausou).toBe(true);
    expect((await perfil()).motivo_pausa).toBe("Erro de limite do LinkedIn repetido (2 em 24 h).");
  });

  it("queda brusca de aceite pausa o perfil", async () => {
    // 40 convites antigos com 40% de aceite, 20 recentes com 15% (acima do mínimo, mas caiu pela metade).
    const antigos = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"];
    await convitesEnviados(40, 16, antigos, (i) => i % 5 < 2);
    await convitesEnviados(20, 3, ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]);
    const resultado = await avaliarGuardas(banco.db, arthur, AGORA);
    expect(resultado.pausou).toBe(true);
    expect((await perfil()).motivo_pausa).toBe("Queda brusca de aceite: de 40% para 15% nos últimos 20 convites.");
  });

  it("não despausa perfil sem LinkedIn saudável", async () => {
    await pausarPerfil(banco.db, { perfilId: arthur, motivo: "teste", ator: operador, agora: AGORA });
    await banco.db.query("update public.perfis set unipile_status = 'CREDENTIALS' where id = $1::uuid", [arthur]);
    await expect(despausarPerfil(banco.db, { perfilId: arthur, operadorId: operador, agora: AGORA })).rejects.toBeInstanceOf(ErroDeAtivacao);
  });

  it("a primeira ativação marca o início da semana 1", async () => {
    const jp = (await banco.db.query<{ id: string }>("select id from public.perfis where slug = 'jp'"))[0]!.id;
    await banco.db.query("update public.perfis set unipile_account_id = 'acc-jp' where id = $1::uuid", [jp]);
    expect(await despausarPerfil(banco.db, { perfilId: jp, operadorId: operador, agora: AGORA })).toEqual({ primeiraAtivacao: true });
    const [ativacao] = await banco.db.query<{ ativado_em: Date }>("select ativado_em from public.perfis where id = $1::uuid", [jp]);
    expect(new Date(ativacao!.ativado_em)).toEqual(AGORA);
  });

  describe("alertas", () => {
    it("envia o alerta da pausa com chave de idempotência e registra", async () => {
      await pausarPerfil(banco.db, { perfilId: arthur, motivo: "teste", ator: operador, agora: AGORA });
      const enviados: Parameters<EnviadorDeEmail["enviar"]>[0][] = [];
      const enviador: EnviadorDeEmail = {
        enviar: async (email) => {
          enviados.push(email);
          return { id: "email-1" };
        },
      };

      expect(await enviarAlertasPendentes(banco.db, enviador, AGORA)).toBe(1);
      expect(await enviarAlertasPendentes(banco.db, enviador, AGORA)).toBe(0);
      expect(enviados[0]).toMatchObject({
        para: ["dono@guessless.com.br", "arthur@guessless.com.br"],
        chaveIdempotencia: `sdr-alerta/pausa/${arthur}/${AGORA.toISOString()}`,
      });
    });

    it("guarda a falha de envio e tenta de novo", async () => {
      await pausarPerfil(banco.db, { perfilId: arthur, motivo: "teste", ator: operador, agora: AGORA });
      let falhar = true;
      const enviador: EnviadorDeEmail = {
        enviar: async () => {
          if (falhar) throw new Error("Resend: domínio não verificado");
          return { id: "email-2" };
        },
      };
      expect(await enviarAlertasPendentes(banco.db, enviador, AGORA)).toBe(0);
      const [alerta] = await banco.db.query<{ erro: string; tentativas: number }>("select erro, tentativas from public.alertas");
      expect(alerta).toEqual({ erro: "Resend: domínio não verificado", tentativas: 1 });
      falhar = false;
      expect(await enviarAlertasPendentes(banco.db, enviador, AGORA)).toBe(1);
    });
  });

  it("o tick roda as guardas antes do despacho: perfil pausado não envia", async () => {
    await convitesEnviados(25, 2);
    const campanha = await criarCampanha(banco.db, { nome: "Nova" });
    await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 3, desde: AGORA });
    const unipile = new UnipileFalso();

    const relatorio = await executarTick({ db: banco.db, unipile, agora: AGORA, aleatorio: () => 0.5 });

    expect(relatorio.executado).toBe(true);
    expect(unipile.chamadasDe("enviarConvite")).toHaveLength(0);
    expect((await perfil()).status).toBe("pausado");
  });
});
