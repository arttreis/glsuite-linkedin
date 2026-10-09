import { beforeEach, describe, expect, it } from "vitest";
import type { Dossie } from "@/domain/dossie";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import type { LeitorDeSite } from "@/server/oferta/leitor";
import {
  concluirLeitura,
  dossieConfirmado,
  iniciarLeitura,
  ofertaDaOrganizacao,
  salvarDossie,
  voltarAoConfirmado,
} from "@/server/oferta/oferta";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-10T12:00:00Z");
const USO = { entrada: 20_000, saida: 3_000, cacheLeitura: 0, cacheEscrita: 0 };

const DOSSIE: Dossie = {
  empresa: { nome: "GuessLess", resumo: "Consultoria de crescimento para e-commerce." },
  produtos: [{ nome: "Diagnóstico de margem", descricao: "Mapa da margem por canal.", para_quem: "e-commerce" }],
  para_quem: "E-commerces de médio porte.",
  diferenciais: [],
  provas: [],
  dores: [],
  objecoes: [],
  tom_de_voz: "Direto.",
  idioma: "pt",
};

function leitorFalso(
  opcoes: { falharLeitura?: boolean; dossie?: Dossie } = {},
): LeitorDeSite & { chamadas: { url?: string; dominio?: string; entrada?: string }[] } {
  const chamadas: { url?: string; dominio?: string; entrada?: string }[] = [];
  return {
    chamadas,
    async ler(p) {
      chamadas.push({ url: p.url, dominio: p.dominio });
      if (opcoes.falharLeitura) throw new ErroDoModelo("Não consegui abrir nenhuma página do site.");
      return {
        notas: "A GuessLess vende diagnóstico de margem.",
        fontes: [
          { url: "https://guessless.com.br/", titulo: "GuessLess" },
          { url: "https://guessless.com.br/sobre", titulo: "Sobre" },
        ],
        uso: USO,
        modelo: "claude-sonnet-5",
      };
    },
    async estruturar(p) {
      chamadas.push({ entrada: p.entrada });
      return { saida: opcoes.dossie ?? DOSSIE, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

describe("oferta: leitura do site e dossiê", () => {
  let banco: BancoDeTeste;
  let guessless: string;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
    operador = await criarOperador(banco.db, { nome: "Arthur", papel: "admin" });
  });

  const iniciar = (url: string, organizacaoId = guessless, quem = operador) =>
    comOperador(banco.db, quem, (tx) => iniciarLeitura(tx, { organizacaoId, url, operadorId: quem, agora: AGORA }));

  it("sem oferta, a situação é 'nenhuma'", async () => {
    const situacao = await ofertaDaOrganizacao(banco.db, guessless, AGORA);
    expect(situacao.leitura.status).toBe("nenhuma");
  });

  it("lendo → pronta, com dossiê, fontes, modelo e custo", async () => {
    const inicio = await iniciar("guessless.com.br");
    expect(inicio).toMatchObject({ ok: true });
    expect((await ofertaDaOrganizacao(banco.db, guessless, AGORA)).leitura.status).toBe("lendo");

    const leitor = leitorFalso();
    await concluirLeitura({ db: banco.db, leitor, agora: () => AGORA }, { ofertaId: (inicio as { ofertaId: string }).ofertaId });

    expect(leitor.chamadas[0]).toEqual({ url: "https://guessless.com.br/", dominio: "guessless.com.br" });
    expect(leitor.chamadas[1]!.entrada).toContain("A GuessLess vende diagnóstico de margem.");
    const situacao = await ofertaDaOrganizacao(banco.db, guessless, AGORA);
    expect(situacao.leitura.status).toBe("pronta");
    expect(situacao.dossie).toEqual(DOSSIE);
    expect(situacao.fontes).toHaveLength(2);
    // 2 chamadas de 20 mil tokens de entrada e 3 mil de saída no Sonnet 5 (US$ 2 / 10 por milhão).
    expect(situacao.custoUsd).toBeCloseTo(0.14, 4);
    const [evento] = await banco.db.query<{ payload: { paginas: number } }>("select payload from public.eventos where tipo = 'dossie_gerado'");
    expect(evento!.payload.paginas).toBe(2);
  });

  it("falha da IA vira erro com motivo e preserva o dossiê anterior", async () => {
    const primeira = (await iniciar("guessless.com.br")) as { ofertaId: string };
    await concluirLeitura({ db: banco.db, leitor: leitorFalso(), agora: () => AGORA }, primeira);

    const segunda = (await iniciar("guessless.com.br")) as { ofertaId: string };
    await concluirLeitura({ db: banco.db, leitor: leitorFalso({ falharLeitura: true }), agora: () => AGORA }, segunda);

    const situacao = await ofertaDaOrganizacao(banco.db, guessless, AGORA);
    expect(situacao.leitura).toMatchObject({ status: "erro", erro: "Não consegui abrir nenhuma página do site." });
    expect(situacao.dossie).toEqual(DOSSIE);
  });

  it("recusa uma segunda leitura enquanto a primeira está em andamento", async () => {
    await iniciar("guessless.com.br");
    expect(await iniciar("guessless.com.br")).toEqual({ ok: false, erro: "Já estou lendo o site. Espere terminar." });
  });

  it("leitura em andamento há mais de 5 minutos aparece como parada e pode recomeçar", async () => {
    await iniciar("guessless.com.br");
    const depois = new Date(AGORA.getTime() + 6 * 60 * 1000);
    expect((await ofertaDaOrganizacao(banco.db, guessless, depois)).leitura.status).toBe("parada");
    const nova = await comOperador(banco.db, operador, (tx) =>
      iniciarLeitura(tx, { organizacaoId: guessless, url: "guessless.com.br", operadorId: operador, agora: depois }),
    );
    expect(nova).toMatchObject({ ok: true });
  });

  it("recusa localhost e IP antes de chamar a IA", async () => {
    expect(await iniciar("localhost:3000")).toMatchObject({ ok: false });
    expect(await iniciar("http://10.0.0.1")).toMatchObject({ ok: false });
  });

  it("recusa quando a leitura está desligada", async () => {
    await banco.db.query("update public.configuracoes set valor = '{\"ativo\": false, \"max_paginas\": 8}' where chave = 'dossie'");
    expect(await iniciar("guessless.com.br")).toEqual({ ok: false, erro: "A leitura de site está desligada pelo admin." });
  });

  it("a outra organização não lê nem grava a oferta da GuessLess", async () => {
    await iniciar("guessless.com.br");
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: outra });
    const vista = await comOperador(banco.db, deFora, (tx) => ofertaDaOrganizacao(tx, guessless, AGORA));
    expect(vista.leitura.status).toBe("nenhuma");
    await expect(iniciar("outra.com.br", guessless, deFora)).rejects.toThrow(/row-level security/);
  });
});

