import { beforeEach, describe, expect, it } from "vitest";
import type { Dossie } from "@/domain/dossie";
import type { TextosDoFluxo } from "@/domain/fluxo-gerado";
import { RAMPA_PADRAO } from "@/domain/rampa";
import { estadoDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { concluirPrimeiroAcesso, organizacaoNoPrimeiroAcesso, perfilDoPrimeiroAcesso } from "@/server/acesso/vinculo";
import { comOperador } from "@/server/db/operador";
import { fluxoDaCampanha } from "@/server/fluxo/fluxos";
import { gravarVersaoDoSdr } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, criarPublico } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-12T13:00:00Z"); // segunda-feira, 10h em São Paulo

const ANALISE: Dossie = {
  empresa: { nome: "Loja da Duda", resumo: "Moda feminina online e no atacado." },
  produtos: [{ nome: "Atacado", descricao: "Lote pequeno para multimarca.", para_quem: "multimarcas" }],
  para_quem: "Lojas multimarca de moda feminina.",
  diferenciais: [],
  provas: [],
  dores: ["Estoque parado"],
  objecoes: [],
  tom_de_voz: "Leve.",
  idioma: "pt",
  mercado: { segmentos: [], alternativas: [], gatilhos: [] },
};

const TEXTOS: TextosDoFluxo = {
  convite: "Oi {{first_name}}, acompanho multimarca de moda e queria te ter por aqui.",
  mensagens: [
    "Obrigada por aceitar. Muita multimarca fica com estoque parado depois da troca de coleção.",
    "Na {{company}}, como vocês escolhem as peças da próxima estação?",
    "Fico por aqui. Se fizer sentido um dia, é só chamar.",
  ],
  motivo: "estoque parado",
};

const pessoa = (n: number, nota: number, marcada: boolean) => ({
  providerId: `ACo${n}`,
  publicIdentifier: `pessoa-${n}`,
  urlPublica: `https://www.linkedin.com/in/pessoa-${n}`,
  nome: `Pessoa ${n}`,
  primeiroNome: "Pessoa",
  cargo: "Proprietária",
  empresa: `Loja ${n}`,
  localizacao: "Curitiba, PR",
  nota,
  motivo: `motivo ${n}`,
  marcada,
});

