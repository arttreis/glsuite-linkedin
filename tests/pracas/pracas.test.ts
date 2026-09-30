import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { dataLocal, instanteLocal } from "@/domain/calendario";
import { sequenciaPadrao } from "@/domain/sequencia";
import { salvarCampanha } from "@/server/campanhas/campanhas";
import { responderManualmente } from "@/server/conversas/responder";
import { despachar } from "@/server/despachante/despachante";
import { gerarPlanilhaEspelho } from "@/server/exportacao/planilha";
import { importarPessoas } from "@/server/importacao/importar";
import { registrarAceite } from "@/server/reacoes/aceite";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import { concluirTarefaManual } from "@/server/tarefas/tarefas";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa, idDoPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const MADRI = "Europe/Madrid";
const TORONTO = "America/Toronto";
// Segunda 05/10/2026, 11h em Madri.
const AGORA = instanteLocal("2026-10-05", "11:00", MADRI);

const SEQUENCIA_ES = sequenciaPadrao().map((passo) => ({
  ...passo,
  template:
    passo.toque === "T1"
      ? "Hola {{first_name}}, sigo a {{company}} desde hace tiempo."
      : passo.toque === "T2"
        ? "Gracias por conectar, {{first_name}}. Vi algo interesante en {{company}}."
        : passo.toque === "T3"
          ? "{{first_name}}, ¿cómo mide {{company}} el margen por canal?"
          : "Lo dejo aquí, {{first_name}}. Un saludo.",
}));

