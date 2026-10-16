import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { lerEnv } from "@/lib/env";

/**
 * Segredos dos canais (§5): os tokens do WhatsApp e do Telegram e o app secret
 * do WhatsApp ficam cifrados no banco com AES-256-GCM, com a chave
 * `SEGREDOS_CHAVE` (32 bytes em base64). Trocar a chave invalida o que está
 * guardado: os canais precisam ser conectados de novo.
 */

const envSegredos = lerEnv(
  z.object({
    SEGREDOS_CHAVE: z
      .string()
      .min(1)
      .refine((valor) => Buffer.from(valor, "base64").length === 32, "precisa ter 32 bytes em base64 (openssl rand -base64 32)"),
  }),
);

const VERSAO = "v1";

export type Cofre = {
  cifrar(texto: string): string;
  decifrar(cifrado: string): string;
  /** Segredo derivado, sem guardar: o mesmo propósito e id dão sempre o mesmo valor (hex, 64 caracteres). */
  derivar(proposito: string, id: string): string;
};

/** O cofre com uma chave dada (os testes usam uma chave própria). */
export function criarCofre(chaveBase64: string): Cofre {
  const chave = Buffer.from(chaveBase64, "base64");
  if (chave.length !== 32) throw new Error("A chave dos segredos precisa ter 32 bytes.");
  return {
    cifrar(texto) {
      const iv = randomBytes(12);
      const cifra = createCipheriv("aes-256-gcm", chave, iv);
      const corpo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
      return [VERSAO, iv.toString("base64"), cifra.getAuthTag().toString("base64"), corpo.toString("base64")].join(":");
    },
    decifrar(cifrado) {
      const [versao, iv, etiqueta, corpo] = cifrado.split(":");
      if (versao !== VERSAO || !iv || !etiqueta || corpo === undefined) throw new Error("Segredo em formato desconhecido.");
      const decifra = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64"));
      decifra.setAuthTag(Buffer.from(etiqueta, "base64"));
      return Buffer.concat([decifra.update(Buffer.from(corpo, "base64")), decifra.final()]).toString("utf8");
    },
    derivar(proposito, id) {
      return createHmac("sha256", chave).update(`${proposito}:${id}`).digest("hex");
    },
  };
}

let cofre: Cofre | undefined;

/** O cofre do ambiente. Sem `SEGREDOS_CHAVE`, lança dizendo o que falta. */
export function obterCofre(): Cofre {
  cofre ??= criarCofre(envSegredos().SEGREDOS_CHAVE);
  return cofre;
}
