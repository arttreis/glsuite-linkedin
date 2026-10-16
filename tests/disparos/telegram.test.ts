import { beforeEach, describe, expect, it } from "vitest";
import { conectarTelegram, criarLinkDeEntrada, desconectarTelegram, segredoDoWebhookDoTelegram } from "@/server/canais/telegram";
import { obterCanal } from "@/server/canais/canais";
import { salvarSegmento } from "@/server/contatos/segmentos";
import { criarTag } from "@/server/contatos/tags";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { confirmarDisparo, contatosDoSegmento, obterDisparo, planejarEnvios, resultadoDoDisparo, salvarRascunho } from "@/server/disparos/disparos";
import { enviadorDoTelegram, processarDisparos } from "@/server/disparos/fila";
import { receberWebhookDoTelegram } from "@/server/disparos/webhook-telegram";
import { criarCofre } from "@/server/segredos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";
import { erroDoTelegram, TelegramFalso } from "../support/telegram-falso";

const AGORA = new Date("2026-10-16T15:00:00Z"); // 12h em Brasília
const TOKEN = "7000000001:AAH-token-de-mentira-0123456789abcdef";
const cofre = criarCofre(Buffer.alloc(32, 9).toString("base64"));

describe("disparos no Telegram (SDR-73, §4.20)", () => {
  let banco: BancoDeTeste;
  let organizacaoId: string;
  let admin: string;
  let telegram: TelegramFalso;
  let canalId: string;
  let relogio: Date;
  let proximoUpdate: number;

  const comoAdmin = <T>(fn: (tx: Db) => Promise<T>) => comOperador(banco.db, admin, fn);
  const conectar = (tomarDoOutro = false, token = TOKEN) =>
    conectarTelegram(
      { db: banco.db, telegram, cofre, urlDoApp: "https://sdr.glsuite.io" },
      { organizacaoId, operadorId: admin, organizacaoNome: "GuessLess", token, tomarDoOutro, agora: AGORA },
    );
  const aviso = (update: Record<string, unknown>, segredo = segredoDoWebhookDoTelegram(cofre, canalId)) =>
    receberWebhookDoTelegram(
      new Request(`https://sdr.glsuite.io/api/webhooks/telegram/${canalId}`, {
        method: "POST",
        body: JSON.stringify({ update_id: proximoUpdate++, ...update }),
        headers: { "x-telegram-bot-api-secret-token": segredo, "content-type": "application/json" },
      }),
      canalId,
      { db: banco.db, cofre, telegram, agora: () => relogio },
    );
  const mensagem = (chatId: number, texto: string, nome = "Ana", sobrenome = "Souza") => ({
    message: {
      message_id: proximoUpdate,
      from: { id: chatId, is_bot: false, first_name: nome, last_name: sobrenome, username: `${nome.toLowerCase()}_tg` },
      chat: { id: chatId, type: "private", first_name: nome },
      date: Math.floor(relogio.getTime() / 1000),
      text: texto,
    },
  });
  const contato = async (chatId: number) =>
    (
      await banco.db.query<{ id: string; nome: string; origem: string; telegram_saiu_em: Date | null; telegram_motivo: string | null; telegram_usuario: string }>(
        "select id, nome, origem, telegram_saiu_em, telegram_motivo, telegram_usuario from public.contatos where telegram_id = $1",
        [String(chatId)],
      )
    )[0];

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacaoId = await idDaOrganizacaoGuessless(banco.db);
    admin = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    telegram = new TelegramFalso();
    relogio = AGORA;
    proximoUpdate = 1000;
    const conectado = await conectar();
    expect(conectado).toMatchObject({ ok: true, usuario: "loja_bot" });
    canalId = (conectado as { canalId: string }).canalId;
  });

  describe("conectar", () => {
    it("confere o bot, guarda o token cifrado e liga o webhook com o segredo do canal", async () => {
      expect(telegram.webhooksLigados).toEqual([{ url: `https://sdr.glsuite.io/api/webhooks/telegram/${canalId}`, segredo: segredoDoWebhookDoTelegram(cofre, canalId) }]);
      const [linha] = await banco.db.query<{ credencial: string; nome: string }>("select credencial, nome from public.canais where id = $1::uuid", [canalId]);
      expect(linha!.credencial).not.toContain("AAH");
      expect(cofre.decifrar(linha!.credencial)).toBe(TOKEN);
      expect(linha!.nome).toBe("@loja_bot");
    });

    it("bot com webhook de outro sistema só conecta se a pessoa disser que pode tomar", async () => {
      telegram.webhook = { url: "https://outro-sistema.com/hook", ultimoErro: null, pendentes: 0 };
      expect(await conectar()).toEqual({
        ok: false,
        erro: "Este bot já manda os avisos para outro sistema. Conectar aqui desliga esse outro.",
        outroWebhook: "https://outro-sistema.com/hook",
      });
      expect(await conectar(true)).toMatchObject({ ok: true });
    });

    it("token inválido não conecta; bot de outra organização também não", async () => {
      expect(await conectar(false, "nao-e-token")).toMatchObject({ ok: false, erro: expect.stringContaining("@BotFather") });
      telegram.erroNaConferencia = erroDoTelegram("401", "Unauthorized");
      expect(await conectar()).toMatchObject({ ok: false, erro: expect.stringContaining("não reconheceu este token") });
      telegram.erroNaConferencia = null;
      const outra = await criarOrganizacao(banco.db);
      const deFora = await conectarTelegram(
        { db: banco.db, telegram, cofre, urlDoApp: "https://sdr.glsuite.io" },
        { organizacaoId: outra, operadorId: admin, organizacaoNome: "Outra", token: TOKEN, tomarDoOutro: true, agora: AGORA },
      );
      expect(deFora).toEqual({ ok: false, erro: "Este bot já está conectado em outra organização do Kakou." });
    });

    it("desconectar desliga o webhook e tira o token", async () => {
      expect(await desconectarTelegram({ db: banco.db, telegram, cofre }, { organizacaoId, operadorId: admin, agora: AGORA })).toEqual({ ok: true, disparosPausados: 0 });
      expect(telegram.desligados).toBe(1);
      const canal = await comoAdmin((tx) => obterCanal(tx, { organizacaoId, tipo: "telegram" }));
      expect(canal!.status).toBe("desconectado");
    });
  });

  describe("entrada pelo bot", () => {
    it("segredo errado é recusado; update repetido não processa duas vezes", async () => {
      expect((await aviso(mensagem(1, "/start"), "errado")).status).toBe(401);
      const update = { update_id: 77, ...mensagem(1, "/start") };
      const enviar = () =>
        receberWebhookDoTelegram(
          new Request("https://x", { method: "POST", body: JSON.stringify(update), headers: { "x-telegram-bot-api-secret-token": segredoDoWebhookDoTelegram(cofre, canalId) } }),
          canalId,
          { db: banco.db, cofre, telegram, agora: () => relogio },
        );
      expect(await (await enviar()).json()).toEqual({ ok: true });
      expect(await (await enviar()).json()).toEqual({ ok: true, duplicado: true });
      expect(telegram.mensagens).toHaveLength(1);
    });

    it("/start com o código do link vira contato com a tag e recebe as boas-vindas", async () => {
      const tag = (await comoAdmin((tx) => criarTag(tx, { organizacaoId, nome: "Evento SP", operadorId: admin, agora: AGORA }))) as { id: string };
      const link = (await comoAdmin((tx) => criarLinkDeEntrada(tx, { canalId, nome: "Evento", tagId: tag.id, operadorId: admin, agora: AGORA }))) as { codigo: string };
      await aviso(mensagem(123, `/start ${link.codigo}`));
      const ana = await contato(123);
      expect(ana).toMatchObject({ nome: "Ana Souza", origem: "telegram", telegram_usuario: "ana_tg" });
      const tags = await banco.db.query<{ tag_id: string }>("select tag_id from public.contato_tags where contato_id = $1::uuid", [ana!.id]);
      expect(tags).toEqual([{ tag_id: tag.id }]);
      expect(telegram.mensagens).toEqual([
        { token: TOKEN, chatId: "123", texto: "Pronto, Ana! Você vai receber as novidades da GuessLess por aqui. Para sair, mande /sair." },
      ]);
    });

    it("/sair tira e o bot confirma; /start volta; bloquear tira e desbloquear não volta sozinho", async () => {
      await aviso(mensagem(5, "/start"));
      await aviso(mensagem(5, "/sair"));
      expect(await contato(5)).toMatchObject({ telegram_saiu_em: AGORA, telegram_motivo: 'Pediu para sair pelo Telegram: "/sair"' });
      expect(telegram.mensagens.at(-1)!.texto).toBe("Pronto, você não recebe mais mensagens da GuessLess por aqui. Para voltar, mande /start.");

      await aviso(mensagem(5, "/start"));
      expect(await contato(5)).toMatchObject({ telegram_saiu_em: null, telegram_motivo: null });

      await aviso({ my_chat_member: { chat: { id: 5, type: "private" }, from: { id: 5 }, date: 1781000000, new_chat_member: { status: "kicked" } } });
      expect(await contato(5)).toMatchObject({ telegram_motivo: "Bloqueou o bot." });
      await aviso({ my_chat_member: { chat: { id: 5, type: "private" }, from: { id: 5 }, date: 1781000100, new_chat_member: { status: "member" } } });
      expect((await contato(5))!.telegram_saiu_em).not.toBeNull();
    });

    it("quem pediu para não ser contatado não volta pelo /start e não recebe nada", async () => {
      await aviso(mensagem(9, "/start"));
      await banco.db.query("update public.contatos set nao_contatar_em = $1, telegram_saiu_em = $1 where telegram_id = '9'", [AGORA]);
      telegram.mensagens = [];
      await aviso(mensagem(9, "/start"));
      expect((await contato(9))!.telegram_saiu_em).toEqual(AGORA);
      expect(telegram.mensagens).toEqual([]);
    });
  });

  describe("o disparo", () => {
    let segmentoId: string;
    const rascunho = (texto: string) =>
      comoAdmin((tx) =>
        salvarRascunho(tx, {
          organizacaoId,
          id: null,
          canal: "telegram",
          nome: "Novidades",
          segmentoId,
          conteudo: { tipo: "telegram", texto, botao: { texto: "Ver", url: "https://guessless.com.br" } },
          operadorId: admin,
          agora: AGORA,
        }),
      );
    const confirmar = async (id: string) => {
      const disparo = (await comoAdmin((tx) => obterDisparo(tx, { id, organizacaoId })))!;
      const contatos = await comoAdmin((tx) => contatosDoSegmento(tx, { organizacaoId, filtros: disparo.filtros, canal: "telegram", disparoId: id }));
      const planejados = planejarEnvios(disparo, contatos, AGORA, 24);
      const confirmado = await confirmarDisparo(banco.db, { organizacaoId, disparoId: id, filtros: disparo.filtros, envios: planejados, quando: null, operadorId: admin, agora: AGORA });
      return { planejados, confirmado };
    };
    const rodar = () => processarDisparos({ db: banco.db, cofre, agora: () => relogio, enviadores: { telegram: enviadorDoTelegram(telegram) }, esperar: async () => {} });
    const envios = (id: string) =>
      banco.db.query<{ nome: string; status: string; codigo_erro: string | null; provider_message_id: string | null }>(
        "select nome, status, codigo_erro, provider_message_id from public.envios_do_disparo where disparo_id = $1::uuid order by nome",
        [id],
      );

    beforeEach(async () => {
      await aviso(mensagem(11, "/start", "Ana", "Souza"));
      await aviso(mensagem(22, "/start", "Bia", "Lima"));
      await aviso(mensagem(33, "/start", "Caio", "Dias"));
      await banco.db.query("update public.contatos set empresa = 'Acme' where telegram_id in ('11', '22')");
      telegram.mensagens = [];
      const segmento = await comoAdmin((tx) =>
        salvarSegmento(tx, { organizacaoId, id: null, nome: "No Telegram", filtros: { canal: "telegram" }, operadorId: admin, agora: AGORA }),
      );
      segmentoId = (segmento as { id: string }).id;
    });

    it("troca {{first_name}} e {{company}}, deixa de fora quem não tem o campo e manda com o botão", async () => {
      const { id } = (await rascunho("Oi {{first_name}}, a {{company}} tem novidade.")) as { id: string };
      const { planejados, confirmado } = await confirmar(id);
      expect(planejados.find((e) => e.nome === "Caio Dias")).toMatchObject({ status: "pulado", motivo: "Contato sem empresa para a mensagem." });
      expect(confirmado).toMatchObject({ ok: true, recebem: 2 });
      await rodar();
      expect(telegram.mensagens.map((m) => [m.chatId, m.texto, m.botao])).toEqual(
        expect.arrayContaining([
          ["11", "Oi Ana, a Acme tem novidade.", { texto: "Ver", url: "https://guessless.com.br" }],
          ["22", "Oi Bia, a Acme tem novidade.", { texto: "Ver", url: "https://guessless.com.br" }],
        ]),
      );
      expect((await envios(id)).map((e) => [e.nome, e.status])).toEqual([
        ["Ana Souza", "enviado"],
        ["Bia Lima", "enviado"],
        ["Caio Dias", "pulado"],
      ]);
      expect((await envios(id))[0]!.provider_message_id).toMatch(/^11:\d+$/);
    });

    it("o botão só aceita link da web", async () => {
      for (const url of ["javascript:alert(1)", "file:///etc/passwd", "tg://resolve?domain=x"]) {
        const salvo = await comoAdmin((tx) =>
          salvarRascunho(tx, {
            organizacaoId,
            id: null,
            canal: "telegram",
            nome: "Novidades",
            segmentoId,
            conteudo: { tipo: "telegram", texto: "Oi!", botao: { texto: "Ver", url } },
            operadorId: admin,
            agora: AGORA,
          }),
        );
        expect(salvo).toEqual({ ok: false, erro: "O link do botão precisa ser um endereço da web, começando com https://." });
      }
      expect(await rascunho("Oi!")).toMatchObject({ ok: true });
    });

    it("bot bloqueado é falha definitiva e tira do Telegram; 429 espera o retry_after; token inválido pausa", async () => {
      const { id } = (await rascunho("Oi {{first_name}}!")) as { id: string };
      await confirmar(id);
      telegram.erroNoEnvio.set("11", erroDoTelegram("403", "Forbidden: bot was blocked by the user"));
      telegram.erroNoEnvio.set("22", erroDoTelegram("429", "Too Many Requests: retry after 7", 7));
      await rodar();
      const lista = await envios(id);
      expect(lista[0]).toMatchObject({ status: "falhou", codigo_erro: "telegram_403" });
      expect(lista[1]).toMatchObject({ status: "pendente", codigo_erro: "telegram_429" });
      const [tentar] = await banco.db.query<{ tentar_apos: Date }>("select tentar_apos from public.envios_do_disparo where disparo_id = $1::uuid and status = 'pendente'", [id]);
      expect(tentar!.tentar_apos).toEqual(new Date(AGORA.getTime() + 7000));
      expect((await contato(11))!.telegram_motivo).toBe("A pessoa bloqueou o bot.");

      telegram.erroNoEnvio.set("22", erroDoTelegram("401", "Unauthorized"));
      relogio = new Date(AGORA.getTime() + 10_000);
      await rodar();
      const [disparo] = await banco.db.query<{ status: string; motivo_pausa: string }>("select status, motivo_pausa from public.disparos where id = $1::uuid", [id]);
      expect(disparo).toEqual({ status: "pausado", motivo_pausa: "O token do bot não vale mais. Conecte o bot de novo com o token do @BotFather." });
    });

    it("a mensagem que a pessoa manda depois conta como resposta ao envio", async () => {
      const { id } = (await rascunho("Oi {{first_name}}!")) as { id: string };
      await confirmar(id);
      await rodar();
      relogio = new Date(AGORA.getTime() + 60_000);
      await aviso(mensagem(11, "Quero saber mais"));
      const resultado = await comoAdmin((tx) => resultadoDoDisparo(tx, id));
      expect(resultado.contagem.responderam).toBe(1);
      expect(resultado.respostas).toEqual([expect.objectContaining({ nome: "Ana Souza", texto: "Quero saber mais" })]);
    });
  });
});
