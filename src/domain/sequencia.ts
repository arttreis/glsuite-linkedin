import { z } from "zod";
import type { Praca } from "./validador";

/** Teto de caracteres por toque (§4.2), default da campanha. */
export const TETOS_PADRAO: Readonly<Record<string, number>> = { T1: 250, T2: 350, T3: 250, T4: 180 };

export const passoDaSequencia = z.object({
  toque: z.enum(["T1", "T2", "T3", "T4"]),
  tipo: z.enum(["convite", "dm"]),
  offset_dias_uteis: z.number().int().min(0).max(30),
  ancora: z.enum(["inicio", "aceite", "anterior"]),
  template: z.string().max(2000),
  max_caracteres: z.number().int().positive().max(2000).optional(),
});

export type PassoDaSequencia = z.infer<typeof passoDaSequencia>;

const ORDEM = ["T1", "T2", "T3", "T4"] as const;

/**
 * A sequência é configuração da campanha (§4.1): T1 é o convite (âncora no
 * início), T2 conta do aceite, T3 e T4 contam do toque anterior. Pode ter menos
 * de 4 toques, sempre em ordem.
 */
export const sequencia = z
  .array(passoDaSequencia)
  .min(1)
  .max(4)
  .superRefine((passos, ctx) => {
    passos.forEach((passo, indice) => {
      const esperado = ORDEM[indice]!;
      if (passo.toque !== esperado) {
        ctx.addIssue({ code: "custom", message: `O ${indice + 1}º toque deve ser o ${esperado}.`, path: [indice, "toque"] });
      }
      const tipo = indice === 0 ? "convite" : "dm";
      if (passo.tipo !== tipo) {
        ctx.addIssue({ code: "custom", message: `O ${esperado} é ${tipo === "convite" ? "o convite" : "uma DM"}.`, path: [indice, "tipo"] });
      }
      const ancora = indice === 0 ? "inicio" : indice === 1 ? "aceite" : "anterior";
      if (passo.ancora !== ancora) {
        ctx.addIssue({ code: "custom", message: `O ${esperado} conta a partir de "${ancora}".`, path: [indice, "ancora"] });
      }
      if (passo.tipo === "dm" && passo.template.trim() === "") {
        ctx.addIssue({ code: "custom", message: `O ${esperado} precisa de texto.`, path: [indice, "template"] });
      }
    });
  });

export type Sequencia = z.infer<typeof sequencia>;

/** Default da §4.1: T1 no dia 0, T2 +2 dias úteis do aceite, T3 +4 e T4 +5 do toque anterior. */
export function sequenciaPadrao(): Sequencia {
  return [
    { toque: "T1", tipo: "convite", offset_dias_uteis: 0, ancora: "inicio", template: "", max_caracteres: TETOS_PADRAO.T1 },
    { toque: "T2", tipo: "dm", offset_dias_uteis: 2, ancora: "aceite", template: "", max_caracteres: TETOS_PADRAO.T2 },
    { toque: "T3", tipo: "dm", offset_dias_uteis: 4, ancora: "anterior", template: "", max_caracteres: TETOS_PADRAO.T3 },
    { toque: "T4", tipo: "dm", offset_dias_uteis: 5, ancora: "anterior", template: "", max_caracteres: TETOS_PADRAO.T4 },
  ];
}

/**
 * Teto de caracteres de um texto que sai: o configurado no passo, o do toque
 * padrão (T1 a T4) ou, para blocos do fluxo com outro id, o padrão do tipo.
 */
export function tetoDoPasso(passo: { toque: string; tipo: "convite" | "dm"; max_caracteres?: number }): number {
  return passo.max_caracteres ?? TETOS_PADRAO[passo.toque] ?? (passo.tipo === "convite" ? 250 : 350);
}

export function passoDoToque(passos: Sequencia, toque: string): PassoDaSequencia | undefined {
  return passos.find((passo) => passo.toque === toque);
}

export function proximoToque(passos: Sequencia, toque: string): PassoDaSequencia | undefined {
  return passos[passos.findIndex((passo) => passo.toque === toque) + 1];
}

/** Sem resposta até o T4 (§4.5): Brasil fica como conexão; Canadá e Espanha pausam 60 dias. */
export function posT4DaPraca(praca: Praca): "conexao" | "pausa_60_novo_angulo" {
  return praca === "domestico" ? "conexao" : "pausa_60_novo_angulo";
}