describe("dossiê editável e confirmado (SDR-24)", () => {
  let banco: BancoDeTeste;
  let guessless: string;
  let operador: string;

  const ler = async (dossie = DOSSIE) => {
    const inicio = (await comOperador(banco.db, operador, (tx) =>
      iniciarLeitura(tx, { organizacaoId: guessless, url: "guessless.com.br", operadorId: operador, agora: AGORA }),
    )) as { ofertaId: string };
    await concluirLeitura({ db: banco.db, leitor: leitorFalso({ dossie }), agora: () => AGORA }, inicio);
  };

  const salvar = (dossie: unknown, confirmar: boolean, p: { quem?: string; agora?: Date } = {}) =>
    comOperador(banco.db, p.quem ?? operador, (tx) =>
      salvarDossie(tx, { organizacaoId: guessless, dossie, confirmar, operadorId: p.quem ?? operador, agora: p.agora ?? AGORA }),
    );

  const situacao = () => ofertaDaOrganizacao(banco.db, guessless, AGORA);

  const eventos = async (tipo: string) =>
    banco.db.query<{ ator: string }>("select ator from public.eventos where tipo = $1 order by em", [tipo]);

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
    operador = await criarOperador(banco.db, { nome: "Arthur", papel: "admin" });
    await ler();
  });

  it("a leitura sozinha não vale: sem confirmação, não há dossiê para os públicos", async () => {
    expect(await dossieConfirmado(banco.db, guessless)).toBeNull();
    expect(await situacao()).toMatchObject({ dossie: DOSSIE, confirmado: null, rascunhoPendente: true });
  });

  it("confirmar grava quem e quando, e o dossiê passa a valer", async () => {
    expect(await salvar(DOSSIE, true)).toEqual({ ok: true });

    expect(await dossieConfirmado(banco.db, guessless)).toEqual(DOSSIE);
    expect(await situacao()).toMatchObject({ confirmado: { em: AGORA, por: "Arthur" }, rascunhoPendente: false, editado: null });
    expect(await eventos("dossie_confirmado")).toEqual([{ ator: operador }]);
    // Confirmar sem mudar nada não é edição.
    expect(await eventos("dossie_editado")).toEqual([]);
  });

  it("a edição grava quem e quando e só vale depois de confirmada", async () => {
    await salvar(DOSSIE, true);
    const depois = new Date(AGORA.getTime() + 60_000);
    const editado: Dossie = { ...DOSSIE, diferenciais: ["Engenharia, não achismo"] };

    expect(await salvar(editado, false, { agora: depois })).toEqual({ ok: true });
    expect(await situacao()).toMatchObject({ dossie: editado, editado: { em: depois, por: "Arthur" }, rascunhoPendente: true });
    expect(await dossieConfirmado(banco.db, guessless)).toEqual(DOSSIE);
    expect(await eventos("dossie_editado")).toEqual([{ ator: operador }]);

    await salvar(editado, true, { agora: depois });
    expect(await dossieConfirmado(banco.db, guessless)).toEqual(editado);
    expect((await situacao()).rascunhoPendente).toBe(false);
  });

  it("ler o site de novo não muda o confirmado até nova confirmação", async () => {
    await salvar(DOSSIE, true);
    const lidoDeNovo: Dossie = { ...DOSSIE, empresa: { nome: "GuessLess", resumo: "Texto novo do site." } };

    await ler(lidoDeNovo);

    expect(await situacao()).toMatchObject({ dossie: lidoDeNovo, rascunhoPendente: true, editado: null });
    expect(await dossieConfirmado(banco.db, guessless)).toEqual(DOSSIE);
  });

  it("descartar o rascunho volta ao confirmado", async () => {
    await salvar(DOSSIE, true);
    await ler({ ...DOSSIE, tom_de_voz: "Formal." });

    const voltou = await comOperador(banco.db, operador, (tx) =>
      voltarAoConfirmado(tx, { organizacaoId: guessless, operadorId: operador, agora: AGORA }),
    );

    expect(voltou).toEqual({ ok: true });
    expect(await situacao()).toMatchObject({ dossie: DOSSIE, rascunhoPendente: false });
  });

  it("sem confirmado, não há para onde voltar", async () => {
    const voltou = await comOperador(banco.db, operador, (tx) =>
      voltarAoConfirmado(tx, { organizacaoId: guessless, operadorId: operador, agora: AGORA }),
    );
    expect(voltou).toEqual({ ok: false, erro: "Ainda não há dossiê confirmado para voltar." });
  });

  it("item em branco é descartado; dossiê inválido é recusado com a seção do problema", async () => {
    expect(await salvar({ ...DOSSIE, dores: ["Refém do marketplace", "  "] }, false)).toEqual({ ok: true });
    expect((await situacao()).dossie!.dores).toEqual(["Refém do marketplace"]);

    expect(await salvar({ ...DOSSIE, produtos: [] }, true)).toEqual({ ok: false, erro: "O que vocês vendem: precisa de pelo menos 1." });
    expect(await dossieConfirmado(banco.db, guessless)).toBeNull();
  });

  it("não edita enquanto o site está sendo lido", async () => {
    await comOperador(banco.db, operador, (tx) =>
      iniciarLeitura(tx, { organizacaoId: guessless, url: "guessless.com.br", operadorId: operador, agora: AGORA }),
    );
    expect(await salvar(DOSSIE, true)).toEqual({ ok: false, erro: "Espere a leitura do site terminar: ela traz um rascunho novo." });
  });

  it("outra organização não lê nem edita o dossiê da GuessLess", async () => {
    await salvar(DOSSIE, true);
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: outra });

    expect(await comOperador(banco.db, deFora, (tx) => dossieConfirmado(tx, guessless))).toBeNull();
    expect(await salvar({ ...DOSSIE, tom_de_voz: "Invasor." }, true, { quem: deFora })).toEqual({
      ok: false,
      erro: "Analise o site antes de editar o dossiê.",
    });
    expect(await dossieConfirmado(banco.db, guessless)).toEqual(DOSSIE);
  });
});
