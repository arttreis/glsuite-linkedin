import { beforeEach, describe, expect, it } from "vitest";
import { importarHistorico, listarConversasExternas } from "@/server/conversas/externas";
import { comOperador } from "@/server/db/operador";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import type { MensagemRecebida } from "@/server/unipile/webhooks";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-09T13:00:00Z");

const mensagem = (m: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  accountId: "acc-arthur",
  chatId: "chat-1",
  messageId: `m-${Math.random().toString(36).slice(2, 8)}`,
  texto: "Oi Arthur, tudo bem?",
  em: "2026-10-09T12:00:00Z",
  remetenteProviderId: "ACoAmigo",
  remetenteNome: "Amigo Antigo",
  enviadaPelaConta: false,
  participantes: [],
  ...m,
});

describe("inbox com todas as conversas (SDR-20)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await ativarPerfil(banco.db, "jp", { accountId: "acc-jp" });
    operador = await criarOperador(banco.db, { perfis: ["arthur"] });
  });

  const externas = (id = operador) => comOperador(banco.db, id, (tx) => listarConversasExternas(tx, {}));

  it("mensagem de quem não é lead aparece como conversa externa do perfil", async () => {
    expect(await registrarMensagem(banco.db, mensagem(), AGORA)).toEqual({ tipo: "externa" });
    expect(await externas()).toEqual([
      expect.objectContaining({ perfil: "Arthur", nome: "Amigo Antigo", ultimoTexto: "Oi Arthur, tudo bem?", ultimaDirecao: "entrada", campanha: null }),
    ]);
  });

  it("só quem opera o perfil vê a conversa", async () => {
    await registrarMensagem(banco.db, mensagem(), AGORA);
    const outro = await criarOperador(banco.db, { perfis: ["juliano"] });
    expect(await externas(outro)).toEqual([]);
  });

  it("se a pessoa vira lead e fala de novo, a conversa e o histórico passam para o lead", async () => {
    await registrarMensagem(banco.db, mensagem({ messageId: "antiga" }), AGORA);
    const campanha = await criarCampanha(banco.db);
    const pessoa = await criarPessoa(banco.db, { providerId: "ACoAmigo" });
    const lead = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha, estado: "convite_enviado" });

    expect(await externas()).toEqual([expect.objectContaining({ campanha: expect.any(String) })]);

    await registrarMensagem(banco.db, mensagem({ messageId: "nova", texto: "Vi seu convite" }), AGORA);
    expect(await externas()).toEqual([]);
    const doLead = await banco.db.query<{ provider_message_id: string }>(
      "select provider_message_id from public.mensagens where lead_id = $1::uuid order by em, provider_message_id",
      [lead],
    );
    expect(doLead.map((m) => m.provider_message_id).sort()).toEqual(["antiga", "nova"]);
  });

  it("importa o histórico da Unipile e pula os chats de lead", async () => {
    const campanha = await criarCampanha(banco.db);
    const pessoa = await criarPessoa(banco.db, { providerId: "ACoLead" });
    await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha, estado: "em_sequencia" });

    unipile.conversasDaConta = [
      { id: "chat-a", contraparteProviderId: "ACoA", nome: null, em: "2026-10-08T10:00:00Z" },
      { id: "chat-lead", contraparteProviderId: "ACoLead", nome: null, em: "2026-10-07T10:00:00Z" },
    ];
    unipile.participantesPorChat.set("chat-a", [
      { providerId: "ACoEu", nome: "Arthur", url: null, euMesmo: true },
      { providerId: "ACoA", nome: "Ana Lima", url: "https://www.linkedin.com/in/ana", euMesmo: false },
    ]);
    unipile.mensagensPorChat.set("chat-a", [
      { id: "a-2", texto: "Combinado!", enviadaPelaConta: true, remetenteProviderId: "ACoEu", em: "2026-10-08T10:00:00Z" },
      { id: "a-1", texto: "Vamos marcar?", enviadaPelaConta: false, remetenteProviderId: "ACoA", em: "2026-10-08T09:00:00Z" },
    ]);

    const perfilId = (await banco.db.query<{ id: string }>("select id from public.perfis where slug = 'arthur'"))[0]!.id;
    expect(await importarHistorico({ db: banco.db, unipile, agora: AGORA }, { perfilId })).toEqual({ conversas: 1, mensagens: 2 });
    expect(unipile.chamadasDe("listarMensagens")).toEqual([{ chatId: "chat-a", limite: 20 }]);
    expect(await externas()).toEqual([
      expect.objectContaining({ nome: "Ana Lima", url: "https://www.linkedin.com/in/ana", ultimoTexto: "Combinado!", ultimaDirecao: "saida" }),
    ]);

    // Rodar de novo não duplica.
    expect(await importarHistorico({ db: banco.db, unipile, agora: AGORA }, { perfilId })).toEqual({ conversas: 1, mensagens: 0 });
  });
});
