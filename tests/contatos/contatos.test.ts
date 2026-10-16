import { beforeEach, describe, expect, it } from "vitest";
import { lerFiltro } from "@/domain/filtro-de-contatos";
import { registrarOptout } from "@/server/conversas/optout";
import {
  contarContatos,
  importarContatos,
  listarContatos,
  naoContatarMais,
  obterContato,
  type ContatoParaImportar,
} from "@/server/contatos/contatos";
import { apagarTag, criarTag, editarTag, listarTags, porTag, tagsDoLead, tirarTag } from "@/server/contatos/tags";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  criarCampanha,
  criarLead,
  criarOperador,
  criarOrganizacao,
  criarPessoa,
  idDaOrganizacaoGuessless,
} from "../support/fixtures";

const AGORA = new Date("2026-10-16T13:00:00Z");

const contato = (c: Partial<ContatoParaImportar> & { nome: string }): ContatoParaImportar => ({
  primeiroNome: c.nome.split(" ")[0]!,
  telefone: null,
  email: null,
  empresa: null,
  cargo: null,
  tags: [],
  ...c,
});

describe("contatos e tags (SDR-70, §4.15 e §4.16)", () => {
  let banco: BancoDeTeste;
  let organizacaoId: string;
  let admin: string;

  const comoOperador = <T>(fn: (tx: Db) => Promise<T>, quem = admin) => comOperador(banco.db, quem, fn);
  const importar = (contatos: ContatoParaImportar[], extra: Partial<Parameters<typeof importarContatos>[1]> = {}) =>
    importarContatos(banco.db, {
      organizacaoId,
      operadorId: admin,
      importacaoId: null,
      arquivoNome: "clientes.csv",
      autorizacaoWhatsapp: false,
      tagsParaTodos: [],
      contatos,
      agora: AGORA,
      ...extra,
    });
  const lista = (filtro: unknown = {}, quem = admin) =>
    comoOperador((tx) => listarContatos(tx, { organizacaoId, filtro: lerFiltro(filtro) }), quem);

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacaoId = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
  });

  describe("do LinkedIn", () => {
    it("toda pessoa nova do LinkedIn vira contato da organização uma vez só, ligado ao lead", async () => {
      const pessoa = await criarPessoa(banco.db, { nome: "Maria Souza", empresa: "Acme" });
      await banco.db.query("update public.pessoas set cargo = 'CMO' where id = $1::uuid", [pessoa]);
      const [linha] = await banco.db.query<{ n: number; origem: string; cargo: string; organizacao_id: string }>(
        "select count(*) over ()::int as n, origem, cargo, organizacao_id from public.contatos where pessoa_id = $1::uuid",
        [pessoa],
      );
      expect(linha).toEqual({ n: 1, origem: "linkedin", cargo: "CMO", organizacao_id: organizacaoId });
    });

    it("o opt-out do LinkedIn aparece como não contatar mais", async () => {
      const pessoa = await criarPessoa(banco.db, { providerId: "ACoSAIU" });
      await registrarOptout(banco.db, { providerId: "ACoSAIU", perfilOrigem: null, textoPedido: "pare", ator: "webhook", agora: AGORA });
      const [linha] = await banco.db.query<{ nao_contatar_em: Date; nao_contatar_motivo: string }>(
        "select nao_contatar_em, nao_contatar_motivo from public.contatos where pessoa_id = $1::uuid",
        [pessoa],
      );
      expect(linha).toEqual({ nao_contatar_em: AGORA, nao_contatar_motivo: "Pediu para não ser contatado pelo LinkedIn" });
      expect((await lista()).total).toBe(0);
      expect((await lista({ situacao: "nao_contatar" })).total).toBe(1);
    });

    it("o operador não vê o lead do LinkedIn de uma conta que ele não opera; o admin vê", async () => {
      await criarPessoa(banco.db, { dono: "luiz", nome: "Do Luiz" });
      await criarPessoa(banco.db, { dono: "arthur", nome: "Do Arthur" });
      const operador = await criarOperador(banco.db, { perfis: ["arthur"] });
      expect((await lista({}, operador)).contatos.map((c) => c.nome)).toEqual(["Do Arthur"]);
      expect((await lista({}, admin)).total).toBe(2);
    });
  });

  describe("importação", () => {
    it("cria os contatos; telefone igual completa só o vazio e soma as tags", async () => {
      const primeira = await importar([
        contato({ nome: "Ana", telefone: "+5511999998888", empresa: "Acme", tags: ["Cliente"] }),
        contato({ nome: "Bia", email: "bia@beta.com" }),
      ]);
      expect(primeira).toMatchObject({ ok: true, criados: 2, atualizados: 0, tagsCriadas: 1 });

      const segunda = await importar([
        contato({ nome: "Ana Outra", telefone: "+5511999998888", empresa: "Outra", cargo: "CEO", tags: ["VIP", "cliente"] }),
        contato({ nome: "Bia", email: "BIA@beta.com", cargo: "CFO" }),
      ]);
      expect(segunda).toMatchObject({ ok: true, criados: 0, atualizados: 2, tagsCriadas: 1 });

      const { contatos } = await lista();
      const ana = contatos.find((c) => c.telefone === "+5511999998888")!;
      expect(ana).toMatchObject({ nome: "Ana", empresa: "Acme", cargo: "CEO", origem: "importacao", whatsapp: "sem_autorizacao" });
      expect(ana.tags.map((t) => t.nome)).toEqual(["Cliente", "VIP"]);
      expect(contatos.find((c) => c.email === "bia@beta.com")).toMatchObject({ cargo: "CFO" });
      expect(contatos).toHaveLength(2);
    });

    it("telefone repetido na mesma parte não quebra e entra uma vez", async () => {
      const resultado = await importar([
        contato({ nome: "Ana", telefone: "+5511999998888", tags: ["a"] }),
        contato({ nome: "Ana 2", telefone: "+5511999998888", tags: ["b"] }),
      ]);
      expect(resultado).toMatchObject({ ok: true, criados: 1 });
      expect((await lista()).contatos[0]!.tags.map((t) => t.nome)).toEqual(["a", "b"]);
    });

    it("a autorização do WhatsApp guarda quem e quando, vale para as outras partes e não volta para quem saiu", async () => {
      const primeira = await importar([contato({ nome: "Ana", telefone: "+5511999998888" })], { autorizacaoWhatsapp: true });
      expect(primeira.ok).toBe(true);
      const importacaoId = (primeira as { importacaoId: string }).importacaoId;
      // A segunda parte tenta desligar a marca; vale a da importação.
      await importar([contato({ nome: "Caio", telefone: "+5521988887777" }), contato({ nome: "Sem fone", email: "x@y.com" })], {
        importacaoId,
        autorizacaoWhatsapp: false,
      });
      const linhas = await banco.db.query<{ nome: string; whatsapp_autorizado_em: Date | null; whatsapp_autorizacao: { por: string; importacao: string } | null }>(
        "select nome, whatsapp_autorizado_em, whatsapp_autorizacao from public.contatos where origem = 'importacao' order by nome",
      );
      expect(linhas.map((l) => [l.nome, l.whatsapp_autorizado_em])).toEqual([
        ["Ana", AGORA],
        ["Caio", AGORA],
        ["Sem fone", null],
      ]);
      expect(linhas[0]!.whatsapp_autorizacao).toMatchObject({ por: admin, importacao: importacaoId });

      await banco.db.query("update public.contatos set whatsapp_saiu_em = $1, whatsapp_autorizado_em = null where nome = 'Ana'", [AGORA]);
      await importar([contato({ nome: "Ana", telefone: "+5511999998888" })], { autorizacaoWhatsapp: true });
      const [ana] = await banco.db.query<{ whatsapp_autorizado_em: Date | null }>("select whatsapp_autorizado_em from public.contatos where nome = 'Ana'");
      expect(ana!.whatsapp_autorizado_em).toBeNull();
    });

    it("as tags para todos entram em todos os contatos da parte", async () => {
      await importar([contato({ nome: "Ana", telefone: "+5511999998888" }), contato({ nome: "Bia", email: "bia@x.com", tags: ["vip"] })], {
        tagsParaTodos: ["Evento SP"],
      });
      const { contatos } = await lista();
      expect(contatos.map((c) => [c.nome, c.tags.map((t) => t.nome)]).sort()).toEqual([
        ["Ana", ["Evento SP"]],
        ["Bia", ["Evento SP", "vip"]],
      ]);
    });

    it("contato de outra organização com o mesmo telefone não é tocado", async () => {
      const outra = await criarOrganizacao(banco.db);
      await banco.db.query(
        "insert into public.contatos (organizacao_id, nome, telefone, origem) values ($1::uuid, 'De fora', '+5511999998888', 'importacao')",
        [outra],
      );
      await importar([contato({ nome: "Ana", telefone: "+5511999998888", empresa: "Acme" })]);
      const [deFora] = await banco.db.query<{ nome: string; empresa: string | null }>(
        "select nome, empresa from public.contatos where organizacao_id = $1::uuid",
        [outra],
      );
      expect(deFora).toEqual({ nome: "De fora", empresa: null });
      expect((await lista()).total).toBe(1);
    });
  });

  describe("tags", () => {
    it("nome igual sem caixa e acento não duplica; renomear e trocar a cor valem para todos", async () => {
      const criada = await comoOperador((tx) => criarTag(tx, { organizacaoId, nome: "Ação", cor: "azul", operadorId: admin, agora: AGORA }));
      expect(criada.ok).toBe(true);
      expect(await comoOperador((tx) => criarTag(tx, { organizacaoId, nome: " acao ", operadorId: admin, agora: AGORA }))).toEqual({
        ok: false,
        erro: 'Já existe a tag "Ação".',
      });
      const id = (criada as { id: string }).id;
      expect(await comoOperador((tx) => editarTag(tx, { tagId: id, nome: "Ação de outubro", cor: "roxo" }))).toEqual({ ok: true });
      expect(await comoOperador((tx) => listarTags(tx, organizacaoId))).toEqual([{ id, nome: "Ação de outubro", cor: "roxo", contatos: 0 }]);
    });

    it("pôr em massa vale para todos do filtro, não só os da página; tirar tira", async () => {
      await importar(
        Array.from({ length: 60 }, (_, i) => contato({ nome: `Pessoa ${i}`, telefone: `+55119${String(i).padStart(8, "0")}`, empresa: i % 2 ? "Acme" : "Beta" })),
      );
      const tag = (await comoOperador((tx) => criarTag(tx, { organizacaoId, nome: "Acme", operadorId: admin, agora: AGORA }))) as { id: string };
      const pela = (alvo: Parameters<typeof porTag>[1]["alvo"]) =>
        comoOperador((tx) => porTag(tx, { organizacaoId, tagId: tag.id, alvo, operadorId: admin, agora: AGORA }));

      expect(await pela({ filtro: lerFiltro({ texto: "acme" }) })).toEqual({ ok: true, contatos: 30 });
      expect(await pela({ filtro: lerFiltro({ texto: "acme" }) })).toEqual({ ok: true, contatos: 0 });
      expect(await comoOperador((tx) => contarContatos(tx, { organizacaoId, filtro: lerFiltro({ tags: { alguma: [tag.id] } }) }))).toBe(30);

      const umaPagina = (await lista({ tags: { alguma: [tag.id] } })).contatos.slice(0, 2).map((c) => c.id);
      expect(
        await comoOperador((tx) => tirarTag(tx, { organizacaoId, tagId: tag.id, alvo: { ids: umaPagina }, operadorId: admin, agora: AGORA })),
      ).toEqual({ ok: true, contatos: 2 });
      expect((await lista({ tags: { alguma: [tag.id] } })).total).toBe(28);

      const [evento] = await banco.db.query<{ payload: { contatos: number; alvo: string } }>(
        "select payload from public.eventos where tipo = 'tag_posta' and entidade_id = $1",
        [tag.id],
      );
      expect(evento!.payload).toEqual({ contatos: 30, alvo: "filtro" });
    });

    it("apagar tira a tag de todos e diz de quantos", async () => {
      await importar([contato({ nome: "Ana", telefone: "+5511999998888", tags: ["Velha"] }), contato({ nome: "Bia", email: "b@b.com", tags: ["velha"] })]);
      const [tag] = await comoOperador((tx) => listarTags(tx, organizacaoId));
      expect(tag).toMatchObject({ nome: "Velha", contatos: 2 });
      expect(await comoOperador((tx) => apagarTag(tx, { tagId: tag!.id, operadorId: admin, agora: AGORA }))).toEqual({ ok: true, contatos: 2 });
      expect(await banco.db.query("select 1 from public.contato_tags")).toEqual([]);
    });

    it("tag de outra organização não aparece, não vai para contato daqui e o filtro com o id dela não vaza ninguém", async () => {
      const outra = await criarOrganizacao(banco.db);
      const deFora = await criarOperador(banco.db, { organizacaoId: outra, papel: "admin" });
      const tagDeFora = (await comOperador(banco.db, deFora, (tx) =>
        criarTag(tx, { organizacaoId: outra, nome: "Deles", operadorId: deFora, agora: AGORA }),
      )) as { id: string };
      await importar([contato({ nome: "Ana", telefone: "+5511999998888" })]);

      expect(await comoOperador((tx) => listarTags(tx, organizacaoId))).toEqual([]);
      expect(
        await comoOperador((tx) => porTag(tx, { organizacaoId, tagId: tagDeFora.id, alvo: { filtro: lerFiltro({}) }, operadorId: admin, agora: AGORA })),
      ).toEqual({ ok: false, erro: "Tag não encontrada." });
      await expect(
        banco.db.query(
          "insert into public.contato_tags (contato_id, tag_id) select id, $1::uuid from public.contatos where organizacao_id = $2::uuid",
          [tagDeFora.id, organizacaoId],
        ),
      ).rejects.toThrow(/organizações diferentes/);
      expect((await lista({ tags: { todas: [tagDeFora.id] } })).total).toBe(0);
      expect((await lista({ tags: { nenhuma: [tagDeFora.id] } })).total).toBe(1);
    });

    it("o painel do lead acha o contato e as tags dele", async () => {
      const pessoa = await criarPessoa(banco.db);
      const lead = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: await criarCampanha(banco.db), estado: "em_conversa" });
      const [{ id: contatoId }] = (await banco.db.query<{ id: string }>("select id from public.contatos where pessoa_id = $1::uuid", [pessoa])) as [
        { id: string },
      ];
      const tag = (await comoOperador((tx) => criarTag(tx, { organizacaoId, nome: "Quente", cor: "laranja", operadorId: admin, agora: AGORA }))) as {
        id: string;
      };
      await comoOperador((tx) => porTag(tx, { organizacaoId, tagId: tag.id, alvo: { ids: [contatoId] }, operadorId: admin, agora: AGORA }));
      expect(await comoOperador((tx) => tagsDoLead(tx, lead))).toEqual({ contatoId, tags: [{ id: tag.id, nome: "Quente", cor: "laranja" }] });
    });
  });

  describe("filtros e contato", () => {
    it("filtra por texto (nome, empresa, telefone), canal, origem e mostra o contato com o lead", async () => {
      await importar([contato({ nome: "Ana", telefone: "+5511999998888" }), contato({ nome: "Bia", email: "bia@acme.com", empresa: "Acme" })], {
        autorizacaoWhatsapp: true,
      });
      const pessoa = await criarPessoa(banco.db, { nome: "Carla", empresa: "Gama" });
      const lead = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: await criarCampanha(banco.db, { nome: "Diretores" }), estado: "em_conversa" });

      const nomes = async (filtro: unknown) => (await lista(filtro)).contatos.map((c) => c.nome).sort();
      expect(await nomes({ texto: "acme" })).toEqual(["Bia"]);
      expect(await nomes({ texto: "99999-8888" })).toEqual(["Ana"]);
      expect(await nomes({ texto: "100%" })).toEqual([]);
      expect(await nomes({ canal: "whatsapp" })).toEqual(["Ana"]);
      expect(await nomes({ canal: "linkedin" })).toEqual(["Carla"]);
      expect(await nomes({ origens: ["importacao"] })).toEqual(["Ana", "Bia"]);

      const [{ id }] = (await banco.db.query<{ id: string }>("select id from public.contatos where pessoa_id = $1::uuid", [pessoa])) as [{ id: string }];
      expect(await comoOperador((tx) => obterContato(tx, id))).toMatchObject({
        nome: "Carla",
        linkedin: true,
        lead: { id: lead, campanha: "Diretores", estado: "em_conversa", conta: "Arthur" },
      });
    });

    it("não contatar mais: o contato sai da lista e, se for lead do LinkedIn, vale o opt-out", async () => {
      const pessoa = await criarPessoa(banco.db, { providerId: "ACoLEAD" });
      const lead = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: await criarCampanha(banco.db), estado: "em_conversa" });
      const [{ id }] = (await banco.db.query<{ id: string }>("select id from public.contatos where pessoa_id = $1::uuid", [pessoa])) as [{ id: string }];

      const feito = await naoContatarMais(banco.db, {
        contatoId: id,
        organizacaoId,
        operadorId: admin,
        operadorNome: "Arthur",
        motivo: "pediu por telefone",
        agora: AGORA,
      });
      expect(feito).toEqual({ ok: true, jaEstava: false });
      const [linha] = await banco.db.query<{ nao_contatar_motivo: string; estado: string; optout: boolean }>(
        `select c.nao_contatar_motivo, l.estado, exists (select 1 from public.optouts where provider_id = 'ACoLEAD') as optout
           from public.contatos c, public.leads l where c.id = $1::uuid and l.id = $2::uuid`,
        [id, lead],
      );
      expect(linha).toEqual({ nao_contatar_motivo: "Marcado por Arthur: pediu por telefone", estado: "optout", optout: true });
      expect(
        await naoContatarMais(banco.db, { contatoId: id, organizacaoId, operadorId: admin, operadorNome: "Arthur", motivo: null, agora: AGORA }),
      ).toEqual({ ok: true, jaEstava: true });
    });
  });
});
