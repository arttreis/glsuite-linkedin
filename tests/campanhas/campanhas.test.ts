import { beforeEach, describe, expect, it } from "vitest";
import { sequenciaPadrao, type Sequencia } from "@/domain/sequencia";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { enviarParaRevisao, prepararTexto } from "@/server/acoes/texto";
import { mudarStatusDaCampanha, salvarCampanha, type EntradaDeCampanha } from "@/server/campanhas/campanhas";
import { aprovarLeads } from "@/server/triagem/triagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarCampanha, criarLead, criarOperador, criarPessoa, idDoPerfil } from "../support/fixtures";

const AGORA = new Date("2026-10-01T14:00:00Z");

function sequenciaCom(textos: Partial<Record<"T1" | "T2" | "T3" | "T4", string>>): Sequencia {
  const padrao: Record<string, string> = {
    T1: "Oi {{first_name}}, acompanho a {{company}} e queria te ter por aqui.",
    T2: "Obrigado por aceitar, {{first_name}}. Vi um padrão em lojas como a {{company}} que vale olhar.",
    T3: "{{first_name}}, como a {{company}} mede a margem por canal hoje?",
    T4: "Fico por aqui, {{first_name}}. Se fizer sentido, é só chamar.",
  };
  return sequenciaPadrao().map((passo) => ({ ...passo, template: textos[passo.toque] ?? padrao[passo.toque]! }));
}