describe("vincular o LinkedIn e começar (SDR-46)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let organizacao: string;
  let duda: string;
  let publico: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    organizacao = await criarOrganizacao(banco.db, { nome: "Loja da Duda" });
    duda = await criarOperador(banco.db, { nome: "Duda", papel: "admin", organizacaoId: organizacao });
    await banco.db.query(
      `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
       values ($1::uuid, 'https://duda.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3)`,
      [organizacao, JSON.stringify(ANALISE), AGORA],
    );
    await gravarVersaoDoSdr(banco.db, {
      organizacaoId: organizacao,
      sdr: { objetivo: "marcar 20 minutos", voz: "Leve.", abertura: "Estoque parado.", qualificacao: [], objecoes: [], regras: [], quando_chamar_voce: [], link_agenda: null },
      origem: "ia",
      por: null,
      agora: AGORA,
    });
    publico = await criarPublico(banco.db, { organizacaoId: organizacao, status: "ativo" });
    await banco.db.query(
      `insert into public.previas (organizacao_id, publico_id, status, pessoas, buscadas, confirmada_em)
       values ($1::uuid, $2::uuid, 'pronta', $3::jsonb, 3, $4)`,
      [organizacao, publico, JSON.stringify([pessoa(1, 92, true), pessoa(2, 80, true), pessoa(3, 40, false)]), AGORA],
    );
    await banco.db.query(
      `insert into public.abordagens (organizacao_id, publico_id, textos, problemas, gerada_em, permitida_em, permitida_por)
       values ($1::uuid, $2::uuid, $3::jsonb, '[]', $4, $4, $5::uuid)`,
      [organizacao, publico, JSON.stringify(TEXTOS), AGORA, duda],
    );
  });

  const criarPerfil = () =>
    perfilDoPrimeiroAcesso(banco.db, { organizacaoId: organizacao, operadorId: duda, nome: "Duda", idioma: "pt", agora: AGORA });
  const conectar = (perfilId: string) =>
    banco.db.query("update public.perfis set unipile_account_id = 'conta-duda', unipile_status = 'OK' where id = $1::uuid", [perfilId]);
  const concluir = () => concluirPrimeiroAcesso({ db: banco.db, unipile, agora: AGORA }, { organizacaoId: organizacao });

  it("o perfil nasce pausado, com a rampa padrão, o SDR respondendo sozinho e operado por quem vincula; dois cliques, um perfil", async () => {
    const [a, b] = await Promise.all([criarPerfil(), criarPerfil()]);
    expect(a.perfilId).toBe(b.perfilId);
    const [perfil] = await banco.db.query<Record<string, unknown>>(
      `select status, modo_resposta, rampa, teto_convites_semana, palavras_proibidas, praca, operador_id, casa,
              (select count(*)::int from public.operador_perfis op where op.perfil_id = p.id and op.operador_id = $2::uuid) as opera
         from public.perfis p where id = $1::uuid`,
      [a.perfilId, duda],
    );
    expect(perfil).toEqual({
      status: "pausado",
      modo_resposta: "automatico",
      rampa: RAMPA_PADRAO,
      teto_convites_semana: 75,
      palavras_proibidas: [],
      praca: "domestico",
      operador_id: duda,
      casa: false,
      opera: 1,
    });
  });

  it("sem a conta conectada, espera", async () => {
    await criarPerfil();
    expect(await concluir()).toMatchObject({ ok: false, esperar: true });
  });

  it("sem permissão, não começa", async () => {
    const { perfilId } = await criarPerfil();
    await conectar(perfilId);
    await banco.db.query("update public.abordagens set permitida_em = null, permitida_por = null");
    expect(await concluir()).toEqual({ ok: false, erro: "Dê a permissão na abordagem antes de vincular." });
  });

  it("começa: campanha com a abordagem permitida, só as marcadas na fila, conta e campanha ativas, primeiro acesso concluído", async () => {
    const { perfilId } = await criarPerfil();
    await conectar(perfilId);
    expect(await organizacaoNoPrimeiroAcesso(banco.db, perfilId)).toBe(organizacao);

    const resultado = await concluir();
    expect(resultado).toMatchObject({ ok: true, leads: 2 });
    const campanhaId = (resultado as { campanhaId: string }).campanhaId;

    const [campanha] = await banco.db.query<Record<string, unknown>>(
      "select status, perfil_id, publico_id, permitida_em, permitida_por from public.campanhas where id = $1::uuid",
      [campanhaId],
    );
    expect(campanha).toEqual({ status: "ativa", perfil_id: perfilId, publico_id: publico, permitida_em: AGORA, permitida_por: duda });
    const fluxo = await fluxoDaCampanha(banco.db, campanhaId);
    expect(fluxo!.nodes.find((n) => n.tipo === "convite")).toMatchObject({ template: TEXTOS.convite });

    const leads = await banco.db.query<{ provider_id: string; estado: string; nota: number }>(
      `select pe.provider_id, l.estado, l.nota from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
        where l.campanha_id = $1::uuid order by pe.provider_id`,
      [campanhaId],
    );
    expect(leads).toEqual([
      { provider_id: "ACo1", estado: "na_fila", nota: 92 },
      { provider_id: "ACo2", estado: "na_fila", nota: 80 },
    ]);
    const [fonte] = await banco.db.query<{ fonte: string }>("select fonte from public.pessoas where provider_id = 'ACo1'");
    expect(fonte!.fonte).toBe("unipile_busca");

    const [perfil] = await banco.db.query<{ status: string }>("select status from public.perfis where id = $1::uuid", [perfilId]);
    expect(perfil!.status).toBe("ativo");
    expect(await organizacaoNoPrimeiroAcesso(banco.db, perfilId)).toBeNull();
    const [org] = await banco.db.query<{ concluido: boolean }>(
      "select primeiro_acesso_em is not null as concluido from public.organizacoes where id = $1::uuid",
      [organizacao],
    );
    expect(org!.concluido).toBe(true);
  });

  it("o aviso da Unipile e a volta da pessoa ao mesmo tempo criam uma campanha só", async () => {
    const { perfilId } = await criarPerfil();
    await conectar(perfilId);
    const [a, b] = await Promise.all([concluir(), concluir()]);
    expect([a.ok, b.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(await concluir()).toMatchObject({ ok: true });
    const [contagem] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.campanhas where publico_id = $1::uuid", [publico]);
    expect(contagem!.n).toBe(1);
    const [leads] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.leads");
    expect(leads!.n).toBe(2);
  });

  it("prévia sem nomes: a campanha começa com a busca do público pronta", async () => {
    await banco.db.query("update public.previas set status = 'sem_nomes', pessoas = '[]'");
    const { perfilId } = await criarPerfil();
    await conectar(perfilId);
    const resultado = await concluir();
    expect(resultado).toMatchObject({ ok: true, leads: 0 });
    const [campanha] = await banco.db.query<{ busca: { cargos: string[] } }>("select busca from public.campanhas where id = $1::uuid", [
      (resultado as { campanhaId: string }).campanhaId,
    ]);
    expect(campanha!.busca.cargos).toEqual(["Head de E-commerce"]);
  });

  it("depois de concluir, a pessoa vai para o app", async () => {
    const { perfilId } = await criarPerfil();
    await conectar(perfilId);
    await concluir();
    const estado = await comOperador(banco.db, duda, (tx) => estadoDoPrimeiroAcesso(tx));
    expect(estado.feitos.has("abordagem")).toBe(true);
    const [operador] = await banco.db.query<{ concluido: boolean }>(
      "select g.primeiro_acesso_em is not null as concluido from public.operadores o join public.organizacoes g on g.id = o.organizacao_id where o.id = $1::uuid",
      [duda],
    );
    expect(operador!.concluido).toBe(true);
  });
});
