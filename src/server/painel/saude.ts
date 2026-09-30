import { dataLocal } from "@/domain/calendario";
import { avaliarAceite, type Taxa } from "@/domain/guardas";
import { limitesDaSemana, semanaDesdeAtivacao, type LimitesDoDia } from "@/domain/rampa";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { contarEnvios, feriadosDaPraca, type PerfilDoDespachante } from "@/server/despachante/perfis";
import { convitesDesdeAtivacao } from "@/server/guardas/guardas";

export type SaudeDoPerfil = {
  id: string;
  nome: string;
  praca: string;
  status: "ativo" | "pausado";
  motivoPausa: string | null;
  unipileStatus: string | null;
  conectado: boolean;
  primeiraAtivacao: boolean;
  acessivel: boolean;
  detalhes: null | {
    semana: number | null;
    limites: LimitesDoDia | null;
    teto: number;
    convitesHoje: number;
    dmsHoje: number;
    convites7Dias: number;
    aceite: Taxa;
    errosLimite24h: number;
    pendentes: number;
    emRevisao: number;
    proximaAcaoApos: Date | null;
    ultimoEnvio: Date | null;
  };
};

type LinhaDoPerfil = PerfilDoDespachante & { status: "ativo" | "pausado"; motivo_pausa: string | null; acessivel: boolean };

/**
 * Painel de saúde por perfil (§9 SDR-08): aceite em 3 dias úteis, erros de
 * limite, saldo do dia e fila. Roda dentro de `comOperador`: detalhe só de
 * perfil que o operador opera; o status aparece para todos (qualquer um pode
 * pausar).
 */
export async function saudeDosPerfis(db: Db, agora: Date): Promise<SaudeDoPerfil[]> {
  const perfis = await db.query<LinhaDoPerfil>(`
    select id, slug, nome, praca, fuso, janela, rampa, teto_convites_semana, ativado_em, proxima_acao_apos,
           unipile_account_id, unipile_status, unipile_status_em, status, motivo_pausa,
           public.pode_ver_perfil(id) as acessivel
      from public.perfis
     order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug)`);
  const guardas = await lerConfiguracao(db, "guardas");

  const saude: SaudeDoPerfil[] = [];
  for (const perfil of perfis) {
    const base = {
      id: perfil.id,
      nome: perfil.nome,
      praca: perfil.praca,
      status: perfil.status,
      motivoPausa: perfil.motivo_pausa,
      unipileStatus: perfil.unipile_status,
      conectado: Boolean(perfil.unipile_account_id),
      primeiraAtivacao: perfil.ativado_em === null,
      acessivel: perfil.acessivel,
    };
    if (!perfil.acessivel) {
      saude.push({ ...base, detalhes: null });
      continue;
    }

    const contagem = await contarEnvios(db, perfil, agora);
    const semana = perfil.ativado_em
      ? semanaDesdeAtivacao(dataLocal(new Date(perfil.ativado_em), perfil.fuso), dataLocal(agora, perfil.fuso))
      : null;
    const aceite = avaliarAceite(await convitesDesdeAtivacao(db, perfil.id, agora), guardas, {
      agora,
      fuso: perfil.fuso,
      feriados: await feriadosDaPraca(db, perfil.praca),
    }).taxa;
    const [numeros] = await db.query<{ erros: number; pendentes: number; em_revisao: number; ultimo_envio: Date | null }>(
      `select
         (select count(*)::int from public.eventos
           where perfil_id = $1::uuid and tipo = 'erro_limite' and em > $2::timestamptz - interval '24 hours') as erros,
         (select count(*)::int from public.acoes where perfil_id = $1::uuid and status = 'pendente') as pendentes,
         (select count(*)::int from public.acoes where perfil_id = $1::uuid and status = 'aguardando_aprovacao') as em_revisao,
         (select max(enviada_em) from public.acoes where perfil_id = $1::uuid and status = 'enviada') as ultimo_envio`,
      [perfil.id, agora],
    );

    saude.push({
      ...base,
      detalhes: {
        semana,
        limites: semana ? limitesDaSemana(perfil.rampa, semana) : null,
        teto: perfil.teto_convites_semana,
        convitesHoje: contagem.convitesHoje,
        dmsHoje: contagem.dmsHoje,
        convites7Dias: contagem.convitesUltimos7Dias,
        aceite,
        errosLimite24h: numeros!.erros,
        pendentes: numeros!.pendentes,
        emRevisao: numeros!.em_revisao,
        proximaAcaoApos: perfil.proxima_acao_apos,
        ultimoEnvio: numeros!.ultimo_envio,
      },
    });
  }
  return saude;
}
