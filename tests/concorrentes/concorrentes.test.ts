import { beforeEach, describe, expect, it } from "vitest";
import type { AnaliseDaIa } from "@/domain/concorrentes";
import type { Dossie } from "@/domain/dossie";
import { REGRAS_DA_CASA } from "@/domain/teste-do-sdr";
import { ErroDoModelo } from "@/server/agente/modelo";
import type { AnalistaDeConcorrente } from "@/server/concorrentes/analista";
import {
  analisarConcorrente,
  concorrentesConfirmados,
  confirmarConcorrentes,
  situacaoDosConcorrentes,
} from "@/server/concorrentes/concorrentes";
import { comOperador } from "@/server/db/operador";
import { gerarSdr, type GeradorDeSdr } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao } from "../support/fixtures";

const AGORA = new Date("2026-10-15T14:00:00Z");
const USO = { entrada: 5_000, saida: 600, cacheLeitura: 0, cacheEscrita: 0 };

const ANALISE: Dossie = {
  empresa: { nome: "Kakou", resumo: "SDR de LinkedIn para PMEs." },
  produtos: [{ nome: "SDR", descricao: "Prospecta e conversa no LinkedIn.", para_quem: "PMEs B2B" }],
  para_quem: "PMEs B2B.",
  diferenciais: [],
  provas: [],
  dores: [],
  objecoes: [],
  tom_de_voz: "Direto.",
  idioma: "pt",
  mercado: {
    segmentos: [],
    alternativas: ["Apollo: base de contatos e sequências (o site cita)", "Planilha: prospecção manual (a categoria implica)"],
    gatilhos: [],
  },
};

const ANALISE_DA_IA: AnaliseDaIa = {
  o_que_vende: "Base de contatos e sequências de e-mail",
  para_quem: "Times de vendas",
  posicionamento: "Tudo de prospecção num lugar só",
  onde_voce_ganha: ["Conversa no LinkedIn em português, na voz da empresa"],
};

