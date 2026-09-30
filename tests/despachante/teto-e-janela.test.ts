import { beforeEach, describe, expect, it } from "vitest";
import { dataLocal, dentroDaJanela, instanteLocal } from "@/domain/calendario";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { envios, leadsComAcao, porDia, simular, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const JANELA = { inicio: "09:00", fim: "18:00", jitter_min: [3, 12] as [number, number] };
// Feriados de BR no período simulado (seed).
const FERIADOS_BR = new Set(["2026-10-12"]);

describe("despachante com relógio simulado (SDR-06)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    // Ativado na segunda 05/10/2026: semana 1 vai até domingo 11/10.
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-05T11:00:00Z", accountId: "acc-arthur" });
  });

  it("nunca excede o teto, e duas campanhas no mesmo perfil dividem o teto", async () => {
    const campanhaA = await criarCampanha(banco.db, { nome: "Varejo" });
    const campanhaB = await criarCampanha(banco.db, { nome: "Indústria", angulo: "ROAS de verdade" });
    const desde = instanteLocal("2026-10-05", "08:00", SP);
    await leadsComAcao(banco.db, { campanhaId: campanhaA, quantidade: 60, desde });
    await leadsComAcao(banco.db, { campanhaId: campanhaB, quantidade: 60, desde });

    // Segunda 05/10 a quarta 14/10: semana 1, fim de semana, feriado (12/10) e começo da semana 2.
    await simular(banco.db, unipile, { de: "2026-10-05", ate: "2026-10-14" });

    const convites = (await envios(banco.db)).filter((e) => e.tipo === "convite");
    const dias = porDia(convites);
    expect(Object.fromEntries(dias)).toEqual({
      "2026-10-05": 8,
      "2026-10-06": 8,
      "2026-10-07": 8,
      "2026-10-08": 8,
      "2026-10-09": 8,
      "2026-10-13": 12,
      "2026-10-14": 12,
    });
    // Nenhuma janela móvel de 7 dias passa do teto semanal do Arthur (75).
    for (const envio of convites) {
      const fim = new Date(envio.enviada_em).getTime();
      const naJanela = convites.filter((e) => {
        const t = new Date(e.enviada_em).getTime();
        return t <= fim && t > fim - 7 * 86_400_000;
      });
      expect(naJanela.length).toBeLessThanOrEqual(75);
    }
    // As duas campanhas receberam envios do mesmo saldo.
    const porCampanha = new Set(convites.map((e) => e.campanha_id));
    expect(porCampanha).toEqual(new Set([campanhaA, campanhaB]));
    expect(unipile.chamadasDe("enviarConvite")).toHaveLength(convites.length);
  });

  it("o teto semanal (janela móvel de 7 dias) segura mesmo com saldo diário", async () => {
    await banco.db.query("update public.perfis set teto_convites_semana = 20 where slug = 'arthur'");
    const campanha = await criarCampanha(banco.db);
    await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 60, desde: instanteLocal("2026-10-05", "08:00", SP) });

    await simular(banco.db, unipile, { de: "2026-10-05", ate: "2026-10-16" });

    const convites = (await envios(banco.db)).filter((e) => e.tipo === "convite");
    expect(Object.fromEntries(porDia(convites))).toMatchObject({ "2026-10-05": 8, "2026-10-06": 8, "2026-10-07": 4 });
    for (const envio of convites) {
      const fim = new Date(envio.enviada_em).getTime();
      expect(convites.filter((e) => {
        const t = new Date(e.enviada_em).getTime();
        return t <= fim && t > fim - 7 * 86_400_000;
      }).length).toBeLessThanOrEqual(20);
    }
  });

  it("nada sai em fim de semana, feriado ou fora da janela", async () => {
    const campanha = await criarCampanha(banco.db);
    await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 80, desde: instanteLocal("2026-10-05", "00:00", SP) });

    await simular(banco.db, unipile, { de: "2026-10-09", ate: "2026-10-13" });

    const lista = await envios(banco.db);
    expect(lista.length).toBeGreaterThan(0);
    for (const envio of lista) {
      const quando = new Date(envio.enviada_em);
      expect(dentroDaJanela(quando, SP, JANELA, FERIADOS_BR)).toBe(true);
    }
    const dias = new Set(lista.map((e) => dataLocal(new Date(e.enviada_em), SP)));
    expect(dias).toEqual(new Set(["2026-10-09", "2026-10-13"])); // sábado, domingo e 12/10 ficam vazios
  });

  it("respeita o teto de DMs da semana", async () => {
    const campanha = await criarCampanha(banco.db);
    await leadsComAcao(banco.db, {
      campanhaId: campanha,
      quantidade: 40,
      estado: "aceito",
      toque: "T2",
      desde: instanteLocal("2026-10-05", "08:00", SP),
    });

    await simular(banco.db, unipile, { de: "2026-10-05", ate: "2026-10-06" });

    const dms = (await envios(banco.db)).filter((e) => e.tipo === "dm");
    expect(Object.fromEntries(porDia(dms))).toEqual({ "2026-10-05": 15, "2026-10-06": 15 });
  });

  it("uma ação por perfil por tick, com o intervalo aleatório entre elas", async () => {
    const campanha = await criarCampanha(banco.db);
    await leadsComAcao(banco.db, { campanhaId: campanha, quantidade: 5, desde: instanteLocal("2026-10-05", "08:00", SP) });

    await simular(banco.db, unipile, { de: "2026-10-05", ate: "2026-10-05", aleatorio: () => 1 });

    const horarios = (await envios(banco.db)).map((e) => new Date(e.enviada_em).getTime());
    expect(horarios).toHaveLength(5);
    for (let i = 1; i < horarios.length; i += 1) {
      // Jitter de 12 min com tick de 5 min: nunca menos de 12 min entre ações.
      expect(horarios[i]! - horarios[i - 1]!).toBeGreaterThanOrEqual(12 * 60_000);
    }
  });
});
