/** Remove acentos e diacríticos ("Tráfego" → "Trafego"). */
export function semAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const SUFIXOS_SOCIETARIOS = new Set([
  "ltda", "ltd", "sa", "s/a", "eireli", "me", "epp", "mei", "inc", "llc", "llp",
  "corp", "corporation", "co", "company", "sl", "slu", "sas", "gmbh", "plc", "limited",
]);

/**
 * Chave da empresa para o cooldown entre perfis (§4.7). Usa o domínio quando
 * existe; senão o nome sem acento, pontuação e sufixo societário:
 * "Acme Tecnologia Ltda." e "ACME TECNOLOGIA" viram a mesma chave.
 */
export function chaveDaEmpresa(nome: string | null | undefined, dominio?: string | null): string | null {
  const dominioLimpo = dominio
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  if (dominioLimpo && dominioLimpo.includes(".")) return dominioLimpo;
  if (!nome) return null;
  const palavras = semAcentos(nome)
    .toLowerCase()
    .replace(/s\.a\./g, "sa")
    .replace(/[^\p{L}\p{N}/\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  while (palavras.length > 1 && SUFIXOS_SOCIETARIOS.has(palavras[palavras.length - 1]!)) palavras.pop();
  const chave = palavras.join(" ");
  return chave || null;
}

const TITULOS = new Set(["dr", "dra", "sr", "sra", "eng", "prof", "profa", "mr", "mrs", "ms", "don", "dona"]);

/**
 * Primeiro nome para o `{{first_name}}`. Tira título ("Dr."), emoji e o caixa
 * alta ou baixa inteira: "DR. JOÃO 🚀 Silva" → "João".
 */
export function primeiroNome(nomeCompleto: string | null | undefined, primeiro?: string | null): string | null {
  const base = (primeiro?.trim() || nomeCompleto?.trim() || "").replace(/[^\p{L}\p{M}\s'.-]/gu, " ");
  const partes = base.split(/\s+/).filter(Boolean);
  const nome = partes.find((parte) => !TITULOS.has(semAcentos(parte).toLowerCase().replace(/\.$/, "")));
  if (!nome) return null;
  const limpo = nome.replace(/\.$/, "");
  const tudoIgual = limpo === limpo.toUpperCase() || limpo === limpo.toLowerCase();
  return tudoIgual ? limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase() : limpo;
}

/**
 * Nome da empresa para o `{{company}}` e para a IA. Nome todo em caixa alta
 * entra só com a inicial maiúscula ("MAGAZINE LUIZA LTDA" → "Magazine Luiza
 * Ltda"); sigla de até 3 letras fica (IBM, XP, S.A.). Caixa misturada é como a
 * empresa escreve o nome e fica como está ("GuessLess", "iFood").
 */
export function nomeDeEmpresa(nome: string | null | undefined): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  if (limpo !== limpo.toUpperCase() || limpo === limpo.toLowerCase()) return limpo;
  return limpo.replace(/\p{L}+/gu, (palavra) => (palavra.length <= 3 ? palavra : palavra.charAt(0) + palavra.slice(1).toLowerCase()));
}
