"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Violacao } from "@/domain/validador";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { registrarOptout } from "@/server/conversas/optout";
import { responderManualmente } from "@/server/conversas/responder";
import { obterDb } from "@/server/db";
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
