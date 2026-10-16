import { travasDaAtivacao, type Trava } from "@/domain/ativacao";
import { dataLocal } from "@/domain/calendario";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { avaliarAceite, type Taxa } from "@/domain/guardas";
import { limitesDaSemana, semanaDesdeAtivacao, type EtapaDaRampa, type LimitesDoDia } from "@/domain/rampa";
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
  modoResposta: "aprovacao" | "automatico";
  unipileStatus: string | null;
  conectado: boolean;
  /** Conectado e com status em que o despachante envia: o mesmo critério do despausar. */
  contaPronta: boolean;
  primeiraAtivacao: boolean;
  /** O que o operador confirma antes da primeira ativação; vazio depois dela. */
  travas: Trava[];
  acessivel: boolean;
  detalhes: null | {
    semana: number | null;
    rampa: EtapaDaRampa[];
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

type LinhaDoPerfil = PerfilDoDespachante & {
  status: "ativo" | "pausado";
  motivo_pausa: string | null;
  modo_resposta: "aprovacao" | "automatico";
  acessivel: boolean;
};

/**
 * Painel de saúde por perfil (§9 SDR-08): aceite em 3 dias úteis, erros de
 * limite, saldo do dia e fila. Roda dentro de `comOperador`: detalhe só de
 * perfil que o operador opera; o status aparece para todos (qualquer um pode
 * pausar). A conta da casa só busca e fica de fora.
 */
export async function saudeDosPerfis(db: Db, agora: Date): Promise<SaudeDoPerfil[]> {
  const perfis = await db.query<LinhaDoPerfil>(`
    select id, slug, nome, praca, fuso, janela, rampa, teto_convites_semana, ativado_em, proxima_acao_apos,
           unipile_account_id, unipile_status, unipile_status_em, status, motivo_pausa, modo_resposta,
           public.pode_ver_perfil(id) as acessivel
      from public.perfis
     where not casa and arquivado_em is null
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
      modoResposta: perfil.modo_resposta,
      unipileStatus: perfil.unipile_status,
      conectado: Boolean(perfil.unipile_account_id),
      contaPronta:
        Boolean(perfil.unipile_account_id) && (perfil.unipile_status === null || STATUS_SAUDAVEIS.has(perfil.unipile_status)),
      primeiraAtivacao: perfil.ativado_em === null,
      travas:
        perfil.ativado_em === null
          ? travasDaAtivacao({ slug: perfil.slug, nome: perfil.nome, praca: perfil.praca, modoResposta: perfil.modo_resposta })
          : [],
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
        rampa: perfil.rampa,
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
