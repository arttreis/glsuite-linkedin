import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarCampanha, criarLead, criarOperador, criarPessoa, criarUsuarioSemAcesso } from "../support/fixtures";

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

  it("webhooks brutos ficam restritos ao admin", async () => {
    await banco.db.query(
      "insert into public.webhooks_recebidos (provider_event_id, fonte, payload) values ('e1', 'unipile', '{}')",
    );
    expect(await comOperador(banco.db, luiz, (tx) => tx.query("select id from public.webhooks_recebidos"))).toHaveLength(0);
    expect(await comOperador(banco.db, admin, (tx) => tx.query("select id from public.webhooks_recebidos"))).toHaveLength(1);
  });
});
