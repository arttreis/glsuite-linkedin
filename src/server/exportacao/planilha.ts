import type { Praca } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";

const PRACAS: Record<Praca, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

export const COLUNAS_DA_PLANILHA = [
  "empresa",
  "pessoa e cargo",
  "campanha",
  "ângulo",
  "praça",
  "originador",
  "URL",
  "fonte",
  "data da coleta",
  "estado",
  "próximo passo",
] as const;

const PASSOS: Record<string, string> = {
  convite: "convite",
  dm: "DM",
  retirar_convite: "retirar convite",
  tarefa_manual: "tarefa manual",
};

/** Célula de CSV com `;` (Excel em português): aspas quando precisa. */
function celula(valor: string | null | undefined): string {
  const texto = valor ?? "";
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const data = (valor: Date | string | null) =>
  valor ? new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

/**
 * "Planilha-espelho" da praça (§4.5 e §9 SDR-13): o registro do que o sistema
 * fez com cada contato, com URL, fonte e data da coleta (a base do legítimo
 * interesse e do consentimento implícito). Canadá e Espanha não vão para o RD,
 * e esta planilha é o registro delas. Quem pediu opt-out saiu da base e não
 * aparece.
 */
export async function gerarPlanilhaEspelho(db: Db, praca: Praca): Promise<string> {
  const linhas = await db.query<{
    empresa: string | null;
    nome: string;
    cargo: string | null;
    campanha: string;
    angulo: string | null;
    originador: string;
    url_publica: string;
    fonte: string;
    coletado_em: Date;
    estado: string;
    proximo_passo: string | null;
    proximo_passo_em: string | null;
    proxima_acao: string | null;
    proxima_acao_toque: string | null;
    proxima_acao_em: Date | null;
  }>(
    `select pe.empresa, pe.nome, pe.cargo, c.nome as campanha, l.angulo, pf.nome as originador,
            pe.url_publica, pe.fonte, pe.coletado_em, l.estado, l.proximo_passo, l.proximo_passo_em,
            proxima.tipo as proxima_acao, proxima.toque as proxima_acao_toque, proxima.agendada_para as proxima_acao_em
       from public.leads l
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.campanhas c on c.id = l.campanha_id
       join public.perfis pf on pf.id = l.perfil_id
       left join lateral (
         select tipo, toque, agendada_para from public.acoes a
          where a.lead_id = l.id and a.status in ('pendente', 'aguardando_aprovacao')
          order by a.agendada_para limit 1
       ) proxima on true
      where pf.praca = $1 and l.estado not in ('triagem', 'rejeitado', 'optout') and pe.optout_em is null
      order by pe.empresa nulls last, pe.nome`,
    [praca],
  );

  const corpo = linhas.map((l) => {
    const proximo = l.proxima_acao
      ? // Bloco de fluxo montado no editor tem id livre: só os toques padrão vão para a planilha.
        `${[PASSOS[l.proxima_acao] ?? l.proxima_acao, /^T[1-4]$/.test(l.proxima_acao_toque ?? "") ? l.proxima_acao_toque : null].filter(Boolean).join(" ")} em ${data(l.proxima_acao_em)}`
      : l.proximo_passo
        ? `${l.proximo_passo}${l.proximo_passo_em ? ` até ${data(l.proximo_passo_em)}` : ""}`
        : "";
    return [
      l.empresa,
      l.cargo ? `${l.nome} (${l.cargo})` : l.nome,
      l.campanha,
      l.angulo,
      PRACAS[praca],
      l.originador,
      l.url_publica,
      l.fonte,
      data(l.coletado_em),
      l.estado,
      proximo,
    ]
      .map(celula)
      .join(";");
  });
  // BOM para o Excel abrir com acentos certos.
  return `﻿${[COLUNAS_DA_PLANILHA.join(";"), ...corpo].join("\r\n")}\r\n`;
}
