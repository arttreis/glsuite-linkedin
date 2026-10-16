import { beforeEach, describe, expect, it } from "vitest";
import { filtroDoSegmento } from "@/domain/filtro-de-contatos";
import { contarContatos, importarContatos, listarContatos, type ContatoParaImportar } from "@/server/contatos/contatos";
import { apagarSegmento, listarSegmentos, obterSegmento, previaDoSegmento, salvarSegmento } from "@/server/contatos/segmentos";
import { apagarTag, criarTag, porTag } from "@/server/contatos/tags";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarCampanha, criarLead, criarOperador, criarOrganizacao, criarPessoa, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-16T13:00:00Z");

const contato = (nome: string, extra: Partial<ContatoParaImportar> = {}): ContatoParaImportar => ({
  nome,
  primeiroNome: nome,
  telefone: null,
  email: `${nome.toLowerCase()}@exemplo.com`,
  empresa: null,
  cargo: null,
  tags: [],
  ...extra,
});

describe("segmentos (SDR-71, §4.17)", () => {
  let banco: BancoDeTeste;
  let organizacaoId: string;
  let admin: string;
  let tag: Record<string, string>;

  const comoAdmin = <T>(fn: (tx: Db) => Promise<T>) => comOperador(banco.db, admin, fn);
  const quem = async (filtros: unknown) => {
    const filtro = filtroDoSegmento(filtros);
    const { contatos, total } = await comoAdmin((tx) => listarContatos(tx, { organizacaoId, filtro }));
    expect(await comoAdmin((tx) => contarContatos(tx, { organizacaoId, filtro }))).toBe(total);
    return contatos.map((c) => c.nome).sort();
  };
  const salvar = (nome: string, filtros: unknown, id: string | null = null) =>
    comoAdmin((tx) => salvarSegmento(tx, { organizacaoId, id, nome, filtros, operadorId: admin, agora: AGORA }));

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacaoId = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    // Ana: Cliente e VIP, WhatsApp autorizado. Bia: Cliente, sem autorização. Caio: sem tag. Duda: Inativo.
    await importarContatos(banco.db, {
      organizacaoId,
      operadorId: admin,
      importacaoId: null,
      arquivoNome: "base.csv",
      autorizacaoWhatsapp: true,
      tagsParaTodos: [],
      contatos: [contato("Ana", { telefone: "+5511999990001", tags: ["Cliente", "VIP"], empresa: "Acme" })],
      agora: AGORA,
    });
    await importarContatos(banco.db, {
      organizacaoId,
      operadorId: admin,
      importacaoId: null,
      arquivoNome: "outra.csv",
      autorizacaoWhatsapp: false,
      tagsParaTodos: [],
      contatos: [
        contato("Bia", { telefone: "+5511999990002", tags: ["Cliente"] }),
        contato("Caio", { cargo: "Diretor de Vendas" }),
        contato("Duda", { tags: ["Inativo"] }),
      ],
      agora: new Date("2026-10-10T13:00:00Z"),
    });
    await banco.db.query("update public.contatos set criado_em = '2026-10-10T13:00:00Z' where nome in ('Bia', 'Caio', 'Duda')");
    const tags = await banco.db.query<{ id: string; nome: string }>("select id, nome from public.tags");
    tag = Object.fromEntries(tags.map((t) => [t.nome, t.id]));
  });

  it("cada condição de tag sozinha e juntas; 'nenhuma destas' pega quem não tem tag", async () => {
    expect(await quem({ tags: { alguma: [tag.Cliente!] } })).toEqual(["Ana", "Bia"]);
    expect(await quem({ tags: { todas: [tag.Cliente!, tag.VIP!] } })).toEqual(["Ana"]);
    expect(await quem({ tags: { nenhuma: [tag.Inativo!] } })).toEqual(["Ana", "Bia", "Caio"]);
    expect(await quem({ tags: { nenhuma: [tag.Cliente!, tag.Inativo!] } })).toEqual(["Caio"]);
    expect(await quem({ tags: { alguma: [tag.Cliente!], nenhuma: [tag.VIP!] } })).toEqual(["Bia"]);
  });

  it("canal, origem, texto e data", async () => {
    await criarPessoa(banco.db, { nome: "Eva Lead", empresa: "Gama" });
    expect(await quem({ canal: "whatsapp" })).toEqual(["Ana"]);
    expect(await quem({ canal: "linkedin" })).toEqual(["Eva Lead"]);
    expect(await quem({ origens: ["linkedin"] })).toEqual(["Eva Lead"]);
    expect(await quem({ texto: "vendas" })).toEqual(["Caio"]);
    expect(await quem({ desde: "2026-10-16", origens: ["importacao"] })).toEqual(["Ana"]);
    expect(await quem({ canal: "whatsapp", tags: { alguma: [tag.Cliente!] } })).toEqual(["Ana"]);
  });

  it("do LinkedIn, etapa, campanha e nota valem para o mesmo lead", async () => {
    const diretores = await criarCampanha(banco.db, { nome: "Diretores" });
    const gerentes = await criarCampanha(banco.db, { nome: "Gerentes", perfil: "luiz" });
    const fernanda = await criarPessoa(banco.db, { nome: "Fernanda" });
    const gabriel = await criarPessoa(banco.db, { nome: "Gabriel" });
    // Fernanda: encerrada em Diretores, conversando em Gerentes (com nota 85).
    await criarLead(banco.db, { pessoaId: fernanda, campanhaId: diretores, estado: "sem_resposta" });
    const conversa = await criarLead(banco.db, { pessoaId: fernanda, campanhaId: gerentes, estado: "em_conversa" });
    await banco.db.query("update public.leads set nota = 85 where id = $1::uuid", [conversa]);
    await criarLead(banco.db, { pessoaId: gabriel, campanhaId: diretores, estado: "qualificado" });

    expect(await quem({ linkedin: { etapas: ["conversando"] } })).toEqual(["Fernanda"]);
    expect(await quem({ linkedin: { campanhas: [diretores] } })).toEqual(["Fernanda", "Gabriel"]);
    expect(await quem({ linkedin: { campanhas: [diretores], etapas: ["conversando", "qualificado"] } })).toEqual(["Gabriel"]);
    expect(await quem({ linkedin: { notaMinima: 80 } })).toEqual(["Fernanda"]);
    expect(await quem({ linkedin: { notaMinima: 80, campanhas: [diretores] } })).toEqual([]);
  });

  it("quem não pode ser contatado nunca está no segmento", async () => {
    await banco.db.query("update public.contatos set nao_contatar_em = $1 where nome = 'Ana'", [AGORA]);
    expect(await quem({ tags: { alguma: [tag.Cliente!] }, situacao: "todos" })).toEqual(["Bia"]);
  });

  it("salva com nome único e pelo menos uma condição; a lista conta quantos tem agora", async () => {
    expect(await salvar("  ", { canal: "whatsapp" })).toEqual({ ok: false, erro: "Dê um nome ao segmento." });
    expect(await salvar("Tudo", {})).toMatchObject({ ok: false, erro: expect.stringContaining("pelo menos uma condição") });
    const salvo = await salvar("Clientes no WhatsApp", { canal: "whatsapp", tags: { alguma: [tag.Cliente!] } });
    expect(salvo.ok).toBe(true);
    expect(await salvar("clientes no whatsapp", { canal: "linkedin" })).toEqual({ ok: false, erro: 'Já existe o segmento "Clientes no WhatsApp".' });

    const [segmento] = await comoAdmin((tx) => listarSegmentos(tx, organizacaoId));
    expect(segmento).toMatchObject({
      nome: "Clientes no WhatsApp",
      contatos: 1,
      descricao: "Contatos com a tag Cliente e que podem receber pelo WhatsApp",
    });

    // Recalculado a cada uso: Bia autoriza o WhatsApp e entra.
    await banco.db.query("update public.contatos set whatsapp_autorizado_em = $1 where nome = 'Bia'", [AGORA]);
    expect((await comoAdmin((tx) => listarSegmentos(tx, organizacaoId)))[0]!.contatos).toBe(2);

    const id = (salvo as { id: string }).id;
    expect(await salvar("Clientes no WhatsApp", { canal: "whatsapp" }, id)).toEqual({ ok: true, id });
  });

  it("a prévia mostra quantos e os primeiros, com a descrição", async () => {
    const previa = await comoAdmin((tx) => previaDoSegmento(tx, { organizacaoId, filtros: { tags: { alguma: [tag.Cliente!] } } }));
    expect(previa.total).toBe(2);
    expect(previa.primeiros.map((c) => c.nome).sort()).toEqual(["Ana", "Bia"]);
    expect(previa.descricao).toBe("Contatos com a tag Cliente");
  });

  it("tag usada por segmento não se apaga; apagado o segmento, apaga", async () => {
    const salvo = (await salvar("Inativos", { tags: { alguma: [tag.Inativo!] } })) as { id: string };
    expect(await comoAdmin((tx) => apagarTag(tx, { tagId: tag.Inativo!, operadorId: admin, agora: AGORA }))).toEqual({
      ok: false,
      erro: 'A tag "Inativo" está no segmento "Inativos". Tire dele antes de apagar.',
    });
    expect(await comoAdmin((tx) => apagarSegmento(tx, { id: salvo.id, organizacaoId, operadorId: admin, agora: AGORA }))).toEqual({ ok: true });
    expect(await comoAdmin((tx) => apagarTag(tx, { tagId: tag.Inativo!, operadorId: admin, agora: AGORA }))).toEqual({ ok: true, contatos: 1 });
  });

  it("segmento de outra organização não abre e a tag dela no filtro não vaza contato", async () => {
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { organizacaoId: outra, papel: "admin" });
    const tagDeFora = (await comOperador(banco.db, deFora, (tx) => criarTag(tx, { organizacaoId: outra, nome: "Deles", operadorId: deFora, agora: AGORA }))) as {
      id: string;
    };
    const salvo = (await salvar("Clientes", { tags: { alguma: [tag.Cliente!] } })) as { id: string };

    expect(await comOperador(banco.db, deFora, (tx) => obterSegmento(tx, { id: salvo.id, organizacaoId: outra }))).toBeNull();
    expect(await comOperador(banco.db, deFora, (tx) => obterSegmento(tx, { id: salvo.id, organizacaoId }))).toBeNull();
    expect(await quem({ tags: { alguma: [tagDeFora.id] } })).toEqual([]);

    // Pôr a tag deles num contato daqui não passa.
    expect(
      await comoAdmin((tx) => porTag(tx, { organizacaoId, tagId: tagDeFora.id, alvo: { ids: [] }, operadorId: admin, agora: AGORA })),
    ).toEqual({ ok: false, erro: "Tag não encontrada." });
  });
});
