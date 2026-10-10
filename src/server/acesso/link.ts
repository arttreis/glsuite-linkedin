import { z } from "zod";
import { emailLiberado, lerDominiosLiberados } from "@/domain/acesso";
import { lerEnv } from "@/lib/env";

const envDoCadastro = lerEnv(z.object({ CADASTRO_DOMINIOS: z.string().default("guessless.com.br") }));

/** Domínios liberados para o primeiro acesso (§4.1). */
export function dominiosLiberados(): string[] {
  return lerDominiosLiberados(envDoCadastro().CADASTRO_DOMINIOS);
}

export type DependenciasDoLink = {
  dominios: readonly string[];
  /** Cria o usuário no Auth se ainda não existe. Null quando o servidor não tem a chave secreta. */
  criarUsuario: ((email: string) => Promise<void>) | null;
  /** Manda o link de acesso a um usuário que já existe. Devolve o código de erro do Supabase, ou null. */
  enviarLink: (email: string) => Promise<string | null>;
};

export type ResultadoDoLink = { ok: true } | { ok: false; mensagem: string };

/**
 * Pedido de link de acesso (§4.1). E-mail de domínio liberado ganha o usuário
 * no Auth antes do link; o cadastro público do Auth continua desligado, porque
 * o Auth é dividido com o GL Suite. Os outros só recebem link se já tiverem
 * usuário, e só entram se forem operadores.
 */
export async function pedirLinkDeAcesso(deps: DependenciasDoLink, email: string): Promise<ResultadoDoLink> {
  const liberado = emailLiberado(email, deps.dominios);
  if (liberado) {
    if (deps.criarUsuario) {
      try {
        await deps.criarUsuario(email);
      } catch (erro) {
        console.error("Usuário do primeiro acesso não criado", (erro as Error).message);
        return { ok: false, mensagem: "Não foi possível preparar o seu acesso agora. Tente de novo em alguns minutos." };
      }
    } else {
      console.warn("SUPABASE_SECRET_KEY ausente: e-mail liberado sem usuário no Auth não recebe link.");
    }
  }

  const erro = await deps.enviarLink(email);
  if (erro === "over_email_send_rate_limit") {
    return {
      ok: false,
      mensagem: "Já mandamos um link há menos de 1 minuto. Confira a caixa de entrada e o spam, ou espere um pouco para pedir outro.",
    };
  }
  if (erro) {
    return {
      ok: false,
      mensagem: liberado
        ? "Não foi possível enviar o link agora. Tente de novo em alguns minutos."
        : "Não foi possível enviar o link. O acesso é só para quem já usa o Kakou ou tem e-mail de um domínio liberado.",
    };
  }
  return { ok: true };
}
