import { aplicarStatusDaConta } from "@/server/perfis/status-conta";
import { registrarAceite } from "@/server/reacoes/aceite";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import type { Manipuladores } from "./processar";

/** O que cada tipo de webhook da Unipile faz no SDR. */
export const manipuladoresPadrao: Manipuladores = {
  mensagem: async (ctx, dados) => {
    await registrarMensagem(ctx.db, dados, ctx.agora);
  },
  novaRelacao: async (ctx, dados) => {
    await registrarAceite(ctx.db, {
      accountId: dados.accountId,
      providerId: dados.providerId,
      agora: ctx.agora,
      origem: "new_relation",
    });
  },
  statusDaConta: async (ctx, dados) => {
    await aplicarStatusDaConta(ctx.db, { ...dados, origem: "webhook", agora: ctx.agora });
  },
};
