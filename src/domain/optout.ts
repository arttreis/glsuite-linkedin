import { semAcentos } from "./texto";

/**
 * Detector determinístico de opt-out (§4.6 e §7): pedidos claros para parar,
 * em PT, EN e ES, viram opt-out global antes de qualquer IA. O que não for claro
 * fica com a classificação do agente.
 *
 * "Não tenho interesse" é um não, não um opt-out: encerra a conversa, mas não
 * tira a pessoa da base dos outros perfis.
 */
const PEDIDOS_CLAROS: RegExp[] = [
  // Português
  /\b(pare|para|parem|chega) de (me )?(mandar|enviar|escrever|contatar|chamar|incomodar)/,
  /\bnao (me )?(mande|envie|escreva|chame|contate|procure) mais\b/,
  /\bnao (quero|desejo) (mais )?receber\b/,
  /\bnao (entre|entrem) mais em contato\b/,
  /\b(me )?(tire|remova|retire|exclua|apague) (meu (contato|nome|cadastro|numero)|da (sua )?lista|dessa lista|desta lista)/,
  /\bdescadastr/,
  /\bsem mais mensagens\b/,
  // Inglês
  /\bstop (messaging|contacting|texting|emailing|sending|writing|spamming)( me)?\b/,
  /\b(do not|don't|dont) (contact|message|text|email|write to) me\b/,
  /\bunsubscribe\b/,
  /\bopt(ing)?[ -]?out\b/,
  /\bremove me\b/,
  /\btake me off\b/,
  /\bleave me alone\b/,
  /^\s*stop[.!\s]*$/,
  /^\s*please stop[.!\s]*$/,
  // Espanhol
  /\bdeja(d)? de (enviarme|escribirme|contactarme|mandarme|molestarme)/,
  /\bno me (escribas|escriba|contactes|contacte|envies|envie|mandes|mande)( mas)?\b/,
  /\bno (quiero|deseo) recibir\b/,
  /\b(dame|darme|denme) de baja\b/,
  /\bquita(me|dme)? de (la|tu|su|esta) lista/,
  /\belimina(r)? mis datos\b/,
];

export type DeteccaoDeOptout = { claro: boolean; trecho: string | null };

export function detectarOptout(texto: string): DeteccaoDeOptout {
  const alvo = semAcentos(texto).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  for (const padrao of PEDIDOS_CLAROS) {
    const achado = alvo.match(padrao);
    if (achado) return { claro: true, trecho: achado[0].trim() };
  }
  return { claro: false, trecho: null };
}