describe("campanhas", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let arthur: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    operador = await criarOperador(banco.db, { papel: "admin" });
    arthur = await idDoPerfil(banco.db, "arthur");
  });

  const entrada = (sobrescrever: Partial<EntradaDeCampanha> = {}): EntradaDeCampanha => ({
    perfilId: arthur,
    nome: "Varejo SP",
    angulo: "Margem invisível",
    nicho: "varejo",
    modoCopy: "template",
    maxLeads: null,
    sequencia: sequenciaCom({}),
    ...sobrescrever,
  });

  const salvar = (e: EntradaDeCampanha) => salvarCampanha(banco.db, e, { operadorId: operador, agora: AGORA });

  it("salva campanha válida com o pós-T4 da praça", async () => {
    const resultado = await salvar(entrada());
    expect(resultado.ok).toBe(true);
    const [campanha] = await banco.db.query<{ pos_t4: string; status: string }>(
      "select pos_t4, status from public.campanhas",
    );
    expect(campanha).toEqual({ pos_t4: "conexao", status: "rascunho" });

    const luiz = await idDoPerfil(banco.db, "luiz");
    const canada = await salvar(
      entrada({
        perfilId: luiz,
        nome: "Canada retail",
        sequencia: sequenciaCom({
          T1: "Hi {{first_name}}, following {{company}} for a while.",
          T2: "Thanks for connecting, {{first_name}}. Or tell me to stop and I will.",
          T3: "How does {{company}} track margin today? Or tell me to stop and I will.",
          T4: "Leaving it here, {{first_name}}. Or tell me to stop and I will.",
        }),
      }),
    );
    expect(canada.ok).toBe(true);
    const [posT4] = await banco.db.query<{ pos_t4: string }>("select pos_t4 from public.campanhas where perfil_id = $1::uuid", [luiz]);
    expect(posT4!.pos_t4).toBe("pausa_60_novo_angulo");
  });

  it.each([
    ["travessão", { T2: "Obrigado, {{first_name}} — vi algo na {{company}}." }, "T2", "Tem travessão ou meia-risca"],
    ["palavra proibida", { T3: "{{first_name}}, a {{company}} usa agência?" }, "T3", 'Usa a palavra proibida "agência"'],
    ["URL no T1–T4", { T4: "Fico por aqui, {{first_name}}. guessless.com.br" }, "T4", "Tem link (guessless.com.br)"],
    ["excesso de caracteres", { T4: `Fico por aqui, {{first_name}}. ${"x".repeat(170)}` }, "T4", "o teto do T4 é 180"],
  ] as const)("%s bloqueia o salvamento com mensagem clara", async (_nome, textos, toque, mensagem) => {
    const resultado = await salvar(entrada({ sequencia: sequenciaCom(textos) }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    const problema = resultado.problemas.find((p) => p.toque === toque)!;
    expect(problema.violacoes.map((v) => v.mensagem).join(" ")).toContain(mensagem);
    const [contagem] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.campanhas");
    expect(contagem!.n).toBe(0);
  });

  it("recusa ângulo fora da lista fechada e variável fora de {{first_name}}/{{company}}", async () => {
    expect(await salvar(entrada({ angulo: "Ângulo inventado" }))).toMatchObject({
      ok: false,
      erros: ["Ângulo fora da lista fechada: Ângulo inventado"],
    });
    const token = await salvar(entrada({ sequencia: sequenciaCom({ T2: "Oi {{nome}}" }) }));
    expect(token.ok).toBe(false);
  });

  it("encerrar a campanha cancela o que ainda não saiu", async () => {
    const campanhaId = await criarCampanha(banco.db);
    const lead = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId, estado: "na_fila" });
    await agendarAcao(banco.db, {
      leadId: lead,
      perfilId: arthur,
      tipo: "convite",
      toque: "T1",
      origem: "template",
      agendadaPara: AGORA,
      chave: chaveDoToque(lead, "T1"),
    });

    await mudarStatusDaCampanha(banco.db, { campanhaId, status: "encerrada", operadorId: operador, agora: AGORA });

    const [acao] = await banco.db.query<{ status: string }>("select status from public.acoes");
    expect(acao!.status).toBe("cancelada");
    await expect(
      mudarStatusDaCampanha(banco.db, { campanhaId, status: "ativa", operadorId: operador, agora: AGORA }),
    ).rejects.toThrow(/não volta/);
  });

  it("aprovar na triagem agenda o T1 uma vez só", async () => {
    const campanhaId = await criarCampanha(banco.db);
    const lead = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId });
    await aprovarLeads(banco.db, { leadIds: [lead], operadorId: operador, agora: AGORA });
    await agendarAcao(banco.db, {
      leadId: lead,
      perfilId: arthur,
      tipo: "convite",
      toque: "T1",
      origem: "template",
      agendadaPara: AGORA,
      chave: chaveDoToque(lead, "T1"),
    });
    const acoes = await banco.db.query<{ tipo: string; toque: string; status: string }>(
      "select tipo, toque, status from public.acoes where lead_id = $1::uuid",
      [lead],
    );
    expect(acoes).toEqual([{ tipo: "convite", toque: "T1", status: "pendente" }]);
  });

  describe("no envio", () => {
    const acaoDe = async (sequencia: Sequencia, toque: "T1" | "T2", empresa = "Acme") => {
      const campanhaId = await criarCampanha(banco.db, { sequencia });
      const lead = await criarLead(banco.db, {
        pessoaId: await criarPessoa(banco.db, { nome: "Maria Souza", empresa }),
        campanhaId,
        estado: "aceito",
      });
      return (await agendarAcao(banco.db, {
        leadId: lead,
        perfilId: arthur,
        tipo: toque === "T1" ? "convite" : "dm",
        toque,
        origem: "template",
        agendadaPara: AGORA,
        chave: chaveDoToque(lead, toque),
      }))!;
    };

    it("renderiza o template com os dados do lead", async () => {
      const acao = await acaoDe(sequenciaCom({}), "T2");
      expect(await prepararTexto(banco.db, acao)).toEqual({
        ok: true,
        origem: "template",
        texto: "Obrigado por aceitar, Maria. Vi um padrão em lojas como a Acme que vale olhar.",
      });
    });

    it("bloqueia o envio quando a copy viola o validador (campanha antiga, gravada sem validar)", async () => {
      const acao = await acaoDe(sequenciaCom({ T2: "Oi {{first_name}}, somos uma agência — veja www.x.com" }), "T2");
      const preparado = await prepararTexto(banco.db, acao);
      expect(preparado.ok).toBe(false);
      if (preparado.ok) return;
      expect(preparado.violacoes.map((v) => v.regra).sort()).toEqual(["palavra_proibida", "travessao", "url"]);

      await enviarParaRevisao(banco.db, acao, preparado.violacoes);
      const [revisao] = await banco.db.query<{ status: string; motivo_revisao: string }>(
        "select status, motivo_revisao from public.acoes where id = $1::uuid",
        [acao],
      );
      expect(revisao!.status).toBe("aguardando_aprovacao");
      expect(revisao!.motivo_revisao).toContain('Usa a palavra proibida "agência".');
    });

    it("bloqueia quando o nome da empresa real estoura o teto", async () => {
      const acao = await acaoDe(sequenciaCom({ T2: "Oi {{first_name}}, vi a {{company}}." }), "T2", "E".repeat(340));
      const preparado = await prepararTexto(banco.db, acao);
      expect(preparado.ok).toBe(false);
    });
  });
});
