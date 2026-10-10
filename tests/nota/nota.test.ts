import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import type { NotasDeAderencia } from "@/domain/nota";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import type { AvaliadorDeAderencia } from "@/server/nota/avaliador";
import { aprovarAcimaDoCorte, darNotas, situacaoDasNotas } from "@/server/nota/nota";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import { ativarPerfil, criarLead, criarOperador, criarPessoa, criarPublico, idDoPerfil } from "../support/fixtures";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);
const USO = { entrada: 1_000, saida: 200, cacheLeitura: 0, cacheEscrita: 0 };

/** Avaliador falso: a nota de cada pessoa sai da função, pelo índice no lote. */
function avaliadorFalso(nota: (indice: number, entrada: string) => number | Error): AvaliadorDeAderencia & { entradas: string[] } {
  const entradas: string[] = [];
  return {
    entradas,
    async avaliar({ entrada }) {
      entradas.push(entrada);
      const linhas = entrada.split("\n").filter((linha) => /^\d+\. /.test(linha));
      const notas: NotasDeAderencia["notas"] = [];
      for (const [indice] of linhas.entries()) {
        const valor = nota(indice, linhas[indice]!);
        if (valor instanceof Error) throw valor;
        notas.push({ indice, nota: valor, motivo: `motivo ${indice}` });
      }
      return { saida: { notas }, uso: USO, modelo: "claude-haiku-4-5" };
    },
  };
}

describe("nota de aderência (SDR-28)", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let campanhaId: string;

  async function leadEmTriagem(cargo: string, extra: { estado?: string; bloqueio?: string; nota?: number } = {}) {
    const pessoaId = await criarPessoa(banco.db, { dono: "arthur", nome: "Carla Mendes", empresa: "Loja Sul" });
    await banco.db.query("update public.pessoas set cargo = $2, localizacao = 'São Paulo' where id = $1::uuid", [pessoaId, cargo]);
    const leadId = await criarLead(banco.db, { pessoaId, campanhaId, estado: extra.estado ?? "triagem" });
    await banco.db.query("update public.leads set bloqueio_motivo = $2, nota = $3 where id = $1::uuid", [leadId, extra.bloqueio ?? null, extra.nota ?? null]);
    return leadId;
  }

  const notaDe = async (leadId: string) =>
    (await banco.db.query<{ nota: number | null; nota_motivo: string | null; estado: string }>(
      "select nota, nota_motivo, estado from public.leads where id = $1::uuid",
      [leadId],
    ))[0]!;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    const publicoId = await criarPublico(banco.db);
    const criada = await comOperador(banco.db, operador, async (tx) =>
      comecarAAbordar(tx, { publicoId, perfilId: await idDoPerfil(tx, "arthur"), operadorId: operador, agora: AGORA }),
    );
    campanhaId = (criada as { campanhaId: string }).campanhaId;
  });

  it("dá nota a quem está em triagem só com cargo, empresa e local, sem nome e sem perfil", async () => {
    const head = await leadEmTriagem("Head de E-commerce");
    const analista = await leadEmTriagem("Analista de Marketing");
    const avaliador = avaliadorFalso((_i, linha) => (linha.includes("Head") ? 88 : 25));

    expect(await darNotas({ db: banco.db, avaliador, agora: AGORA }, { campanhaId })).toEqual({ ok: true, avaliados: 2, restantes: 0 });

    expect(await notaDe(head)).toMatchObject({ nota: 88, estado: "triagem" });
    expect(await notaDe(analista)).toMatchObject({ nota: 25, nota_motivo: "motivo 1" });
    // O que vai para a IA é o que a busca trouxe; nome e URL do perfil não vão.
    expect(avaliador.entradas[0]).toContain("cargo/headline: Head de E-commerce | empresa: Loja Sul | local: São Paulo");
    expect(avaliador.entradas[0]).not.toContain("Carla");
    expect(avaliador.entradas[0]).not.toContain("linkedin.com");
    const [evento] = await banco.db.query<{ payload: { avaliados: number; versao_prompt: string } }>(
      "select payload from public.eventos where tipo = 'notas_dadas'",
    );
    expect(evento!.payload).toMatchObject({ avaliados: 2, versao_prompt: "nota-1" });
  });

  it("vai em lotes de 20, e quem já tem nota ou saiu da triagem não é avaliado de novo", async () => {
    for (let i = 0; i < 22; i++) await leadEmTriagem(`Cargo ${i}`);
    const jaTinha = await leadEmTriagem("Head de E-commerce", { nota: 91 });
    const aprovado = await leadEmTriagem("Head de E-commerce", { estado: "na_fila" });
    const avaliador = avaliadorFalso(() => 50);

    expect(await darNotas({ db: banco.db, avaliador, agora: AGORA }, { campanhaId })).toEqual({ ok: true, avaliados: 22, restantes: 0 });
    expect(avaliador.entradas).toHaveLength(2);
    expect(await notaDe(jaTinha)).toMatchObject({ nota: 91 });
    expect(await notaDe(aprovado)).toMatchObject({ nota: null });
  });

  it("falha da IA não grava nota e diz o motivo", async () => {
    const lead = await leadEmTriagem("Head de E-commerce");
    const avaliador = avaliadorFalso(() => new ErroDoModelo("O modelo recusou (cyber)."));

    expect(await darNotas({ db: banco.db, avaliador, agora: AGORA }, { campanhaId })).toEqual({
      ok: false,
      erro: "Não consegui dar as notas: O modelo recusou (cyber).",
    });
    expect(await notaDe(lead)).toMatchObject({ nota: null });
  });

  it("aprovar em lote só aprova quem passa do corte e das regras; o resto fica para olhar", async () => {
    const acima = await leadEmTriagem("Head de E-commerce", { nota: 90 });
    const bloqueado = await leadEmTriagem("Head de E-commerce", { nota: 95, bloqueio: "Já é do perfil Juliano: cada pessoa fica com um perfil só" });
    const abaixo = await leadEmTriagem("Coordenador", { nota: 60 });
    const semNota = await leadEmTriagem("Diretor");
    expect(await situacaoDasNotas(banco.db, campanhaId)).toEqual({ semNota: 1, acimaDoCorte: 1, corte: 70 });

    const resultado = await aprovarAcimaDoCorte(banco.db, { campanhaId, operadorId: operador, agora: AGORA });

    expect(resultado).toMatchObject({ aprovados: [acima], recusados: [], corte: 70 });
    expect((await notaDe(acima)).estado).toBe("na_fila");
    for (const lead of [bloqueado, abaixo, semNota]) expect((await notaDe(lead)).estado).toBe("triagem");
  });

  it("dar nota não aprova ninguém, e a nota de corte vem da configuração (D9)", async () => {
    const sessenta = await leadEmTriagem("Coordenador de E-commerce");
    await darNotas({ db: banco.db, avaliador: avaliadorFalso(() => 60), agora: AGORA }, { campanhaId });
    expect((await notaDe(sessenta)).estado).toBe("triagem");

    await banco.db.query(`update public.configuracoes set valor = valor || '{"nota_de_corte": 55}'::jsonb where chave = 'busca'`);
    const resultado = await aprovarAcimaDoCorte(banco.db, { campanhaId, operadorId: operador, agora: AGORA });
    expect(resultado).toMatchObject({ aprovados: [sessenta], corte: 55 });
  });
});
