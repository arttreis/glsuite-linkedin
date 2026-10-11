import { beforeEach, describe, expect, it } from "vitest";
import type { Sdr } from "@/domain/sdr";
import { comOperador } from "@/server/db/operador";
import { definirContasDoMembro, equipeDaOrganizacao, mudarPapelDoMembro } from "@/server/organizacao/equipe";
import { contaNovaDoLinkedin } from "@/server/perfis/nova-conta";
import { gravarVersaoDoSdr, historicoDoSdr, obterSdr, voltarParaVersao } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, criarPerfilNaOrganizacao, idDaOrganizacaoGuessless, idDoPerfil } from "../support/fixtures";

const AGORA = new Date("2026-10-12T15:00:00Z");

const SDR: Sdr = {
  objetivo: "marcar 20 minutos",
  voz: "Direta.",
  abertura: "Margem por canal.",
  qualificacao: [],
  objecoes: [],
  regras: [],
  quando_chamar_voce: [],
  link_agenda: null,
};

describe("Configurações (SDR-51)", () => {
  let banco: BancoDeTeste;
  let organizacao: string;
  let admin: string;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacao = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { nome: "Duda", papel: "admin" });
    operador = await criarOperador(banco.db, { nome: "Bia", perfis: ["juliano"] });
  });

  describe("equipe", () => {
    it("só o admin muda papel e contas", async () => {
      expect(await mudarPapelDoMembro(banco.db, { adminId: operador, membroId: admin, papel: "operador", agora: AGORA })).toEqual({
        ok: false,
        erro: "Só um admin da organização muda a equipe.",
      });
      expect(
        await definirContasDoMembro(banco.db, { adminId: operador, membroId: operador, perfilIds: [await idDoPerfil(banco.db, "luiz")], agora: AGORA }),
      ).toMatchObject({ ok: false });
    });

    it("o admin troca as contas que o membro opera, e só por contas da organização", async () => {
      const luiz = await idDoPerfil(banco.db, "luiz");
      expect(await definirContasDoMembro(banco.db, { adminId: admin, membroId: operador, perfilIds: [luiz], agora: AGORA })).toEqual({ ok: true });
      const { membros } = await comOperador(banco.db, admin, (tx) => equipeDaOrganizacao(tx));
      expect(membros.find((m) => m.id === operador)!.perfilIds).toEqual([luiz]);

      const outra = await criarOrganizacao(banco.db);
      const deFora = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: outra, slug: "fora" });
      expect(await definirContasDoMembro(banco.db, { adminId: admin, membroId: operador, perfilIds: [deFora], agora: AGORA })).toEqual({
        ok: false,
        erro: "Conta fora da organização.",
      });
    });

    it("a organização nunca fica sem admin; membro de outra organização não é alcançado", async () => {
      const nova = await criarOrganizacao(banco.db);
      const dona = await criarOperador(banco.db, { papel: "admin", organizacaoId: nova });
      const colega = await criarOperador(banco.db, { organizacaoId: nova });

      expect(await mudarPapelDoMembro(banco.db, { adminId: dona, membroId: dona, papel: "operador", agora: AGORA })).toEqual({
        ok: false,
        erro: "A organização precisa de pelo menos um admin.",
      });
      expect(await mudarPapelDoMembro(banco.db, { adminId: dona, membroId: colega, papel: "admin", agora: AGORA })).toEqual({ ok: true });
      expect(await mudarPapelDoMembro(banco.db, { adminId: dona, membroId: dona, papel: "operador", agora: AGORA })).toEqual({ ok: true });

      expect(await mudarPapelDoMembro(banco.db, { adminId: admin, membroId: colega, papel: "operador", agora: AGORA })).toEqual({
        ok: false,
        erro: "Membro não encontrado.",
      });
    });
  });

  it("voltar para uma versão do SDR vira uma versão nova, sem perder o histórico", async () => {
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr: SDR, origem: "ia", por: null, agora: AGORA });
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr: { ...SDR, voz: "Leve." }, origem: "humano", por: admin, agora: AGORA });

    expect(await voltarParaVersao(banco.db, { organizacaoId: organizacao, versao: 1, operadorId: admin, agora: AGORA })).toEqual({ ok: true, versao: 3 });
    expect((await obterSdr(banco.db, organizacao))!.sdr.voz).toBe("Direta.");
    const historico = await comOperador(banco.db, admin, (tx) => historicoDoSdr(tx, organizacao));
    expect(historico.map((v) => [v.versao, v.origem, v.resumo])).toEqual([
      [3, "desfazer", "Voltou para a versão 1."],
      [2, "humano", null],
      [1, "ia", null],
    ]);
    expect(await voltarParaVersao(banco.db, { organizacaoId: organizacao, versao: 9, operadorId: admin, agora: AGORA })).toMatchObject({ ok: false });
  });

  it("vincular outra conta cria uma conta pausada, operada por quem vincula; dois cliques, uma conta", async () => {
    const [a, b] = await Promise.all([
      contaNovaDoLinkedin(banco.db, { organizacaoId: organizacao, operadorId: operador, nome: "Bia", agora: AGORA }),
      contaNovaDoLinkedin(banco.db, { organizacaoId: organizacao, operadorId: operador, nome: "Bia", agora: AGORA }),
    ]);
    expect(a).toBe(b);
    const [conta] = await banco.db.query<{ status: string; modo_resposta: string; casa: boolean; opera: boolean }>(
      `select status, modo_resposta, casa,
              exists (select 1 from public.operador_perfis where operador_id = $2::uuid and perfil_id = p.id) as opera
         from public.perfis p where id = $1::uuid`,
      [a, operador],
    );
    expect(conta).toEqual({ status: "pausado", modo_resposta: "automatico", casa: false, opera: true });
  });
});
