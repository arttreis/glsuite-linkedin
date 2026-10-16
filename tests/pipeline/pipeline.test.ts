import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { comOperador } from "@/server/db/operador";
import { quadroDoPipeline } from "@/server/pipeline/pipeline";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarOrganizacao, criarPessoa } from "../support/fixtures";

const AGORA = new Date("2026-10-12T15:00:00Z");

describe("Pipeline (SDR-49)", () => {
  let banco: BancoDeTeste;
  let duda: string;
  let multimarcas: string;
  let boutiques: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    await ativarPerfil(banco.db, "juliano");
    await ativarPerfil(banco.db, "luiz");
    duda = await criarOperador(banco.db, { nome: "Duda", perfis: ["juliano", "luiz"] });
    multimarcas = await criarCampanha(banco.db, { perfil: "juliano", nome: "Multimarcas" });
    boutiques = await criarCampanha(banco.db, { perfil: "luiz", nome: "Boutiques" });
  });

  const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);

  async function lead(campanhaId: string, estado: string, nome: string, dono: "juliano" | "luiz" = "juliano") {
    const pessoa = await criarPessoa(banco.db, { dono, nome, providerId: `ACo${randomUUID().replaceAll("-", "")}` });
    return criarLead(banco.db, { pessoaId: pessoa, campanhaId, estado });
  }

  const nomesPorColuna = (colunas: Awaited<ReturnType<typeof quadroDoPipeline>>) =>
    Object.fromEntries(colunas.map((coluna) => [coluna.id, coluna.cartoes.map((cartao) => cartao.nome).sort()]));

  it("cada lead cai na coluna da etapa dele; triagem e rejeitado ficam fora", async () => {
    await lead(multimarcas, "na_fila", "Ana");
    await lead(multimarcas, "convite_enviado", "Bia");
    await lead(multimarcas, "em_sequencia", "Carla");
    await lead(multimarcas, "escalado_humano", "Dani");
    await lead(multimarcas, "qualificado", "Eva");
    await lead(multimarcas, "reuniao_marcada", "Fê");
    await lead(multimarcas, "encerrado_nao", "Gabi");
    await lead(multimarcas, "triagem", "Helô");
    await lead(multimarcas, "rejeitado", "Iara");

    const colunas = await comoDuda((tx) => quadroDoPipeline(tx));
    expect(nomesPorColuna(colunas)).toEqual({
      na_fila: ["Ana"],
      convite_enviado: ["Bia"],
      conectado: ["Carla"],
      conversando: ["Dani"],
      qualificado: ["Eva"],
      reuniao: ["Fê"],
      encerrado: ["Gabi"],
    });
    expect(colunas.find((coluna) => coluna.id === "conversando")!.total).toBe(1);
  });

  it("o card mostra as tags do contato e o filtro por tag deixa só quem tem a tag (SDR-70)", async () => {
    const ana = await lead(multimarcas, "em_conversa", "Ana");
    await lead(multimarcas, "em_conversa", "Bia");
    const [organizacao] = await banco.db.query<{ id: string }>("select organizacao_id as id from public.perfis where slug = 'juliano'");
    const [tag] = await banco.db.query<{ id: string }>(
      "insert into public.tags (organizacao_id, nome, chave, cor) values ($1::uuid, 'Quente', 'quente', 'laranja') returning id",
      [organizacao!.id],
    );
    await banco.db.query(
      `insert into public.contato_tags (contato_id, tag_id)
       select c.id, $2::uuid from public.contatos c join public.leads l on l.pessoa_id = c.pessoa_id where l.id = $1::uuid`,
      [ana, tag!.id],
    );

    const todos = await comoDuda((tx) => quadroDoPipeline(tx));
    const conversando = todos.find((coluna) => coluna.id === "conversando")!;
    expect(conversando.cartoes.find((c) => c.nome === "Ana")!.tags).toEqual([{ id: tag!.id, nome: "Quente", cor: "laranja" }]);
    expect(conversando.cartoes.find((c) => c.nome === "Bia")!.tags).toEqual([]);

    const comTag = await comoDuda((tx) => quadroDoPipeline(tx, { tagId: tag!.id }));
    expect(nomesPorColuna(comTag).conversando).toEqual(["Ana"]);
  });

  it("filtra por campanha e por conta", async () => {
    await lead(multimarcas, "na_fila", "Ana");
    await lead(boutiques, "na_fila", "Bia", "luiz");
    const porCampanha = await comoDuda((tx) => quadroDoPipeline(tx, { campanhaId: boutiques }));
    expect(nomesPorColuna(porCampanha).na_fila).toEqual(["Bia"]);

    const [juliano] = await banco.db.query<{ id: string }>("select id from public.perfis where slug = 'juliano'");
    const porConta = await comoDuda((tx) => quadroDoPipeline(tx, { perfilId: juliano!.id }));
    expect(nomesPorColuna(porConta).na_fila).toEqual(["Ana"]);
  });

  it("movimento inválido não acontece; o válido move o card", async () => {
    const bia = await lead(multimarcas, "convite_enviado", "Bia");
    expect(await marcarDesfecho(banco.db, { leadId: bia, para: "qualificado", operadorId: duda, agora: AGORA })).toBe(false);
    const dani = await lead(multimarcas, "em_conversa", "Dani");
    expect(await marcarDesfecho(banco.db, { leadId: dani, para: "qualificado", operadorId: duda, agora: AGORA })).toBe(true);

    const colunas = nomesPorColuna(await comoDuda((tx) => quadroDoPipeline(tx)));
    expect(colunas.convite_enviado).toEqual(["Bia"]);
    expect(colunas.qualificado).toEqual(["Dani"]);
  });

  it("a conta da casa e outra organização ficam fora", async () => {
    await lead(multimarcas, "na_fila", "Ana");
    const outra = await criarOperador(banco.db, { organizacaoId: await criarOrganizacao(banco.db) });
    const deFora = await comOperador(banco.db, outra, (tx) => quadroDoPipeline(tx));
    expect(deFora.every((coluna) => coluna.total === 0)).toBe(true);

    await banco.db.query("update public.perfis set casa = true where slug = 'juliano'");
    expect(nomesPorColuna(await comoDuda((tx) => quadroDoPipeline(tx))).na_fila).toEqual([]);
  });
});
