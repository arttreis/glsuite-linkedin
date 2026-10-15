import type { Janela } from "@/domain/calendario";
import { HORAS_ATE_O_LEMBRETE } from "@/domain/passagem";
import { prazosDaPassagem } from "@/domain/sla";
import type { Praca } from "@/domain/validador";
import { urlPublicaDoApp } from "@/lib/env";
import { enfileirarAlerta } from "@/server/alertas/alertas";
import type { Db } from "@/server/db/tipos";
import { carregarFeriados } from "@/server/despachante/perfis";

/**
 * SQL: a passagem gravada no rascunho `r` (do lead `l`) ainda espera você
 * (SDR-66). Fecha quando você responde (pelo Chats ou direto no LinkedIn),
 * devolve ao SDR, o lead sai de `escalado_humano` ou o SDR passa de novo.
 */
export const passagemAberta = (r: string, l: string) => `${r}.passada_em is not null and ${l}.estado = 'escalado_humano'
  and not exists (select 1 from public.rascunhos depois
                   where depois.lead_id = ${r}.lead_id and depois.passada_em > ${r}.passada_em)
  and not exists (select 1 from public.mensagens resposta
                   where resposta.lead_id = ${r}.lead_id and resposta.direcao = 'saida' and resposta.autor = 'humano'
                     and resposta.em > ${r}.passada_em)
  and not exists (select 1 from public.eventos devolvida
                   where devolvida.entidade = 'lead' and devolvida.entidade_id = ${r}.lead_id::text
                     and devolvida.tipo = 'lead_transicao' and devolvida.payload ->> 'de' = 'escalado_humano'
                     and devolvida.em > ${r}.passada_em)`;

type Pendente = {
  id: string;
  lead_id: string;
  perfil_id: string;
  passada_em: Date;
  motivo: string | null;
  resumo: string | null;
  sugestao: string | null;
  lembrete_em: Date | null;
  admin_avisado_em: Date | null;
  nome: string;
  empresa: string | null;
  conta: string;
  fuso: string;
  janela: Janela;
  praca: Praca;
};

function corpo(p: Pendente, abertura: string): string {
  return [
    abertura,
    ``,
    `Motivo: ${p.motivo ?? "não registrado"}`,
    ...(p.resumo ? [``, `Resumo:`, p.resumo] : []),
    ...(p.sugestao ? [``, `Resposta sugerida pelo SDR:`, p.sugestao] : []),
    ``,
    `Responda pelo Chats: ${urlPublicaDoApp()}/chats/${p.lead_id}`,
  ].join("\n");
}

/**
 * Cobra as passagens sem resposta (SDR-66), no tick: em 4 horas úteis, um
 * lembrete para quem opera a conta; em 1 dia útil, um aviso para os admins da
 * organização. Cada um sai uma vez por passagem (a coluna e a chave do alerta
 * garantem). Respondeu ou devolveu ao SDR, a passagem fecha e nada mais sai.
 */
export async function cobrarPassagens(db: Db, agora: Date): Promise<{ lembretes: number; admins: number }> {
  const pendentes = await db.query<Pendente>(
    `select r.id, r.lead_id, r.perfil_id, r.passada_em, r.excecao as motivo, r.resumo, r.sugestao,
            r.lembrete_em, r.admin_avisado_em, pe.nome, pe.empresa, pf.nome as conta, pf.fuso, pf.janela, pf.praca
       from public.rascunhos r
       join public.leads l on l.id = r.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = r.perfil_id
      where (r.lembrete_em is null or r.admin_avisado_em is null)
        and ${passagemAberta("r", "l")}
      order by r.passada_em
      limit 100`,
  );
  if (pendentes.length === 0) return { lembretes: 0, admins: 0 };

  const feriados = await carregarFeriados(db);
  let lembretes = 0;
  let admins = 0;
  for (const p of pendentes) {
    const prazos = prazosDaPassagem({
      passadaEm: new Date(p.passada_em),
      fuso: p.fuso,
      janela: p.janela,
      feriados: feriados.get(p.praca) ?? new Set(),
    });
    const quem = p.empresa ? `${p.nome} (${p.empresa})` : p.nome;

    if (!p.lembrete_em && agora.getTime() >= prazos.lembrete.getTime()) {
      await db.transacao(async (tx) => {
        await enfileirarAlerta(tx, {
          chave: `passagem-lembrete/${p.id}`,
          tipo: "sla",
          perfilId: p.perfil_id,
          incluirAdmin: false,
          assunto: `[Kakou] Lembrete: ${quem} espera a sua resposta (${p.conta})`,
          texto: corpo(p, `O SDR passou a conversa com ${quem} para você há mais de ${HORAS_ATE_O_LEMBRETE} horas úteis, e ela ainda está sem resposta.`),
        });
        await tx.query("update public.rascunhos set lembrete_em = $2 where id = $1::uuid", [p.id, agora]);
      });
      lembretes += 1;
    }

    if (!p.admin_avisado_em && agora.getTime() >= prazos.admin.getTime()) {
      await db.transacao(async (tx) => {
        await enfileirarAlerta(tx, {
          chave: `passagem-admin/${p.id}`,
          tipo: "sla",
          perfilId: p.perfil_id,
          incluirAdmin: false,
          destino: "admins_da_organizacao",
          assunto: `[Kakou] ${quem} está há 1 dia útil sem resposta (${p.conta})`,
          texto: corpo(
            p,
            `O SDR passou a conversa com ${quem}, na conta de ${p.conta}, e ninguém respondeu em 1 dia útil. Você recebe este aviso por ser admin da organização.`,
          ),
        });
        await tx.query("update public.rascunhos set admin_avisado_em = $2 where id = $1::uuid", [p.id, agora]);
      });
      admins += 1;
    }
  }
  return { lembretes, admins };
}

/** Os leads com passagem aberta, para o SLA genérico não repetir o aviso (SDR-66). */
export async function leadsComPassagemAberta(db: Db): Promise<Set<string>> {
  const linhas = await db.query<{ lead_id: string }>(
    `select r.lead_id from public.rascunhos r join public.leads l on l.id = r.lead_id
      where ${passagemAberta("r", "l")}`,
  );
  return new Set(linhas.map((linha) => linha.lead_id));
}