function analistaFalso(
  opcoes: { falhar?: boolean; saida?: AnaliseDaIa } = {},
): AnalistaDeConcorrente & { leituras: { url: string; dominio: string; maxPaginas: number }[]; entradas: string[] } {
  const leituras: { url: string; dominio: string; maxPaginas: number }[] = [];
  const entradas: string[] = [];
  return {
    leituras,
    entradas,
    async ler(p) {
      leituras.push({ url: p.url, dominio: p.dominio, maxPaginas: p.maxPaginas });
      if (opcoes.falhar) throw new ErroDoModelo("Não consegui abrir nenhuma página do site.");
      return { notas: "Vende base de contatos.", fontes: [{ url: p.url, titulo: "Início" }], uso: USO, modelo: "claude-sonnet-5" };
    },
    async analisar(p) {
      entradas.push(p.entrada);
      return { saida: opcoes.saida ?? ANALISE_DA_IA, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

describe("concorrentes (SDR-68)", () => {
  let banco: BancoDeTeste;
  let organizacao: string;
  let admin: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacao = await criarOrganizacao(banco.db, { nome: "Kakou" });
    admin = await criarOperador(banco.db, { nome: "Arthur", papel: "admin", organizacaoId: organizacao });
    await banco.db.query(
      `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
       values ($1::uuid, 'https://kakou.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3)`,
      [organizacao, JSON.stringify(ANALISE), AGORA],
    );
  });

  const situacao = () => comOperador(banco.db, admin, (tx) => situacaoDosConcorrentes(tx, organizacao));
  const confirmar = (concorrentes: unknown) =>
    comOperador(banco.db, admin, (tx) => confirmarConcorrentes(tx, { organizacaoId: organizacao, concorrentes, operadorId: admin, agora: AGORA }));
  const analisar = (analista: AnalistaDeConcorrente, site: string, nome = "Concorrente") =>
    analisarConcorrente({ db: banco.db, analista, agora: () => AGORA }, { organizacaoId: organizacao, operadorId: admin, nome, site });

  it("as alternativas da análise viram a lista inicial, sem nada confirmado", async () => {
    const inicial = await situacao();
    expect(inicial).toMatchObject({ daAnalise: true, confirmados: null, restantes: 5, leituraLigada: true });
    expect(inicial.lista).toEqual([
      { nome: "Apollo", descricao: "base de contatos e sequências", site: null, origem: "site" },
      { nome: "Planilha", descricao: "prospecção manual", site: null, origem: "categoria" },
    ]);
    expect(await concorrentesConfirmados(banco.db, organizacao)).toBeNull();
  });

  it("acrescentar, editar e tirar é gravado ao confirmar", async () => {
    const { lista } = await situacao();
    const editada = [
      { ...lista[0]!, descricao: "base de contatos", site: "apollo.io" },
      { nome: "Ploomes", descricao: "CRM", site: null, origem: "voce" },
    ];
    expect(await confirmar(editada)).toEqual({ ok: true });

    const depois = await situacao();
    expect(depois).toMatchObject({ daAnalise: false, confirmados: { por: "Arthur" } });
    expect(depois.lista).toEqual([
      { nome: "Apollo", descricao: "base de contatos", site: "https://apollo.io/", origem: "site" },
      { nome: "Ploomes", descricao: "CRM", site: null, origem: "voce" },
    ]);
    const [evento] = await banco.db.query<{ payload: unknown }>("select payload from public.eventos where tipo = 'concorrentes_confirmados'");
    expect(evento!.payload).toEqual({ quantidade: 2, acrescentados: 1 });
  });

  it("'não tenho concorrente direto' grava a lista vazia", async () => {
    expect(await confirmar([])).toEqual({ ok: true });
    expect(await concorrentesConfirmados(banco.db, organizacao)).toEqual([]);
  });

  it("URL que não é site público é recusada antes da IA", async () => {
    const analista = analistaFalso();
    for (const site of ["http://localhost:3000", "https://10.0.0.1", "ftp://concorrente.com.br", "https://user:senha@concorrente.com.br"]) {
      expect(await analisar(analista, site)).toEqual({ ok: false, erro: "Use um endereço público, como https://suaempresa.com.br." });
    }
    expect(analista.leituras).toEqual([]);
    expect((await situacao()).restantes).toBe(5);
  });

  it("analisa lendo até 3 páginas do domínio do concorrente, e a análise volta na lista", async () => {
    const analista = analistaFalso();
    const resultado = await analisar(analista, "www.apollo.io", "Apollo");
    expect(resultado).toEqual({
      ok: true,
      dominio: "apollo.io",
      analise: { ...ANALISE_DA_IA, onde_voce_ganha: ANALISE_DA_IA.onde_voce_ganha },
    });
    expect(analista.leituras).toEqual([{ url: "https://www.apollo.io/", dominio: "apollo.io", maxPaginas: 3 }]);
    expect(analista.entradas[0]).toContain("Kakou: SDR de LinkedIn para PMEs.");

    await confirmar([{ nome: "Apollo", descricao: "", site: "apollo.io", origem: "site" }]);
    const [apollo] = (await concorrentesConfirmados(banco.db, organizacao))!;
    expect(apollo!.analise?.o_que_vende).toBe("Base de contatos e sequências de e-mail");
    expect((await situacao()).restantes).toBe(4);

    // O mesmo domínio de novo não chama a IA nem gasta vaga.
    expect(await analisar(analista, "https://apollo.io/precos", "Apollo")).toMatchObject({ ok: true, dominio: "apollo.io" });
    expect(analista.leituras).toHaveLength(1);
  });

  it("o sexto concorrente analisado é recusado", async () => {
    const analista = analistaFalso();
    for (let i = 1; i <= 5; i++) expect(await analisar(analista, `concorrente${i}.com.br`)).toMatchObject({ ok: true });
    expect(await analisar(analista, "concorrente6.com.br")).toEqual({
      ok: false,
      erro: "Você já analisou 5 concorrentes, o máximo por empresa.",
    });
    expect(analista.leituras).toHaveLength(5);
  });

  it("leitura que falha devolve a vaga", async () => {
    expect(await analisar(analistaFalso({ falhar: true }), "apollo.io", "Apollo")).toEqual({
      ok: false,
      erro: "Não consegui analisar Apollo: não consegui abrir nenhuma página do site.",
    });
    expect((await situacao()).restantes).toBe(5);
  });

  it("resposta da IA com campo longo descarta só aquele item", async () => {
    const saida = { ...ANALISE_DA_IA, posicionamento: "p".repeat(500) };
    const resultado = await analisar(analistaFalso({ saida }), "apollo.io");
    expect(resultado).toMatchObject({ ok: true, analise: { o_que_vende: ANALISE_DA_IA.o_que_vende, posicionamento: null } });
    const [evento] = await banco.db.query<{ payload: { descartados: number } }>(
      "select payload from public.eventos where tipo = 'concorrente_analisado'",
    );
    expect(evento!.payload.descartados).toBe(1);
  });

  it("com a leitura de site desligada (dossie.ativo), não analisa", async () => {
    await banco.db.query("update public.configuracoes set valor = '{\"ativo\": false, \"max_paginas\": 8}' where chave = 'dossie'");
    const analista = analistaFalso();
    expect(await analisar(analista, "apollo.io")).toEqual({ ok: false, erro: "A leitura de site está desligada pelo admin." });
    expect(analista.leituras).toEqual([]);
  });

  it("o prompt do SDR leva os concorrentes confirmados e a regra de não criticar", async () => {
    await analisar(analistaFalso(), "apollo.io", "Apollo");
    await confirmar([
      { nome: "Apollo", descricao: "base de contatos", site: "apollo.io", origem: "site" },
      { nome: "Ploomes", descricao: "CRM", site: null, origem: "voce" },
    ]);
    const chamadas: { sistema: string; entrada: string }[] = [];
    const gerador: GeradorDeSdr = {
      async gerar(p) {
        chamadas.push(p);
        return {
          saida: {
            objetivo: "marcar 20 minutos",
            voz: "Direta.",
            abertura: "Observação sobre prospecção.",
            qualificacao: [],
            objecoes: [],
            regras: [],
            quando_chamar_voce: [],
          },
          uso: USO,
          modelo: "claude-sonnet-5",
        };
      },
    };
    expect(await gerarSdr({ db: banco.db, gerador }, { organizacaoId: organizacao, nome: "Arthur", operadorId: admin, agora: AGORA })).toMatchObject({
      ok: true,
    });
    const [{ sistema, entrada }] = chamadas as [{ sistema: string; entrada: string }];
    expect(entrada).toContain("Concorrentes que a empresa confirmou");
    expect(entrada).toContain("- Apollo: base de contatos");
    expect(entrada).toContain("onde a oferta ganha (hipótese): Conversa no LinkedIn em português");
    expect(entrada).toContain("- Ploomes: CRM");
    expect(sistema).toContain("O SDR nunca critica concorrente pelo nome");
    expect(sistema).toContain('"já uso X"');
    expect(REGRAS_DA_CASA).toContain("nunca criticar concorrente pelo nome");
  });
});
