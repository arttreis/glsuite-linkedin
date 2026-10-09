import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  criarCampanha,
  criarLead,
  criarOperador,
  criarOrganizacao,
  criarPerfilNaOrganizacao,
  criarPessoa,
  criarUsuarioSemAcesso,
} from "../support/fixtures";

describe("RLS por operador", () => {
  let banco: BancoDeTeste;
  let admin: string;
  let luiz: string;
  let estranho: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    admin = await criarOperador(banco.db, { nome: "Arthur", papel: "admin" });
    luiz = await criarOperador(banco.db, { nome: "Luiz", perfis: ["luiz"] });
    estranho = await criarUsuarioSemAcesso(banco.db);

    const campanhaBrasil = await criarCampanha(banco.db, { perfil: "arthur" });
    const campanhaCanada = await criarCampanha(banco.db, { perfil: "luiz" });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "arthur" }), campanhaId: campanhaBrasil });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "luiz" }), campanhaId: campanhaCanada });
  });

  const contarLeads = (usuario: string) =>
    comOperador(banco.db, usuario, (tx) => tx.query<{ perfil: string }>(
      "select p.slug as perfil from public.leads l join public.perfis p on p.id = l.perfil_id",
    ));

  it("operador só enxerga leads dos perfis que recebeu", async () => {
    expect((await contarLeads(luiz)).map((linha) => linha.perfil)).toEqual(["luiz"]);
  });

  it("admin enxerga todos os leads", async () => {
    expect(await contarLeads(admin)).toHaveLength(2);
  });

  it("usuário logado que não é operador não enxerga nada", async () => {
    expect(await contarLeads(estranho)).toHaveLength(0);
    const perfis = await comOperador(banco.db, estranho, (tx) => tx.query("select id from public.perfis"));
    expect(perfis).toHaveLength(0);
  });

  it("operador desativado perde o acesso", async () => {
    await banco.db.query("update public.operadores set ativo = false where id = $1::uuid", [luiz]);
    expect(await contarLeads(luiz)).toHaveLength(0);
  });

  it("qualquer operador vê todos os perfis (para poder pausar), mas só edita o que é seu", async () => {
    const perfis = await comOperador(banco.db, luiz, (tx) => tx.query("select slug from public.perfis"));
    expect(perfis).toHaveLength(4);

    const editados = await comOperador(banco.db, luiz, (tx) =>
      tx.query("update public.perfis set link_agenda = 'x' where slug = 'arthur' returning id"),
    );
    expect(editados).toHaveLength(0);
  });

  it("operador não cria campanha em perfil alheio", async () => {
    const tentativa = comOperador(banco.db, luiz, (tx) =>
      tx.query(
        `insert into public.campanhas (perfil_id, nome, angulo, sequencia, pos_t4)
         select id, 'Invasão', 'Margem invisível', '[]'::jsonb, 'conexao' from public.perfis where slug = 'arthur'`,
      ),
    );
    await expect(tentativa).rejects.toThrow(/row-level security/);
  });

  it("qualquer operador registra opt-out, e ninguém apaga auditoria", async () => {
    await comOperador(banco.db, luiz, (tx) =>
      tx.query("insert into public.optouts (provider_id, texto_pedido) values ('ACoZ', 'stop')"),
    );
    await banco.db.query("insert into public.eventos (tipo, entidade) values ('teste', 'sistema')");
    const apagados = await comOperador(banco.db, admin, (tx) => tx.query("delete from public.eventos returning id"));
    expect(apagados).toHaveLength(0);
  });

  it("webhooks brutos não aparecem para ninguém logado", async () => {
    await banco.db.query(
      "insert into public.webhooks_recebidos (provider_event_id, fonte, payload) values ('e1', 'unipile', '{}')",
    );
    expect(await comOperador(banco.db, luiz, (tx) => tx.query("select id from public.webhooks_recebidos"))).toHaveLength(0);
    expect(await comOperador(banco.db, admin, (tx) => tx.query("select id from public.webhooks_recebidos"))).toHaveLength(0);
  });
});

