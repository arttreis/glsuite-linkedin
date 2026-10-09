"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Violacao } from "@/domain/validador";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { importarHistorico, responderConversaExterna } from "@/server/conversas/externas";
import { registrarOptout } from "@/server/conversas/optout";
import { responderManualmente } from "@/server/conversas/responder";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterUnipile } from "@/server/dependencias";
import { leadsVisiveis } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";

async function exigirLead(operadorId: string, valor: FormDataEntryValue | null): Promise<string> {
  const leadId = z.uuid().parse(valor);
  const [visivel] = await leadsVisiveis(operadorId, [leadId]);
  if (!visivel) throw new Error("Conversa fora do seu acesso.");
  return visivel;
}

export type EstadoDaResposta =
  | { status: "inicial" }
  | { status: "enviada"; em: number }
  | { status: "erro"; mensagem: string; violacoes?: Violacao[] };

export async function responder(_anterior: EstadoDaResposta, formData: FormData): Promise<EstadoDaResposta> {
  const operador = await exigirOperador();
  const leadId = await exigirLead(operador.id, formData.get("leadId"));
  const texto = z.string().trim().min(1).max(8000).safeParse(formData.get("texto"));
  const chave = z.uuid().safeParse(formData.get("chave"));
  if (!texto.success || !chave.success) return { status: "erro", mensagem: "Escreva a mensagem." };

  const resultado = await responderManualmente(
    { db: obterDb(), unipile: obterUnipile(), agora: new Date() },
    { leadId, texto: texto.data, operadorId: operador.id, chave: chave.data },
  );
  revalidatePath(`/inbox/${leadId}`);
  revalidatePath("/inbox");
  return resultado.ok
    ? { status: "enviada", em: Date.now() }
    : { status: "erro", mensagem: resultado.motivo, violacoes: resultado.violacoes };
}

const entradaDoDesfecho = z.object({
  para: z.enum(["qualificado", "reuniao_marcada", "encerrado_nao"]),
  reuniaoEm: z.string().optional(),
});

export async function marcarConversa(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = await exigirLead(operador.id, formData.get("leadId"));
  const { para, reuniaoEm } = entradaDoDesfecho.parse({
    para: formData.get("para"),
    reuniaoEm: formData.get("reuniaoEm") || undefined,
  });
  if (para === "reuniao_marcada" && !reuniaoEm) redirect(`/inbox/${leadId}?msg=Informe a data da reunião.`);
  const mudou = await marcarDesfecho(obterDb(), {
    leadId,
    para,
    operadorId: operador.id,
    agora: new Date(),
    reuniaoEm: reuniaoEm ? new Date(reuniaoEm) : null,
  });
  revalidatePath(`/inbox/${leadId}`);
  if (!mudou) redirect(`/inbox/${leadId}?msg=Essa mudança de estado não é permitida agora.`);
}

export async function registrarOptoutDaConversa(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = await exigirLead(operador.id, formData.get("leadId"));
  const db = obterDb();
  const [lead] = await db.query<{ provider_id: string; perfil_id: string; pedido: string | null }>(
    `select pe.provider_id, l.perfil_id,
            (select texto from public.mensagens m where m.lead_id = l.id and m.direcao = 'entrada' order by em desc limit 1) as pedido
       from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
      where l.id = $1::uuid`,
    [leadId],
  );
  if (!lead) throw new Error("Lead não encontrado");
  await registrarOptout(db, {
    providerId: lead.provider_id,
    perfilOrigem: lead.perfil_id,
    textoPedido: lead.pedido ?? `registrado por ${operador.nome}`,
    ator: operador.id,
    agora: new Date(),
  });
  revalidatePath(`/inbox/${leadId}`);
}

/** Traz da Unipile as conversas recentes dos perfis conectados que o operador opera (§4.6). */
export async function importarHistoricoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const perfilId = z.uuid().safeParse(formData.get("perfilId"));
  const perfis = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<{ id: string; nome: string }>(
      `select id, nome from public.perfis
        where public.pode_ver_perfil(id) and unipile_account_id is not null and ($1::uuid is null or id = $1::uuid)`,
      [perfilId.success ? perfilId.data : null],
    ),
  );
  if (perfis.length === 0) redirect(`/inbox?msg=${encodeURIComponent("Nenhum perfil com LinkedIn conectado para trazer conversas.")}`);

  const partes: string[] = [];
  for (const perfil of perfis) {
    try {
      const r = await importarHistorico({ db: obterDb(), unipile: obterUnipile(), agora: new Date() }, { perfilId: perfil.id });
      partes.push(r.motivo ? `${perfil.nome}: ${r.motivo}` : `${perfil.nome}: ${r.conversas} conversas, ${r.mensagens} mensagens novas`);
    } catch (erro) {
      partes.push(`${perfil.nome}: falhou (${(erro as Error).message})`);
    }
  }
  revalidatePath("/inbox");
  redirect(`/inbox?msg=${encodeURIComponent(partes.join(". "))}`);
}

export async function responderExterna(formData: FormData) {
  const operador = await exigirOperador();
  const conversaId = z.uuid().parse(formData.get("conversaId"));
  const [visivel] = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<{ id: string }>("select id from public.conversas where id = $1::uuid", [conversaId]),
  );
  if (!visivel) throw new Error("Conversa fora do seu acesso.");
  const texto = z.string().trim().min(1).max(8000).safeParse(formData.get("texto"));
  const chave = z.uuid().safeParse(formData.get("chave"));
  function voltar(mensagem: string): never {
    revalidatePath(`/inbox/conversa/${conversaId}`);
    revalidatePath("/inbox");
    redirect(`/inbox/conversa/${conversaId}?msg=${encodeURIComponent(mensagem)}`);
  }
  if (!texto.success || !chave.success) voltar("Escreva a mensagem.");

  const resultado = await responderConversaExterna(
    { db: obterDb(), unipile: obterUnipile(), agora: new Date() },
    { conversaId, texto: texto.data, operadorId: operador.id, chave: chave.data },
  );
  voltar(resultado.ok ? "Enviada pelo LinkedIn." : [resultado.motivo, ...(resultado.violacoes ?? []).map((v) => v.mensagem)].join(" "));
}