describe("regras por praça (SDR-13)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
  });

  describe("Espanha: só convite; do aceite em diante, tarefa manual", () => {
    let leadId: string;

    beforeEach(async () => {
      await ativarPerfil(banco.db, "jp", { ativadoEm: "2026-10-01T09:00:00Z", accountId: "acc-jp" });
      const campanha = await criarCampanha(banco.db, { perfil: "jp", sequencia: SEQUENCIA_ES, posT4: "pausa_60_novo_angulo" });
      const pessoaId = await criarPessoa(banco.db, { dono: "jp", providerId: "ACoEspanha0000001", nome: "Lucía García", empresa: "Tienda Sol" });
      leadId = await criarLead(banco.db, { pessoaId, campanhaId: campanha, estado: "convite_enviado" });
      await registrarAceite(banco.db, { accountId: "acc-jp", providerId: "ACoEspanha0000001", agora: AGORA, origem: "new_relation" });
    });

    const tarefas = () =>
      banco.db.query<{ tipo: string; toque: string; status: string; texto_gerado: string | null; agendada_para: Date }>(
        "select tipo, toque, status, texto_gerado, agendada_para from public.acoes where lead_id = $1::uuid order by criada_em",
        [leadId],
      );

    it("nenhuma DM automática sai do perfil do JP: o T2 vira tarefa com o roteiro de apoio", async () => {
      const [t2] = await tarefas();
      expect(t2).toMatchObject({
        tipo: "tarefa_manual",
        toque: "T2",
        status: "pendente",
        texto_gerado: "Gracias por conectar, Lucía. Vi algo interesante en Tienda Sol.",
      });
      // Segunda + 2 dias úteis = quarta, 9h em Madri.
      expect(new Date(t2!.agendada_para)).toEqual(instanteLocal("2026-10-07", "09:00", MADRI));

      await despachar({ db: banco.db, unipile, agora: instanteLocal("2026-10-07", "10:00", MADRI), aleatorio: () => 0.5 });
      expect(unipile.chamadasDe("iniciarConversa")).toHaveLength(0);
      expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
    });

    it("o JP conclui pelo botão, pelo eco do LinkedIn e pelo painel; a régua segue e termina com pausa de 60 dias", async () => {
      const quarta = instanteLocal("2026-10-07", "10:00", MADRI);
      expect(await concluirTarefaManual(banco.db, { leadId, agora: quarta, ator: operador, como: "botao" })).toBe(true);
      let lista = await tarefas();
      expect(lista.map((t) => [t.toque, t.status])).toEqual([["T2", "enviada"], ["T3", "pendente"]]);
      // Quarta 07/10 + 4 dias úteis (12/10 é feriado em Madri) = quarta 14/10.
      expect(dataLocal(new Date(lista[1]!.agendada_para), MADRI)).toBe("2026-10-14");

      // Eco: o JP escreveu direto no LinkedIn.
      await banco.db.query("update public.leads set chat_id = 'chat-jp' where id = $1::uuid", [leadId]);
      const eco = await registrarMensagem(
        banco.db,
        {
          accountId: "acc-jp",
          chatId: "chat-jp",
          messageId: "eco-jp-1",
          texto: "Lucía, ¿qué tal? Te escribo con una pregunta rápida.",
          em: instanteLocal("2026-10-14", "10:00", MADRI).toISOString(),
          remetenteProviderId: "ACoJP",
          remetenteNome: "JP",
          enviadaPelaConta: true,
          participantes: [{ providerId: "ACoEspanha0000001", nome: "Lucía" }],
        },
        instanteLocal("2026-10-14", "10:00", MADRI),
      );
      expect(eco.tipo).toBe("tarefa_concluida");
      lista = await tarefas();
      expect(lista.map((t) => [t.toque, t.status])).toEqual([["T2", "enviada"], ["T3", "enviada"], ["T4", "pendente"]]);

      // Pelo painel: o texto humano sai pela Unipile e conclui o T4.
      const resposta = await responderManualmente(
        { db: banco.db, unipile, agora: instanteLocal("2026-10-21", "10:00", MADRI) },
        { leadId, texto: "Lo dejo aquí, Lucía. ¡Un saludo!", operadorId: operador, chave: randomUUID() },
      );
      expect(resposta.ok).toBe(true);
      const [lead] = await banco.db.query<{ estado: string; retorno_apos: string }>(
        "select estado, retorno_apos from public.leads where id = $1::uuid",
        [leadId],
      );
      expect(lead).toEqual({ estado: "sem_resposta", retorno_apos: "2026-12-20" });
    });
  });

  describe("Canadá: descadastro em toda DM", () => {
    beforeEach(async () => {
      await ativarPerfil(banco.db, "luiz", { ativadoEm: "2026-10-01T09:00:00Z", accountId: "acc-luiz" });
    });

    it("campanha do Luiz com DM sem descadastro não salva", async () => {
      const resultado = await salvarCampanha(
        banco.db,
        {
          perfilId: await idDoPerfil(banco.db, "luiz"),
          nome: "Canada retail",
          angulo: "Margem invisível",
          nicho: null,
          modoCopy: "template",
          maxLeads: null,
          sequencia: sequenciaPadrao().map((p) => ({ ...p, template: p.tipo === "dm" ? "Hi {{first_name}}, quick thought on {{company}}." : "" })),
        },
        { operadorId: operador, agora: AGORA },
      );
      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.problemas.find((p) => p.toque === "T2")!.violacoes.map((v) => v.regra)).toContain("descadastro");
    });

    it("DM do Luiz sem descadastro é bloqueada no envio e vai para revisão", async () => {
      const campanha = await criarCampanha(banco.db, {
        perfil: "luiz",
        sequencia: [
          { toque: "T1", tipo: "convite", offset_dias_uteis: 0, ancora: "inicio", template: "" },
          { toque: "T2", tipo: "dm", offset_dias_uteis: 2, ancora: "aceite", template: "Hi {{first_name}}, quick thought on {{company}}." },
        ],
      });
      const agora = instanteLocal("2026-10-06", "10:00", TORONTO);
      const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, perfil: "luiz", quantidade: 1, estado: "aceito", toque: "T2", desde: agora });
      await despachar({ db: banco.db, unipile, agora, aleatorio: () => 0.5 });

      expect(unipile.chamadasDe("iniciarConversa")).toHaveLength(0);
      const [acao] = await banco.db.query<{ status: string; motivo_revisao: string }>(
        "select status, motivo_revisao from public.acoes where lead_id = $1::uuid",
        [leadId],
      );
      expect(acao!.status).toBe("aguardando_aprovacao");
      expect(acao!.motivo_revisao).toContain("DM do Canadá precisa trazer a saída");
    });

    it("até a resposta humana do Luiz precisa da saída", async () => {
      const campanha = await criarCampanha(banco.db, { perfil: "luiz" });
      const pessoaId = await criarPessoa(banco.db, { dono: "luiz" });
      const leadId = await criarLead(banco.db, { pessoaId, campanhaId: campanha, estado: "em_conversa" });
      const resposta = await responderManualmente(
        { db: banco.db, unipile, agora: AGORA },
        { leadId, texto: "Sure, happy to chat next week.", operadorId: operador, chave: randomUUID() },
      );
      expect(resposta.ok).toBe(false);
    });
  });

  it("trava T-4: nenhum nome europeu é gravado antes do DPA assinado", async () => {
    const campanha = await criarCampanha(banco.db, { perfil: "jp" });
    const pessoa = {
      providerId: "ACoEuropeu0000001",
      publicIdentifier: null,
      urlPublica: "https://www.linkedin.com/in/europeu",
      nome: "Pablo Ruiz",
      primeiroNome: "Pablo",
      cargo: null,
      empresa: "Tienda",
      empresaDominio: null,
      empresaChave: "tienda",
      localizacao: "Madrid",
      coletadoEm: null,
    };
    await expect(importarPessoas({ db: banco.db }, { campanhaId: campanha, fonte: "csv", pessoas: [pessoa], agora: AGORA })).rejects.toThrow(/Trava T-4/);
    const [contagem] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.pessoas where provider_id = 'ACoEuropeu0000001'");
    expect(contagem!.n).toBe(0);

    await banco.db.query("update public.configuracoes set valor = '{\"dpa_espanha\": true}' where chave = 'travas'");
    const { resumo } = await importarPessoas({ db: banco.db }, { campanhaId: campanha, fonte: "csv", pessoas: [pessoa], agora: AGORA });
    expect(resumo.novos).toBe(1);
  });

  describe("planilha-espelho", () => {
    it("exporta por praça com as colunas do épico, sem quem pediu opt-out", async () => {
      const campanhaCa = await criarCampanha(banco.db, { perfil: "luiz", nome: "Canada; retail" });
      const campanhaBr = await criarCampanha(banco.db, { perfil: "arthur" });
      const ana = await criarPessoa(banco.db, { dono: "luiz", nome: "Anna Smith", empresa: "Maple Goods" });
      await banco.db.query("update public.pessoas set cargo = 'CEO' where id = $1::uuid", [ana]);
      await criarLead(banco.db, { pessoaId: ana, campanhaId: campanhaCa, estado: "convite_enviado" });
      const saiu = await criarPessoa(banco.db, { dono: "luiz", nome: "Opt Out", optoutEm: "2026-09-30T12:00:00Z" });
      await criarLead(banco.db, { pessoaId: saiu, campanhaId: campanhaCa, estado: "optout" });
      await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "arthur", nome: "Brasileira" }), campanhaId: campanhaBr, estado: "na_fila" });

      const csv = await gerarPlanilhaEspelho(banco.db, "canada");
      expect(csv.startsWith("﻿")).toBe(true);
      const [cabecalho, ...linhas] = csv.slice(1).trim().split("\r\n");
      expect(cabecalho).toBe(
        "empresa;pessoa e cargo;campanha;ângulo;praça;originador;URL;fonte;data da coleta;estado;próximo passo",
      );
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatch(/^Maple Goods;Anna Smith \(CEO\);"Canada; retail";Margem invisível;Canadá;Luiz;https:\/\/www\.linkedin\.com\/in\/ACo\w+;csv;20\/09\/2026;convite_enviado;$/);
    });
  });
});