describe("RLS por organização", () => {
  let banco: BancoDeTeste;
  let adminDaGuessless: string;
  let adminDeFora: string;
  let operadorDeFora: string;
  let perfilDeFora: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    adminDaGuessless = await criarOperador(banco.db, { nome: "Arthur", papel: "admin" });

    const outra = await criarOrganizacao(banco.db, { slug: "outra", nome: "Outra Empresa" });
    perfilDeFora = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: outra, slug: "maria" });
    adminDeFora = await criarOperador(banco.db, { nome: "Admin de fora", papel: "admin", organizacaoId: outra });
    operadorDeFora = await criarOperador(banco.db, { nome: "Operador de fora", organizacaoId: outra, perfilIds: [perfilDeFora] });

    const campanha = await criarCampanha(banco.db, { perfil: "arthur" });
    const leadId = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "arthur" }), campanhaId: campanha });
    const arthur = (await banco.db.query<{ id: string }>("select id from public.perfis where slug = 'arthur'"))[0]!.id;
    await banco.db.query("insert into public.optouts (provider_id, perfil_origem, texto_pedido) values ('ACoX', $1::uuid, 'pare')", [arthur]);
    await banco.db.query(
      "insert into public.eventos (tipo, entidade, entidade_id, perfil_id) values ('teste', 'lead', $1, $2::uuid)",
      [leadId, arthur],
    );
    await banco.db.query(
      "insert into public.alertas (chave, tipo, perfil_id, destinatarios, assunto, texto) values ('a1', 'teste', $1::uuid, '{x@y.z}', 'a', 'b')",
      [arthur],
    );
  });

  const tabelas = ["perfis", "operadores", "campanhas", "leads", "pessoas", "acoes", "optouts", "eventos", "alertas", "organizacoes"];

  it("o admin de outra organização não lê nada da GuessLess", async () => {
    for (const tabela of tabelas) {
      const linhas = await comOperador(banco.db, adminDeFora, (tx) =>
        tx.query<{ org: string | null }>(`select 1 as org from public.${tabela}`),
      );
      const proprias = tabela === "perfis" || tabela === "operadores" || tabela === "organizacoes" ? linhas.length : 0;
      expect({ tabela, linhas: linhas.length }).toEqual({ tabela, linhas: proprias });
    }
    const perfis = await comOperador(banco.db, adminDeFora, (tx) => tx.query<{ slug: string }>("select slug from public.perfis"));
    expect(perfis.map((p) => p.slug)).toEqual(["maria"]);
  });

  it("o admin da GuessLess não vê a outra organização", async () => {
    const perfis = await comOperador(banco.db, adminDaGuessless, (tx) => tx.query<{ slug: string }>("select slug from public.perfis"));
    expect(perfis.map((p) => p.slug).sort()).toEqual(["arthur", "jp", "juliano", "luiz"]);
    const orgs = await comOperador(banco.db, adminDaGuessless, (tx) => tx.query<{ slug: string }>("select slug from public.organizacoes"));
    expect(orgs.map((o) => o.slug)).toEqual(["guessless"]);
  });

  it("o admin de fora não edita perfil da GuessLess nem se liga a ele", async () => {
    const editados = await comOperador(banco.db, adminDeFora, (tx) =>
      tx.query("update public.perfis set link_agenda = 'x' where slug = 'arthur' returning id"),
    );
    expect(editados).toHaveLength(0);
    const tentativa = comOperador(banco.db, adminDeFora, (tx) =>
      tx.query(
        "insert into public.operador_perfis (operador_id, perfil_id) select $1::uuid, id from public.perfis where slug = 'arthur'",
        [adminDeFora],
      ),
    );
    // O perfil da GuessLess nem aparece no select: nada é inserido.
    await expect(tentativa).resolves.toEqual([]);
    const [{ n }] = await banco.db.query<{ n: number }>(
      "select count(*)::int as n from public.operador_perfis where operador_id = $1::uuid",
      [adminDeFora],
    );
    expect(n).toBe(0);
  });

  it("o operador de fora vê só o próprio perfil e a própria organização", async () => {
    const perfis = await comOperador(banco.db, operadorDeFora, (tx) => tx.query<{ id: string }>("select id from public.perfis"));
    expect(perfis.map((p) => p.id)).toEqual([perfilDeFora]);
  });

  it("só o admin renomeia a própria organização", async () => {
    const pelaOperadora = await comOperador(banco.db, operadorDeFora, (tx) =>
      tx.query("update public.organizacoes set nome = 'Nova' returning id"),
    );
    expect(pelaOperadora).toHaveLength(0);
    const peloAdmin = await comOperador(banco.db, adminDeFora, (tx) =>
      tx.query<{ slug: string }>("update public.organizacoes set nome = 'Nova' returning slug"),
    );
    expect(peloAdmin.map((o) => o.slug)).toEqual(["outra"]);
  });
});
