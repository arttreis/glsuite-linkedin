import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { calcularFunil } from "@/server/metricas/funil";
import { registrarEvento } from "@/server/eventos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarCampanha, criarLead, criarPessoa } from "../support/fixtures";

type Roteiro = { toques: ("T1" | "T2" | "T3" | "T4")[]; aceitou?: boolean; respondeu?: boolean; conversa?: boolean; qualificado?: boolean; reuniao?: boolean };

describe("métricas e gate de leitura (SDR-14)", () => {
  let banco: BancoDeTeste;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
  });

  /** Lead com as ações enviadas, mensagens e transições do roteiro. */
  async function lead(campanhaId: string, r: Roteiro) {
    const leadId = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId, estado: r.qualificado ? "qualificado" : "em_sequencia" });
    for (const toque of r.toques) {
      await banco.db.query(
        `insert into public.acoes (lead_id, perfil_id, tipo, toque, origem, status, agendada_para, enviada_em, idempotency_key)
         select id, perfil_id, $2, $3, 'template', 'enviada', now(), now(), $4 from public.leads where id = $1::uuid`,
        [leadId, toque === "T1" ? "convite" : "dm", toque, randomUUID()],
      );
    }
    if (r.aceitou) await banco.db.query("update public.leads set aceito_em = now() where id = $1::uuid", [leadId]);
    if (r.respondeu) {
      await banco.db.query(
        `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto)
         select id, perfil_id, 'entrada', 'prospect', 'oi' from public.leads where id = $1::uuid`,
        [leadId],
      );
    }
    if (r.conversa) await registrarEvento(banco.db, { tipo: "lead_transicao", entidade: "lead", entidadeId: leadId, payload: { de: "em_sequencia", para: "em_conversa" } });
    if (r.reuniao) await banco.db.query("update public.leads set estado = 'reuniao_marcada', reuniao_em = now() where id = $1::uuid", [leadId]);
    return leadId;
  }

  it("os números batem com acoes e mensagens, e a campanha com 100 toques mostra as taxas", async () => {
    const campanha = await criarCampanha(banco.db, { nome: "Varejo SP", angulo: "Margem invisível" });
    // 40 convidados; 12 aceitaram (T2, T3 e T4); 3 responderam, 2 viraram conversa, 1 qualificado, 1 reunião.
    for (let i = 0; i < 12; i += 1) {
      await lead(campanha, {
        toques: ["T1", "T2", "T3", "T4"],
        aceitou: true,
        respondeu: i < 3,
        conversa: i < 2,
        qualificado: i === 0,
        reuniao: i === 0,
      });
    }
    for (let i = 0; i < 28; i += 1) await lead(campanha, { toques: ["T1"] });
    // 12×4 + 28 = 76 toques: ainda sem amostra.
    let [linha] = (await calcularFunil(banco.db)).porCampanha;
    expect(linha).toMatchObject({ toques: 76, convites: 40, aceites: 12, respostas: 3, conversas: 2, qualificados: 1, reunioes: 1 });
    expect(linha).toMatchObject({ comAmostra: false, taxaAceite: null, taxaRespostaSobreAceite: null });

    for (let i = 0; i < 24; i += 1) await lead(campanha, { toques: ["T1"] });
    [linha] = (await calcularFunil(banco.db)).porCampanha;
    expect(linha).toMatchObject({ toques: 100, convites: 64, aceites: 12, comAmostra: true });
    expect(linha!.taxaAceite).toBeCloseTo(12 / 64);
    expect(linha!.taxaRespostaSobreAceite).toBeCloseTo(3 / 12);

    const [contagens] = await banco.db.query<{ toques: number; convites: number; respostas: number }>(`
      select
        (select count(*)::int from public.acoes where status = 'enviada' and toque is not null) as toques,
        (select count(*)::int from public.acoes where status = 'enviada' and tipo = 'convite') as convites,
        (select count(distinct lead_id)::int from public.mensagens where direcao = 'entrada') as respostas`);
    expect(contagens).toEqual({ toques: linha!.toques, convites: linha!.convites, respostas: linha!.respostas });
  });

  it("campanha mostra sem amostra antes de 100 toques, e os agregados somam as campanhas", async () => {
    const a = await criarCampanha(banco.db, { nome: "A", angulo: "ROAS de verdade" });
    const b = await criarCampanha(banco.db, { nome: "B", angulo: "ROAS de verdade" });
    for (let i = 0; i < 60; i += 1) await lead(a, { toques: ["T1"], aceitou: i < 15 });
    for (let i = 0; i < 50; i += 1) await lead(b, { toques: ["T1"], aceitou: i < 10 });

    const funil = await calcularFunil(banco.db);
    expect(funil.porCampanha.map((l) => [l.campanha, l.toques, l.comAmostra])).toEqual([
      ["A", 60, false],
      ["B", 50, false],
    ]);
    const [angulo] = funil.porAngulo;
    expect(angulo).toMatchObject({ angulo: "ROAS de verdade", toques: 110, convites: 110, aceites: 25, comAmostra: true });
    expect(angulo!.taxaAceite).toBeCloseTo(25 / 110);
    expect(funil.porPerfil[0]).toMatchObject({ perfil: "Arthur", toques: 110 });
  });

  it("separa template de personalizado para a comparação do T1", async () => {
    const campanha = await criarCampanha(banco.db);
    const personalizado = await lead(campanha, { toques: ["T1"], aceitou: true });
    await banco.db.query("update public.leads set variante_copy = 'personalizada' where id = $1::uuid", [personalizado]);
    await lead(campanha, { toques: ["T1"] });

    const variantes = (await calcularFunil(banco.db)).porVariante.map((l) => [l.variante, l.convites, l.aceites]);
    expect(variantes).toEqual([
      ["personalizada", 1, 1],
      ["template", 1, 0],
    ]);
  });
});
