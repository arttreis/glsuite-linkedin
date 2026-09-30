import { Resend } from "resend";
import type { EnviadorDeEmail } from "./alertas";

/**
 * Envio pelo Resend. O SDK não lança exceção: devolve `{ data, error }`, e o erro
 * vira exceção aqui para a fila registrar e retentar. A chave de idempotência
 * evita e-mail duplicado quando a retentativa acontece depois de um envio que
 * deu certo.
 */
export function criarEnviadorResend(config: { apiKey: string; remetente: string }): EnviadorDeEmail {
  const resend = new Resend(config.apiKey);
  return {
    async enviar({ para, assunto, texto, chaveIdempotencia }) {
      const { data, error } = await resend.emails.send(
        { from: config.remetente, to: para, subject: assunto, text: texto },
        { idempotencyKey: chaveIdempotencia },
      );
      if (error || !data) throw new Error(`Resend: ${error?.message ?? "sem resposta"}`);
      return { id: data.id };
    },
  };
}
