import { lerConfiguracao, type Configuracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { ErroRd, type CampoPersonalizado, type ClienteRd } from "./cliente";

export type EtapaRd = "01" | "02" | "03" | "04" | "05";

/**
 * Registra que o lead chegou a uma etapa do funil (§4.9). Vai na transação do
 * fato. Só a praça Doméstico entra: o Canadá e a Espanha ficam só no sistema.
 * Evento único por lead e etapa.
 */
export async function enfileirarEventoRd(
  db: Db,
  p: { leadId: string; etapa: EtapaRd; dados?: Record<string, unknown> },
): Promise<void> {
  await db.query(
    `insert into public.rd_eventos (lead_id, etapa, dados)
     select l.id, $2, $3::jsonb
       from public.leads l join public.perfis pf on pf.id = l.perfil_id
      where l.id = $1::uuid and pf.praca = 'domestico'
     on conflict (lead_id, etapa) do nothing`,
    [p.leadId, p.etapa, JSON.stringify(p.dados ?? {})],
  );
}

type EventoComLead = {
  id: string;
  lead_id: string;
  etapa: EtapaRd;
  dados: { proximo_passo?: string; proximo_passo_em?: string; reuniao_em?: string };
  tentativas: number;
  praca: string;
  perfil_slug: string;
  perfil_nome: string;
  rd_deal_id: string | null;
  angulo: string | null;
  nicho: string | null;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  dono_email: string | null;
  dono_conversa: string | null;
  dono_conversa_email: string | null;
};

type ConfigRd = Configuracao<"rd_station">;

const ORDEM: EtapaRd[] = ["01", "02", "03", "04", "05"];

function camposDefinidos(config: ConfigRd, pares: [keyof ConfigRd["campos"], string | null | undefined][]): CampoPersonalizado[] {
  return pares
    .filter(([campo, valor]) => config.campos[campo] && valor)
    .map(([campo, valor]) => ({ id: config.campos[campo]!, valor: valor! }));
}

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

async function garantirNegociacao(db: Db, rd: ClienteRd, config: ConfigRd, e: EventoComLead): Promise<string> {
  if (e.rd_deal_id) return e.rd_deal_id;
  if (!e.empresa) throw new Error("Lead sem empresa: o nome da negociação é a empresa (§4.9).");
  if (!config.etapas["01"]) throw new Error("Configure o id da etapa 01 · Alvo em rd_station.etapas.");

  const usuarioId = config.usuarios[e.perfil_slug] ?? (e.dono_email ? config.usuarios[e.dono_email] : undefined) ?? null;
  // Negociação é da empresa: outro decisor da mesma empresa entra na mesma.
  const existente = await rd.buscarNegociacao({ nome: e.empresa, pipelineId: config.pipeline_id });
  let dealId: string;
  if (existente) {
    dealId = existente.id;
    await rd.criarAnotacao({
      negociacaoId: dealId,
      usuarioId,
      texto: `Novo decisor pelo LinkedIn: ${e.nome}${e.cargo ? ` (${e.cargo})` : ""}, perfil ${e.perfil_nome}.`,
    });
  } else {
    const organizacaoId = (await rd.buscarOrganizacao(e.empresa)) ?? (await rd.criarOrganizacao({ nome: e.empresa, usuarioId }));
    dealId = await rd.criarNegociacao({
      nome: e.empresa,
      etapaId: config.etapas["01"],
      usuarioId,
      organizacaoId,
      contato: { nome: e.nome, cargo: e.cargo },
      campos: camposDefinidos(config, [
        ["nicho", e.nicho],
        ["fonte", config.valores.fonte],
        ["praca", config.valores.praca],
        ["originador", e.perfil_nome],
      ]),
      fonteId: config.deal_source_id,
    });
  }
  await db.query("update public.leads set rd_deal_id = $2 where id = $1::uuid", [e.lead_id, dealId]);
  return dealId;
}

async function processarEvento(db: Db, rd: ClienteRd, config: ConfigRd, e: EventoComLead): Promise<void> {
  const dealId = await garantirNegociacao(db, rd, config, e);
  const alvo = config.etapas[e.etapa];
  const extras = camposDefinidos(config, [
    ["angulo", e.etapa === "02" ? e.angulo : null],
    ["dono_conversa", e.etapa === "03" ? (e.dono_conversa ?? e.perfil_nome) : null],
    ["data_reuniao", e.etapa === "05" && e.dados.reuniao_em ? dataBr(e.dados.reuniao_em) : null],
  ]);

  if (alvo && e.etapa !== "01") {
    // Nunca volta etapa: a negociação pode estar mais à frente por outro decisor.
    const atual = (await rd.obterNegociacao(dealId)).etapaId;
    const ordemAtual = ORDEM.findIndex((etapa) => config.etapas[etapa] === atual);
    if (ordemAtual < ORDEM.indexOf(e.etapa)) {
      await rd.atualizarNegociacao(dealId, { etapaId: alvo, campos: extras });
    } else if (extras.length > 0) {
      await rd.atualizarNegociacao(dealId, { campos: extras });
    }
  }

  if (e.dados.proximo_passo && e.dados.proximo_passo_em) {
    const responsavel = config.usuarios[e.perfil_slug] ?? (e.dono_conversa_email ? config.usuarios[e.dono_conversa_email] : undefined);
    await rd.criarTarefa({
      negociacaoId: dealId,
      assunto: e.dados.proximo_passo,
      data: e.dados.proximo_passo_em,
      usuarioIds: responsavel ? [responsavel] : undefined,
    });
  }
}

/**
 * Sincroniza a fila com o RD (roda no tick). Idempotente: o lead guarda o
 * `rd_deal_id`, cada evento sai uma vez e erro é retentado (até 10 vezes).
 * Com o RD desligado na configuração, a fila só acumula.
 */
export async function processarEventosRd(
  deps: { db: Db; rd: ClienteRd; agora: Date },
  limite = 20,
): Promise<{ feitos: number; erros: number; ignorados: number; desligado?: true }> {
  const config = await lerConfiguracao(deps.db, "rd_station");
  if (!config.ativo) return { feitos: 0, erros: 0, ignorados: 0, desligado: true };

  const eventos = await deps.db.query<EventoComLead>(
    `select e.id, e.lead_id, e.etapa, e.dados, e.tentativas, pf.praca, pf.slug as perfil_slug, pf.nome as perfil_nome,
            l.rd_deal_id, l.angulo, c.nicho, pe.nome, pe.cargo, pe.empresa,
            dono.email as dono_email, conversa.nome as dono_conversa, conversa.email as dono_conversa_email
       from public.rd_eventos e
       join public.leads l on l.id = e.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.campanhas c on c.id = l.campanha_id
       join public.perfis pf on pf.id = l.perfil_id
       left join public.operadores dono on dono.id = pf.operador_id
       left join public.operadores conversa on conversa.id = l.dono_conversa_id
      where e.status in ('pendente', 'erro') and e.tentativas < 10
      order by e.lead_id, e.etapa
      limit $1`,
    [limite],
  );

  const resultado = { feitos: 0, erros: 0, ignorados: 0 };
  const leadsComErro = new Set<string>();
  for (const evento of eventos) {
    // Mantém a ordem por lead: se o 01 falhou, o 02 espera.
    if (leadsComErro.has(evento.lead_id)) continue;
    if (evento.praca !== "domestico") {
      await deps.db.query("update public.rd_eventos set status = 'ignorado', processado_em = $2 where id = $1::uuid", [evento.id, deps.agora]);
      resultado.ignorados += 1;
      continue;
    }
    try {
      const [atual] = await deps.db.query<{ rd_deal_id: string | null }>("select rd_deal_id from public.leads where id = $1::uuid", [evento.lead_id]);
      await processarEvento(deps.db, deps.rd, config, { ...evento, rd_deal_id: atual?.rd_deal_id ?? null });
      await deps.db.query(
        "update public.rd_eventos set status = 'feito', processado_em = $2, erro = null, tentativas = tentativas + 1 where id = $1::uuid",
        [evento.id, deps.agora],
      );
      resultado.feitos += 1;
    } catch (erro) {
      leadsComErro.add(evento.lead_id);
      const mensagem = erro instanceof ErroRd || erro instanceof Error ? erro.message : String(erro);
      await deps.db.query("update public.rd_eventos set status = 'erro', erro = $2, tentativas = tentativas + 1 where id = $1::uuid", [
        evento.id,
        mensagem,
      ]);
      if (evento.tentativas + 1 >= 10) {
        await registrarEvento(deps.db, {
          tipo: "rd_desistiu",
          entidade: "lead",
          entidadeId: evento.lead_id,
          payload: { etapa: evento.etapa, erro: mensagem },
          em: deps.agora,
        });
      }
      resultado.erros += 1;
    }
  }
  return resultado;
}
