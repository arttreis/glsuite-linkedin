import { z } from "zod";

/**
 * Dossiê da oferta (jornada do Kakou, passo 1): o que a empresa vende, para quem
 * e por que escolhem ela, tirado do site. É a base dos públicos, da sequência e
 * do agente. Só fato do site: o que não está lá fica em lista vazia.
 */
export const dossie = z.object({
  empresa: z.object({ nome: z.string().min(1).max(80), resumo: z.string().min(1).max(600) }),
  produtos: z
    .array(z.object({ nome: z.string().min(1).max(80), descricao: z.string().min(1).max(400), para_quem: z.string().max(300) }))
    .min(1)
    .max(8),
  para_quem: z.string().min(1).max(500),
  diferenciais: z.array(z.string().min(1).max(200)).max(8),
  provas: z
    .array(
      z.object({
        tipo: z.enum(["case", "numero", "cliente", "depoimento", "selo"]),
        texto: z.string().min(1).max(300),
        fonte_url: z.string().nullable(),
      }),
    )
    .max(12),
  dores: z.array(z.string().min(1).max(200)).max(8),
  objecoes: z.array(z.object({ objecao: z.string().min(1).max(200), resposta: z.string().min(1).max(300) })).max(8),
  tom_de_voz: z.string().min(1).max(600),
  idioma: z.enum(["pt", "en", "es"]),
});
export type Dossie = z.infer<typeof dossie>;

const LIMITE_DO_RESUMO = 1500;

/** O dossiê em texto curto, para entrar no prompt do agente e da sequência. */
export function resumoDaOferta(d: Dossie): string {
  const linhas = [
    `${d.empresa.nome}: ${d.empresa.resumo}`,
    `Vende: ${d.produtos.map((p) => `${p.nome} (${p.descricao})`).join("; ")}`,
    `Para quem: ${d.para_quem}`,
    d.diferenciais.length > 0 ? `Por que escolhem: ${d.diferenciais.join("; ")}` : null,
    d.provas.length > 0 ? `Provas: ${d.provas.map((p) => p.texto).join("; ")}` : null,
    d.dores.length > 0 ? `Dores que resolve: ${d.dores.join("; ")}` : null,
  ].filter((linha): linha is string => linha !== null);
  const texto = linhas.join("\n");
  return texto.length <= LIMITE_DO_RESUMO ? texto : `${texto.slice(0, LIMITE_DO_RESUMO - 1)}…`;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Endereço do site digitado pelo usuário. Aceita sem esquema ("empresa.com.br")
 * e recusa o que não é site público: outro esquema, IP, localhost, host sem
 * ponto, usuário e senha na URL.
 */
export function normalizarUrlDoSite(
  entrada: string,
): { ok: true; url: string; dominio: string } | { ok: false; erro: string } {
  const erro = { ok: false as const, erro: "Use um endereço público, como https://suaempresa.com.br." };
  const texto = entrada.trim();
  if (texto.length === 0 || texto.length > 250) return erro;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return erro;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return erro;
  if (url.username || url.password) return erro;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return erro;
  if (IPV4.test(host) || host.startsWith("[")) return erro;
  url.hash = "";
  return { ok: true, url: url.toString(), dominio: host.replace(/^www\./, "") };
}
