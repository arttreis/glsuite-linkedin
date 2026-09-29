import { dataLocal, instanteLocal } from "@/domain/calendario";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import type { Db } from "@/server/db/tipos";
import { despachar, type ResultadoDoPerfil } from "@/server/despachante/despachante";
import { criarLead, criarPessoa, idDoPerfil, type SlugPerfil } from "./fixtures";
import type { UnipileFalso } from "./unipile-falso";

export const SP = "America/Sao_Paulo";

/** Pessoas com lead no estado pedido e a ação do toque pendente desde `desde`. */
export async function leadsComAcao(
  db: Db,
  p: {
    campanhaId: string;
    quantidade: number;
    perfil?: SlugPerfil;
    estado?: string;
    toque?: "T1" | "T2" | "T3" | "T4";
    desde: Date;
    empresa?: (i: number) => string;
  },
): Promise<string[]> {
  const perfil = p.perfil ?? "arthur";
  const perfilId = await idDoPerfil(db, perfil);
  const toque = p.toque ?? "T1";
  const leads: string[] = [];
  for (let i = 0; i < p.quantidade; i += 1) {
    const empresa = p.empresa?.(i) ?? `Empresa ${p.campanhaId.slice(0, 4)} ${i}`;
    const pessoaId = await criarPessoa(db, { dono: perfil, empresa, empresaChave: empresa.toLowerCase(), nome: `Pessoa ${i} Teste` });
    const leadId = await criarLead(db, { pessoaId, campanhaId: p.campanhaId, estado: p.estado ?? "na_fila" });
    await agendarAcao(db, {
      leadId,
      perfilId,
      tipo: toque === "T1" ? "convite" : "dm",
      toque,
      origem: "template",
      agendadaPara: p.desde,
      chave: chaveDoToque(leadId, toque),
    });
    leads.push(leadId);
  }
  return leads;
}

/**
 * Relógio simulado: um tick a cada 5 min entre 07:00 e 20:00 no fuso e um por
 * hora no resto do dia (para provar que nada sai de madrugada).
 */
export async function simular(
  db: Db,
  unipile: UnipileFalso,
  p: { de: string; ate: string; fuso?: string; aleatorio?: () => number },
): Promise<ResultadoDoPerfil[]> {
  const fuso = p.fuso ?? SP;
  const resultados: ResultadoDoPerfil[] = [];
  let agora = instanteLocal(p.de, "00:00", fuso);
  const fim = instanteLocal(p.ate, "23:59", fuso);
  while (agora <= fim) {
    resultados.push(...(await despachar({ db, unipile, agora, aleatorio: p.aleatorio ?? (() => 0.5) })));
    const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", hour12: false }).format(agora));
    agora = new Date(agora.getTime() + (hora >= 7 && hora < 20 ? 5 : 60) * 60_000);
  }
  return resultados;
}

export type Envio = { tipo: string; toque: string | null; enviada_em: Date; campanha_id: string; pessoa_id: string };

export async function envios(db: Db, perfil: SlugPerfil = "arthur"): Promise<Envio[]> {
  return db.query<Envio>(
    `select a.tipo, a.toque, a.enviada_em, l.campanha_id, l.pessoa_id
       from public.acoes a join public.leads l on l.id = a.lead_id join public.perfis p on p.id = a.perfil_id
      where a.status = 'enviada' and p.slug = $1
      order by a.enviada_em`,
    [perfil],
  );
}

export function porDia(lista: Envio[], fuso = SP): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const envio of lista) {
    const dia = dataLocal(new Date(envio.enviada_em), fuso);
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1);
  }
  return contagem;
}
