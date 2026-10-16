/**
 * Os módulos do Kakou (§4.14). O id não muda; o nome de venda fica aqui e só
 * aqui (D13, `docs/naming.md`): trocar o nome é trocar esta tabela.
 *
 * Sem `server-only`: o menu e as abas são client components e precisam saber
 * o que cada módulo libera.
 */

export const MODULOS = ["linkedin", "whatsapp", "telegram"] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOME_DO_MODULO: Record<Modulo, string> = {
  linkedin: "SDR no LinkedIn",
  whatsapp: "Disparos no WhatsApp",
  telegram: "Disparos no Telegram",
};

export type DescricaoDoModulo = {
  id: Modulo;
  nome: string;
  /** Uma frase: o que o módulo faz por quem contrata. */
  resumo: string;
  /** O que aparece no app com ele. */
  inclui: string[];
};

export const CATALOGO_DE_MODULOS: readonly DescricaoDoModulo[] = [
  {
    id: "linkedin",
    nome: NOME_DO_MODULO.linkedin,
    resumo: "Um SDR que nasce do seu site, prospecta pela sua conta do LinkedIn e conversa com os leads por você.",
    inclui: ["Primeiro acesso guiado", "Chats", "Pipeline", "Campanhas", "SDR com chat de teste"],
  },
  {
    id: "whatsapp",
    nome: NOME_DO_MODULO.whatsapp,
    resumo: "Uma mensagem para um segmento inteiro pelo número de WhatsApp Business da empresa, pela API oficial da Meta.",
    inclui: ["Templates aprovados da Meta", "Disparo agora ou agendado", "Entregues, lidas e respostas"],
  },
  {
    id: "telegram",
    nome: NOME_DO_MODULO.telegram,
    resumo: "Uma mensagem para todo mundo que entrou pelo bot da empresa no Telegram.",
    inclui: ["Bot da empresa", "Links de entrada com tag", "Disparo agora ou agendado"],
  },
];

/** O que toda organização tem, sem contratar (§4.14, D12). */
export const BASE = ["Dashboard", "Contatos, tags e segmentos", "Equipe", "Plano"] as const;

export function ehModulo(valor: unknown): valor is Modulo {
  return typeof valor === "string" && (MODULOS as readonly string[]).includes(valor);
}

/** Os módulos que liberam algo: basta um deles estar contratado. */
export type ExigenciaDeModulo = Modulo | readonly Modulo[];

export function liberado(modulos: readonly Modulo[], exige: ExigenciaDeModulo | undefined): boolean {
  if (exige === undefined) return true;
  const algum = typeof exige === "string" ? [exige] : exige;
  return algum.some((modulo) => modulos.includes(modulo));
}

/**
 * O SDR no LinkedIn ainda espera o primeiro acesso (§4.14): a organização tem
 * o módulo e não terminou os seis passos. As telas do LinkedIn levam para lá.
 */
export function linkedinNoPrimeiroAcesso(modulos: readonly Modulo[], primeiroAcessoConcluido: boolean): boolean {
  return modulos.includes("linkedin") && !primeiroAcessoConcluido;
}

/**
 * O app inteiro fica atrás do primeiro acesso, como antes dos módulos: só
 * quando o SDR no LinkedIn é tudo o que a organização tem. Com outro módulo,
 * ela entra no app e termina o primeiro acesso quando quiser.
 */
export function soOPrimeiroAcesso(modulos: readonly Modulo[], primeiroAcessoConcluido: boolean): boolean {
  return linkedinNoPrimeiroAcesso(modulos, primeiroAcessoConcluido) && modulos.every((modulo) => modulo === "linkedin");
}

/**
 * Quem é da plataforma (`PLATAFORMA_ADMINS`), separados por vírgula, ponto e
 * vírgula ou espaço: e-mails inteiros ou domínios começando com `@`
 * (`@guessless.com.br`). Um `@` sozinho não vale nada e fica de fora.
 */
export function lerAdminsDaPlataforma(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@") && email !== "@");
}

/**
 * O e-mail casa com uma entrada inteira ou com um domínio `@x`: termina
 * exatamente em `@x` e esse é o único `@` dele. Subdomínio e sufixo parecido
 * (`@evilx`, `@x.evil.com`, `@sub.x`) não casam.
 */
export function ehAdminDaPlataforma(email: string | null | undefined, admins: readonly string[]): boolean {
  const alvo = email?.trim().toLowerCase();
  if (!alvo) return false;
  return admins.some(
    (entrada) =>
      alvo === entrada ||
      (entrada.startsWith("@") && alvo.endsWith(entrada) && alvo.indexOf("@") === alvo.length - entrada.length),
  );
}

/** Até 300 caracteres, sem quebra de linha: o motivo vai para a trilha e para a tela. */
export function motivoDaMudanca(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const motivo = valor.replace(/\s+/g, " ").trim().slice(0, 300);
  return motivo || null;
}
