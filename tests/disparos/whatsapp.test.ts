import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { TipoDeCanal } from "@/domain/disparos";
import { conectarWhatsapp, desconectarCanal, obterCanal, tokenDeVerificacaoDoWhatsapp } from "@/server/canais/canais";
import { importarContatos, type ContatoParaImportar } from "@/server/contatos/contatos";
import { salvarSegmento } from "@/server/contatos/segmentos";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import {
  cancelarDisparo,
  conferirDisparo,
  confirmarDisparo,
  contatosDoSegmento,
  obterDisparo,
  pausarDisparo,
  planejarEnvios,
  resultadoDoDisparo,
  retomarDisparo,
  salvarRascunho,
  tentarDeNovoAsFalhas,
} from "@/server/disparos/disparos";
import { enviadorDoWhatsapp, processarDisparos } from "@/server/disparos/fila";
import { receberWebhookWhatsapp, verificarWebhookWhatsapp } from "@/server/disparos/webhook-whatsapp";
import { alterarModulo } from "@/server/modulos/modulos";
import { criarCofre } from "@/server/segredos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";
import { erroDaMeta, TEMPLATE_OFERTA, WhatsappFalso } from "../support/whatsapp-falso";

// 12h em Brasília: dentro da janela de envio (8h às 21h).
const AGORA = new Date("2026-10-16T15:00:00Z");
const SEGREDO_DO_APP = "0123456789abcdef0123456789abcdef";
const cofre = criarCofre(Buffer.alloc(32, 7).toString("base64"));

const contato = (nome: string, telefone: string | null, extra: Partial<ContatoParaImportar> = {}): ContatoParaImportar => ({
  nome,
  primeiroNome: nome.split(" ")[0]!,
  telefone,
  email: telefone ? null : `${nome.toLowerCase().replace(/\s+/g, ".")}@x.com`,
  empresa: "Acme",
  cargo: null,
  tags: ["Cliente"],
  ...extra,
});

