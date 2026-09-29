import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";

/** Quem manda o e-mail. Em produção é o Resend; nos testes, um falso. */
export interface EnviadorDeEmail {
  enviar(email: { para: string[]; assunto: string; texto: string; chaveIdempotencia: string }): Promise<{ id: string }>;
}

export type NovoAlerta = {
  /** Deduplica: o mesmo fato nunca vira dois e-mails. */
  chave: string;
  tipo: "perfil_pausado" | "sla" | "revisao";
  perfilId: string | null;
  assunto: string;
  texto: string;
  /** O Arthur (alerta_admin_email) também recebe. Padrão: sim. */
  incluirAdmin?: boolean;
};

/**
 * Enfileira o alerta para o dono do perfil e para o Arthur (§4.4, decisão D5:
 * e-mail no M1). Vai na transação de quem chama, então a pausa e o alerta nascem
 * juntos. O tick é quem envia.
 */
export async function enfileirarAlerta(db: Db, alerta: NovoAlerta): Promise<void> {
  const destinatarios = new Set<string>();
  if (alerta.perfilId) {
    const [dono] = await db.query<{ email: string | null }>(
      `select coalesce(p.email_alerta, o.email) as email
         from public.perfis p left join public.operadores o on o.id = p.operador_id
        where p.id = $1::uuid`,
      [alerta.perfilId],
    );
    if (dono?.email) destinatarios.add(dono.email);
  }
  if (alerta.incluirAdmin !== false) {
    const admin = await lerConfiguracao(db, "alerta_admin_email");
    if (admin) destinatarios.add(admin);
  }

  await db.query(
    `insert into public.alertas (chave, tipo, perfil_id, destinatarios, assunto, texto, erro)
     values ($1, $2, $3::uuid, $4::text[], $5, $6, $7)
     on conflict (chave) do nothing`,
    [
      alerta.chave,
      alerta.tipo,
      alerta.perfilId,
      [...destinatarios],
      alerta.assunto,
      alerta.texto,
      destinatarios.size === 0 ? "sem destinatário: configure alerta_admin_email e o dono do perfil" : null,
    ],
  );
}

/** Envia o que está na fila. Falha fica registrada e é retentada até 5 vezes. */
export async function enviarAlertasPendentes(db: Db, enviador: EnviadorDeEmail, agora: Date): Promise<number> {
  const pendentes = await db.query<{ id: string; chave: string; destinatarios: string[]; assunto: string; texto: string }>(
    `select id, chave, destinatarios, assunto, texto from public.alertas
      where enviado_em is null and tentativas < 5 and cardinality(destinatarios) > 0
      order by criado_em
      limit 20`,
  );
  let enviados = 0;
  for (const alerta of pendentes) {
    try {
      const { id } = await enviador.enviar({
        para: alerta.destinatarios,
        assunto: alerta.assunto,
        texto: alerta.texto,
        chaveIdempotencia: `sdr-alerta/${alerta.chave}`.slice(0, 256),
      });
      await db.query(
        "update public.alertas set enviado_em = $2, provider_id = $3, erro = null, tentativas = tentativas + 1 where id = $1::uuid",
        [alerta.id, agora, id],
      );
      enviados += 1;
    } catch (erro) {
      await db.query("update public.alertas set erro = $2, tentativas = tentativas + 1 where id = $1::uuid", [
        alerta.id,
        (erro as Error).message,
      ]);
    }
  }
  return enviados;
}