describe("disparos no WhatsApp (SDR-72, §4.18 e §4.19)", () => {
  let banco: BancoDeTeste;
  let organizacaoId: string;
  let admin: string;
  let whatsapp: WhatsappFalso;
  let canalId: string;
  let segmentoId: string;
  let relogio: Date;

  const comoAdmin = <T>(fn: (tx: Db) => Promise<T>) => comOperador(banco.db, admin, fn);
  const conectar = (extra: Partial<Parameters<typeof conectarWhatsapp>[1]> = {}) =>
    conectarWhatsapp(
      { db: banco.db, whatsapp, cofre, urlDoApp: "https://sdr.glsuite.io" },
      { organizacaoId, operadorId: admin, wabaId: "100200300", phoneNumberId: "200100", token: "EAAG-token-de-sistema-0123456789", segredoDoApp: SEGREDO_DO_APP, agora: AGORA, ...extra },
    );
  const importar = (contatos: ContatoParaImportar[], autorizacaoWhatsapp = true) =>
    importarContatos(banco.db, { organizacaoId, operadorId: admin, importacaoId: null, arquivoNome: "base.csv", autorizacaoWhatsapp, tagsParaTodos: [], contatos, agora: AGORA });
  const rascunho = (variaveis: Record<string, unknown> = { "corpo:1": { campo: "primeiro_nome" }, "corpo:2": { campo: "empresa" } }, templateId = TEMPLATE_OFERTA.id) =>
    comoAdmin((tx) =>
      salvarRascunho(tx, {
        organizacaoId,
        id: null,
        canal: "whatsapp",
        nome: "Oferta de outubro",
        segmentoId,
        conteudo: { tipo: "whatsapp", templateId, variaveis },
        operadorId: admin,
        agora: AGORA,
      }),
    );
  const disparo = (id: string) => comoAdmin((tx) => obterDisparo(tx, { id, organizacaoId }));
  const confirmar = async (id: string, quando: Date | null = null) => {
    const guardado = (await disparo(id))!;
    const contatos = await comoAdmin((tx) => contatosDoSegmento(tx, { organizacaoId, filtros: guardado.filtros, canal: "whatsapp", disparoId: id }));
    return confirmarDisparo(banco.db, {
      organizacaoId,
      disparoId: id,
      filtros: guardado.filtros,
      envios: planejarEnvios(guardado, contatos, AGORA, 24),
      quando,
      operadorId: admin,
      agora: AGORA,
    });
  };
  const rodar = (extra: Partial<Parameters<typeof processarDisparos>[0]> = {}) =>
    processarDisparos({ db: banco.db, cofre, agora: () => relogio, enviadores: { whatsapp: enviadorDoWhatsapp(whatsapp) }, esperar: async () => {}, ...extra });
  const envios = (disparoId: string) =>
    banco.db.query<{ nome: string; status: string; motivo: string | null; codigo_erro: string | null; provider_message_id: string | null; tentativas: number }>(
      "select nome, status, motivo, codigo_erro, provider_message_id, tentativas from public.envios_do_disparo where disparo_id = $1::uuid order by nome",
      [disparoId],
    );
  const statusDo = async (id: string) => (await banco.db.query<{ status: string; motivo_pausa: string | null }>("select status, motivo_pausa from public.disparos where id = $1::uuid", [id]))[0]!;
  const assinado = (corpo: unknown, segredo = SEGREDO_DO_APP) => {
    const bruto = JSON.stringify(corpo);
    return new Request(`https://sdr.glsuite.io/api/webhooks/whatsapp/${canalId}`, {
      method: "POST",
      body: bruto,
      headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", segredo).update(bruto).digest("hex")}` },
    });
  };
  const aviso = (valor: Record<string, unknown>, campo = "messages") => ({
    object: "whatsapp_business_account",
    entry: [{ id: "100200300", changes: [{ field: campo, value: { messaging_product: "whatsapp", metadata: { phone_number_id: "200100" }, ...valor } }] }],
  });
  const webhook = (corpo: unknown, segredo?: string) => receberWebhookWhatsapp(assinado(corpo, segredo), canalId, { db: banco.db, cofre, agora: () => relogio });

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacaoId = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    whatsapp = new WhatsappFalso();
    relogio = AGORA;
    const conectado = await conectar();
    expect(conectado).toMatchObject({ ok: true, inscrito: true });
    canalId = (conectado as { canalId: string }).canalId;
    await importar([contato("Ana Souza", "+5511999990001"), contato("Bia Lima", "+5511999990002"), contato("Caio Dias", "+5511999990003")]);
    const [{ id: tagId }] = (await banco.db.query<{ id: string }>("select id from public.tags where nome = 'Cliente'")) as [{ id: string }];
    const segmento = await comoAdmin((tx) =>
      salvarSegmento(tx, { organizacaoId, id: null, nome: "Clientes", filtros: { tags: { alguma: [tagId] } }, operadorId: admin, agora: AGORA }),
    );
    segmentoId = (segmento as { id: string }).id;
  });

  describe("conectar", () => {
    it("confere na Meta, guarda o token e o segredo cifrados e inscreve o app com o webhook do Kakou", async () => {
      const [linha] = await banco.db.query<{ credencial: string; segredo: string; nome: string }>("select credencial, segredo, nome from public.canais where id = $1::uuid", [canalId]);
      expect(linha!.credencial).not.toContain("EAAG");
      expect(cofre.decifrar(linha!.credencial)).toBe("EAAG-token-de-sistema-0123456789");
      expect(cofre.decifrar(linha!.segredo)).toBe(SEGREDO_DO_APP);
      expect(linha!.nome).toBe("+55 11 4000-0000");
      expect(whatsapp.inscricoes).toEqual([
        { wabaId: "100200300", urlDoWebhook: `https://sdr.glsuite.io/api/webhooks/whatsapp/${canalId}`, tokenDeVerificacao: tokenDeVerificacaoDoWhatsapp(cofre, canalId) },
      ]);
      const canal = await comoAdmin((tx) => obterCanal(tx, { organizacaoId, tipo: "whatsapp" }));
      expect(canal).toMatchObject({ status: "conectado", dados: { qualidade: "GREEN", limite: "TIER_2K" } });
    });

    it("o painel não lê as credenciais", async () => {
      await expect(comoAdmin((tx) => tx.query("select credencial from public.canais"))).rejects.toThrow(/permission denied/);
    });

    it("token recusado pela Meta não conecta; número de outra organização também não", async () => {
      whatsapp.erroNaConferencia = erroDaMeta("190", 401);
      expect(await conectar()).toEqual({ ok: false, erro: "O token do WhatsApp venceu ou foi revogado. Conecte de novo." });
      whatsapp.erroNaConferencia = null;

      const outra = await criarOrganizacao(banco.db);
      const deFora = await conectarWhatsapp(
        { db: banco.db, whatsapp, cofre, urlDoApp: "https://sdr.glsuite.io" },
        { organizacaoId: outra, operadorId: admin, wabaId: "100200300", phoneNumberId: "200100", token: "EAAG-outro-token-0123456789", segredoDoApp: SEGREDO_DO_APP, agora: AGORA },
      );
      expect(deFora).toEqual({ ok: false, erro: "Este número já está conectado em outra organização do Kakou." });
    });

    it("se a inscrição do webhook falha, o canal fica conectado e diz por quê", async () => {
      whatsapp.erroNaInscricao = erroDaMeta("200", 403);
      expect(await conectar()).toMatchObject({ ok: true, inscrito: false });
      const canal = await comoAdmin((tx) => obterCanal(tx, { organizacaoId, tipo: "whatsapp" }));
      expect(canal!.dados).toMatchObject({ inscricao: { ok: false, erro: "O token não tem permissão para esta conta do WhatsApp Business." } });
    });
  });

  describe("rascunho, conferência e confirmação", () => {
    it("só template aprovado e da conta", async () => {
      expect(await rascunho(undefined, "tpl-pendente")).toEqual({ ok: false, erro: 'O template "rascunho" não está aprovado pela Meta.' });
      expect(await rascunho(undefined, "nao-existe")).toMatchObject({ ok: false, erro: expect.stringContaining("não está mais na conta") });
    });

    it("mostra quem recebe, quem fica de fora e por quê, três mensagens e a estimativa da Meta", async () => {
      await importar([contato("Duda Sem Aut", "+5511999990004")], false);
      await importar([contato("Eva Sem Fone", null)]);
      await banco.db.query("update public.contatos set empresa = null where nome = 'Caio Dias'");
      await banco.db.query("update public.contatos set whatsapp_saiu_em = $1 where nome = 'Bia Lima'", [AGORA]);
      const { id } = (await rascunho()) as { id: string };
      const conferencia = await comoAdmin(async (tx) => conferirDisparo(tx, { disparo: (await obterDisparo(tx, { id, organizacaoId }))!, agora: AGORA }));
      expect(conferencia).toMatchObject({
        ok: true,
        recebem: 1,
        exemplos: [{ nome: "Ana Souza", texto: "Oi Ana, a Acme tem novidade. Responda SAIR para não receber mais." }],
        custo: { valor: 0.06, moeda: "USD", categoria: "MARKETING" },
        limite: null,
      });
      expect((conferencia as { deFora: unknown[] }).deFora).toEqual(
        expect.arrayContaining([
          { motivo: "Saiu do WhatsApp.", quantos: 1 },
          { motivo: "Sem autorização para o WhatsApp.", quantos: 1 },
          { motivo: "Sem telefone.", quantos: 1 },
          { motivo: "Contato sem empresa para {{2}} no texto.", quantos: 1 },
        ]),
      );
    });

    it("a lista congela na confirmação: quem entra no segmento depois não recebe", async () => {
      const { id } = (await rascunho()) as { id: string };
      expect(await confirmar(id)).toEqual({ ok: true, agendadoPara: AGORA, recebem: 3 });
      await importar([contato("Fábio Novo", "+5511999990009")]);
      await rodar();
      expect((await envios(id)).map((e) => [e.nome, e.status])).toEqual([
        ["Ana Souza", "enviado"],
        ["Bia Lima", "enviado"],
        ["Caio Dias", "enviado"],
      ]);
      expect(whatsapp.envios.map((e) => e.para).sort()).toEqual(["+5511999990001", "+5511999990002", "+5511999990003"]);
      expect(whatsapp.envios.find((e) => e.para === "+5511999990001")).toMatchObject({
        template: { nome: "oferta_outubro", idioma: "pt_BR", componentes: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "Acme" }] }] },
      });
      expect(await statusDo(id)).toEqual({ status: "concluido", motivo_pausa: null });
    });

    it("confirmado não se edita; sem ninguém para receber, não confirma; agendar fora da janela recusa com o horário que dá", async () => {
      await banco.db.query("update public.contatos set whatsapp_autorizado_em = null");
      const { id } = (await rascunho()) as { id: string };
      expect(await confirmar(id)).toEqual({ ok: false, erro: "Ninguém do segmento pode receber agora. Veja quem ficou de fora e por quê." });
      await banco.db.query("update public.contatos set whatsapp_autorizado_em = $1", [AGORA]);
      expect(await confirmar(id, new Date("2026-10-17T02:00:00Z"))).toEqual({
        ok: false,
        erro: "Disparo só sai das 08:00 às 21:00. O horário mais perto que dá é 17/10/2026, 08:00.",
      });
      expect((await confirmar(id, new Date("2026-10-17T12:00:00Z"))).ok).toBe(true);
      expect(await confirmar(id)).toEqual({ ok: false, erro: "Este disparo já foi confirmado." });
      expect(
        await comoAdmin((tx) =>
          salvarRascunho(tx, { organizacaoId, id, canal: "whatsapp", nome: "Outro", segmentoId, conteudo: { tipo: "whatsapp", templateId: TEMPLATE_OFERTA.id, variaveis: {} }, operadorId: admin, agora: AGORA }),
        ),
      ).toEqual({ ok: false, erro: "Disparo confirmado não se edita: pause, retome ou cancele." });
    });

    it("disparar agora fora da janela começa na próxima abertura, e a fila não manda antes", async () => {
      relogio = new Date("2026-10-17T01:00:00Z"); // 22h
      const { id } = (await rascunho()) as { id: string };
      const guardado = (await disparo(id))!;
      const contatos = await comoAdmin((tx) => contatosDoSegmento(tx, { organizacaoId, filtros: guardado.filtros, canal: "whatsapp", disparoId: id }));
      const confirmado = await confirmarDisparo(banco.db, {
        organizacaoId,
        disparoId: id,
        filtros: guardado.filtros,
        envios: planejarEnvios(guardado, contatos, relogio, 24),
        quando: null,
        operadorId: admin,
        agora: relogio,
      });
      expect(confirmado).toMatchObject({ ok: true, agendadoPara: new Date("2026-10-17T11:00:00Z") });
      await rodar();
      expect(whatsapp.envios).toEqual([]);
      relogio = new Date("2026-10-17T11:05:00Z");
      await rodar();
      expect(whatsapp.envios).toHaveLength(3);
    });
  });

  describe("a fila", () => {
    let id: string;
    beforeEach(async () => {
      ({ id } = (await rascunho()) as { id: string });
      expect((await confirmar(id)).ok).toBe(true);
    });

    it("confere cada contato de novo: quem saiu depois da confirmação é pulado", async () => {
      await banco.db.query("update public.contatos set whatsapp_saiu_em = $1 where nome = 'Bia Lima'", [AGORA]);
      await banco.db.query("update public.contatos set nao_contatar_em = $1 where nome = 'Caio Dias'", [AGORA]);
      await rodar();
      expect((await envios(id)).map((e) => [e.nome, e.status, e.motivo])).toEqual([
        ["Ana Souza", "enviado", null],
        ["Bia Lima", "pulado", "Saiu do WhatsApp."],
        ["Caio Dias", "pulado", "Pediu para não ser contatado."],
      ]);
    });

    it("envio que caiu no meio vira falha 'pode ter chegado' e não sai de novo sozinho", async () => {
      await banco.db.query(
        "update public.envios_do_disparo set status = 'enviando', reservado_ate = $2, tentativas = 1 where disparo_id = $1::uuid and nome = 'Ana Souza'",
        [id, new Date(AGORA.getTime() - 1000)],
      );
      await banco.db.query("update public.disparos set status = 'enviando' where id = $1::uuid", [id]);
      await rodar();
      const ana = (await envios(id)).find((e) => e.nome === "Ana Souza")!;
      expect(ana).toMatchObject({ status: "falhou", codigo_erro: "interrompido", motivo: expect.stringContaining("Pode ter chegado") });
      expect(whatsapp.envios.map((e) => e.para)).not.toContain("+5511999990001");
    });

    it("sem resposta da Meta também é 'pode ter chegado'", async () => {
      whatsapp.erroNoEnvio.set("+5511999990001", erroDaMeta("rede", 0));
      await rodar();
      expect((await envios(id))[0]).toMatchObject({ status: "falhou", codigo_erro: "interrompido" });
    });

    it("número sem WhatsApp falha sem nova tentativa; limite de ritmo espera e tenta de novo até o teto", async () => {
      whatsapp.erroNoEnvio.set("+5511999990001", erroDaMeta("131026"));
      whatsapp.erroNoEnvio.set("+5511999990002", erroDaMeta("130429", 429));
      await rodar();
      let lista = await envios(id);
      expect(lista[0]).toMatchObject({ status: "falhou", codigo_erro: "131026", tentativas: 1 });
      expect(lista[1]).toMatchObject({ status: "pendente", codigo_erro: "130429", tentativas: 1 });
      for (let i = 0; i < 4; i += 1) {
        relogio = new Date(relogio.getTime() + 10 * 60_000);
        await rodar();
      }
      lista = await envios(id);
      expect(lista[1]).toMatchObject({ status: "falhou", codigo_erro: "130429", tentativas: 3 });
      expect(whatsapp.envios.filter((e) => e.para === "+5511999990001")).toHaveLength(1);
      expect(await statusDo(id)).toMatchObject({ status: "concluido" });
    });

    it("token inválido pausa o disparo, deixa o canal com erro e não gasta o contato", async () => {
      for (const numero of ["+5511999990001", "+5511999990002", "+5511999990003"]) whatsapp.erroNoEnvio.set(numero, erroDaMeta("190", 401));
      await rodar();
      expect(await statusDo(id)).toEqual({ status: "pausado", motivo_pausa: "O token do WhatsApp venceu ou foi revogado. Conecte de novo." });
      expect((await envios(id)).map((e) => [e.status, e.tentativas])).toEqual([
        ["pendente", 0],
        ["pendente", 0],
        ["pendente", 0],
      ]);
      const canal = await comoAdmin((tx) => obterCanal(tx, { organizacaoId, tipo: "whatsapp" }));
      expect(canal).toMatchObject({ status: "erro" });
      expect(await retomarDisparo(banco.db, { organizacaoId, disparoId: id, operadorId: admin, agora: AGORA })).toEqual({ ok: true });
      await rodar();
      expect(await statusDo(id)).toEqual({ status: "pausado", motivo_pausa: "O canal está com erro. Veja em Configurações e retome." });
    });

    it("template pausado pela Meta pausa o disparo", async () => {
      for (const numero of ["+5511999990001", "+5511999990002", "+5511999990003"]) whatsapp.erroNoEnvio.set(numero, erroDaMeta("132015"));
      await rodar();
      expect(await statusDo(id)).toMatchObject({ status: "pausado", motivo_pausa: expect.stringContaining("pausou o template") });
    });

    it("parou o marketing (131050): falha e o contato sai do WhatsApp", async () => {
      whatsapp.erroNoEnvio.set("+5511999990001", erroDaMeta("131050"));
      await rodar();
      const [ana] = await banco.db.query<{ whatsapp_saiu_em: Date | null }>("select whatsapp_saiu_em from public.contatos where nome = 'Ana Souza'");
      expect(ana!.whatsapp_saiu_em).toEqual(AGORA);
    });

    it("fora da janela não sai nada; módulo desligado pausa", async () => {
      relogio = new Date("2026-10-17T00:30:00Z"); // 21h30
      await rodar();
      expect(whatsapp.envios).toEqual([]);
      relogio = AGORA;
      await alterarModulo(banco.db, { organizacaoId, modulo: "whatsapp", ativo: false, motivo: "cancelou", por: "arthur@guessless.com.br", agora: AGORA });
      expect(await statusDo(id)).toMatchObject({ status: "pausado" });
      expect(await retomarDisparo(banco.db, { organizacaoId, disparoId: id, operadorId: admin, agora: AGORA })).toEqual({
        ok: false,
        erro: "O módulo deste canal não está no plano da organização.",
      });
    });

    it("chegando ao limite da Meta em 24 h, o disparo pausa", async () => {
      await banco.db.query("update public.canais set dados = jsonb_set(dados, '{limite}', '\"TIER_250\"') where id = $1::uuid", [canalId]);
      await banco.db.query(
        `insert into public.contatos (organizacao_id, nome, telefone, origem) select $1::uuid, 'Velho ' || g, '+55119' || lpad(g::text, 8, '0'), 'importacao' from generate_series(1, 250) g`,
        [organizacaoId],
      );
      const [antigo] = await banco.db.query<{ id: string }>(
        `insert into public.disparos (organizacao_id, canal_id, canal_tipo, nome, status, confirmado_em, agendado_para)
         values ($1::uuid, $2::uuid, 'whatsapp', 'Ontem', 'concluido', $3, $3) returning id`,
        [organizacaoId, canalId, new Date(AGORA.getTime() - 3_600_000)],
      );
      await banco.db.query(
        `insert into public.envios_do_disparo (disparo_id, contato_id, destino, nome, status, enviado_em)
         select $1::uuid, id, telefone, nome, 'enviado', $2 from public.contatos where nome like 'Velho %'`,
        [antigo!.id, new Date(AGORA.getTime() - 3_600_000)],
      );
      await rodar();
      expect(await statusDo(id)).toMatchObject({ status: "pausado", motivo_pausa: expect.stringContaining("limite da Meta de 250 pessoas") });
      expect(whatsapp.envios).toEqual([]);
    });

    it("pausar, retomar e cancelar; tentar de novo só as falhas que podem dar certo", async () => {
      expect(await pausarDisparo(banco.db, { organizacaoId, disparoId: id, motivo: "Pausado por Arthur.", ator: admin, agora: AGORA })).toEqual({ ok: true });
      await rodar();
      expect(whatsapp.envios).toEqual([]);
      expect(await retomarDisparo(banco.db, { organizacaoId, disparoId: id, operadorId: admin, agora: AGORA })).toEqual({ ok: true });
      whatsapp.erroNoEnvio.set("+5511999990001", erroDaMeta("131026"));
      whatsapp.erroNoEnvio.set("+5511999990002", erroDaMeta("131049"));
      await rodar();
      expect(await statusDo(id)).toMatchObject({ status: "concluido" });

      whatsapp.erroNoEnvio.clear();
      expect(await tentarDeNovoAsFalhas(banco.db, { organizacaoId, disparoId: id, operadorId: admin, agora: AGORA })).toEqual({ ok: true, voltaram: 1 });
      await rodar();
      expect((await envios(id)).map((e) => e.status)).toEqual(["falhou", "enviado", "enviado"]);
      expect(await cancelarDisparo(banco.db, { organizacaoId, disparoId: id, operadorId: admin, agora: AGORA })).toEqual({ ok: false, erro: "Este disparo já terminou." });
    });

    it("cancelar não deixa sair o que ainda não saiu", async () => {
      expect(await cancelarDisparo(banco.db, { organizacaoId, disparoId: id, operadorId: admin, agora: AGORA })).toEqual({ ok: true, cancelados: 3 });
      await rodar();
      expect(whatsapp.envios).toEqual([]);
    });

    it("desconectar pausa o disparo e apaga as credenciais", async () => {
      expect(await desconectarCanal(banco.db, { organizacaoId, tipo: "whatsapp", operadorId: admin, agora: AGORA })).toEqual({ ok: true, disparosPausados: 1 });
      const [linha] = await banco.db.query<{ credencial: string | null; segredo: string | null }>("select credencial, segredo from public.canais where id = $1::uuid", [canalId]);
      expect(linha).toEqual({ credencial: null, segredo: null });
    });

    it("o disparo de dois dias seguidos para o mesmo contato respeita as 24 h", async () => {
      await rodar();
      const segundo = (await rascunho()) as { id: string };
      relogio = new Date(AGORA.getTime() + 2 * 3_600_000);
      const guardado = (await disparo(segundo.id))!;
      const contatos = await comoAdmin((tx) => contatosDoSegmento(tx, { organizacaoId, filtros: guardado.filtros, canal: "whatsapp" as TipoDeCanal, disparoId: segundo.id }));
      expect(planejarEnvios(guardado, contatos, relogio, 24).map((e) => e.motivo)).toEqual([
        "Recebeu outro disparo pelo WhatsApp há menos de 24 h.",
        "Recebeu outro disparo pelo WhatsApp há menos de 24 h.",
        "Recebeu outro disparo pelo WhatsApp há menos de 24 h.",
      ]);
    });
  });

  describe("webhook", () => {
    let id: string;
    beforeEach(async () => {
      whatsapp.waIdDoDestino.set("+5511999990001", "551199990001"); // o wa_id sem o 9
      ({ id } = (await rascunho()) as { id: string });
      await confirmar(id);
      await rodar();
    });

    it("verifica com o token derivado do canal e recusa sem ele", async () => {
      const url = (token: string) => new URL(`https://x/api?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=123`);
      const certa = await verificarWebhookWhatsapp(url(tokenDeVerificacaoDoWhatsapp(cofre, canalId)), canalId, { db: banco.db, cofre, agora: () => AGORA });
      expect(certa.status).toBe(200);
      expect(await certa.text()).toBe("123");
      expect((await verificarWebhookWhatsapp(url("errado"), canalId, { db: banco.db, cofre, agora: () => AGORA })).status).toBe(403);
      const canal = await comoAdmin((tx) => obterCanal(tx, { organizacaoId, tipo: "whatsapp" }));
      expect(canal!.dados).toMatchObject({ webhookVerificadoEm: AGORA.toISOString() });
    });

    it("sem assinatura válida, recusa; repetido, não processa duas vezes", async () => {
      const corpo = aviso({ statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1781000000" }] });
      expect((await webhook(corpo, "segredo-errado-0000000000000000")).status).toBe(401);
      expect(await (await webhook(corpo)).json()).toEqual({ ok: true });
      expect(await (await webhook(corpo)).json()).toEqual({ ok: true, duplicado: true });
    });

    it("o status só anda para a frente: lida antes de entregue vale, entregue depois não volta", async () => {
      await webhook(aviso({ statuses: [{ id: "wamid.1", status: "read", timestamp: "1781000100" }] }));
      await webhook(aviso({ statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1781000200" }] }));
      const [ana] = await banco.db.query<{ status: string; entregue_em: Date; lido_em: Date }>(
        "select status, entregue_em, lido_em from public.envios_do_disparo where provider_message_id = 'wamid.1'",
      );
      expect(ana).toEqual({ status: "lido", entregue_em: new Date(1781000100 * 1000), lido_em: new Date(1781000100 * 1000) });
    });

    it("falha 131050 no status tira do WhatsApp", async () => {
      await webhook(aviso({ statuses: [{ id: "wamid.2", status: "failed", timestamp: "1781000100", errors: [{ code: 131050, title: "x" }] }] }));
      const [bia] = await banco.db.query<{ status: string; saiu: Date | null }>(
        "select e.status, c.whatsapp_saiu_em as saiu from public.envios_do_disparo e join public.contatos c on c.id = e.contato_id where e.provider_message_id = 'wamid.2'",
      );
      expect(bia).toEqual({ status: "falhou", saiu: AGORA });
    });

    it("'SAIR' guarda a resposta, marca o envio como respondido e tira do WhatsApp, achando o contato pelo wa_id sem o 9", async () => {
      await webhook(
        aviso({
          contacts: [{ profile: { name: "Ana" }, wa_id: "551199990001" }],
          messages: [{ from: "551199990001", id: "wamid.in.1", timestamp: "1781000300", type: "text", text: { body: "SAIR" } }],
        }),
      );
      const resultado = await comoAdmin((tx) => resultadoDoDisparo(tx, id));
      expect(resultado.contagem.responderam).toBe(1);
      expect(resultado.respostas).toEqual([expect.objectContaining({ nome: "Ana Souza", texto: "SAIR" })]);
      const [ana] = await banco.db.query<{ whatsapp_saiu_em: Date | null; whatsapp_motivo: string }>(
        "select whatsapp_saiu_em, whatsapp_motivo from public.contatos where nome = 'Ana Souza'",
      );
      expect(ana).toEqual({ whatsapp_saiu_em: AGORA, whatsapp_motivo: 'Pediu para sair pelo WhatsApp: "SAIR"' });
    });

    it("quem escreve primeiro vira contato, sem autorização de disparo", async () => {
      await webhook(
        aviso({
          contacts: [{ profile: { name: "Gustavo Novo" }, wa_id: "5521988887777" }],
          messages: [{ from: "5521988887777", id: "wamid.in.2", timestamp: "1781000300", type: "text", text: { body: "Oi, vi o anúncio" } }],
        }),
      );
      const [novo] = await banco.db.query<{ nome: string; origem: string; telefone: string; whatsapp_autorizado_em: Date | null }>(
        "select nome, origem, telefone, whatsapp_autorizado_em from public.contatos where telefone = '+5521988887777'",
      );
      expect(novo).toEqual({ nome: "Gustavo Novo", origem: "whatsapp", telefone: "+5521988887777", whatsapp_autorizado_em: null });
    });

    it("parar as promoções pelo próprio WhatsApp (user_preferences) tira do canal", async () => {
      await webhook(aviso({ user_preferences: [{ wa_id: "5511999990003", category: "marketing_messages", value: "stop", timestamp: 1781000400 }] }, "user_preferences"));
      const [caio] = await banco.db.query<{ whatsapp_motivo: string }>("select whatsapp_motivo from public.contatos where nome = 'Caio Dias'");
      expect(caio!.whatsapp_motivo).toBe("Parou as mensagens de marketing pelo próprio WhatsApp.");
    });

    it("aviso de outro número da mesma conta é ignorado", async () => {
      await webhook({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "100200300",
            changes: [
              {
                field: "messages",
                value: { metadata: { phone_number_id: "200999" }, messages: [{ from: "5521911112222", id: "wamid.x", type: "text", text: { body: "oi" } }] },
              },
            ],
          },
        ],
      });
      expect(await banco.db.query("select 1 from public.contatos where telefone = '+5521911112222'")).toEqual([]);
    });
  });
});
