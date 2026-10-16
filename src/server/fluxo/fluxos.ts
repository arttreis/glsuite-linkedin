import { fluxo as esquemaDoFluxo, nodePorId, passoDoNode, sequenciaParaFluxo, type Fluxo, type PassoDeTexto } from "@/domain/fluxo";
import { sequencia, type PassoDaSequencia } from "@/domain/sequencia";
import type { Db } from "@/server/db/tipos";

type Legado = { sequencia: unknown; pos_t4: "conexao" | "pausa_60_novo_angulo" };

/** Campanha de antes do SDR-21: a sequência linear vira o fluxo equivalente. */
function fluxoDoLegado(legado: Legado): Fluxo {
  const passos = sequencia.safeParse(legado.sequencia);
  // Sequência inválida no banco é bug; o fluxo vazio não agenda nada e o
  // validador acusa ao editar.
  const lista: PassoDaSequencia[] = passos.success ? passos.data : [];
  return sequenciaParaFluxo(lista, legado.pos_t4);
}

/**
 * Grafo gravado que não passa no esquema cai na sequência da campanha, mas com
 * aviso: sem ele, o lead seguiria uma régua diferente da que o operador editou.
 */
export function lerGrafo(grafo: unknown, legado: Legado): Fluxo {
  const lido = esquemaDoFluxo.safeParse(grafo);
  if (lido.success) return lido.data;
  console.error("Grafo do fluxo inválido; usando a sequência da campanha", lido.error.message);
  return fluxoDoLegado(legado);
}

/** O fluxo atual da campanha: a versão mais recente, ou a sequência antiga convertida. */
export async function fluxoDaCampanha(db: Db, campanhaId: string): Promise<Fluxo | null> {
  const [linha] = await db.query<Legado & { grafo: unknown }>(
    `select c.sequencia, c.pos_t4, f.grafo
       from public.campanhas c left join public.fluxos f on f.id = c.fluxo_id
      where c.id = $1::uuid`,
    [campanhaId],
  );
  if (!linha) return null;
  return linha.grafo ? lerGrafo(linha.grafo, linha) : fluxoDoLegado(linha);
}

/**
 * O fluxo que vale para o lead: a versão em que ele entrou. Lead de antes do
 * SDR-21 (sem versão) segue a sequência da campanha, como sempre seguiu.
 */
export async function fluxoDoLead(db: Db, leadId: string): Promise<Fluxo | null> {
  const [linha] = await db.query<Legado & { grafo: unknown }>(
    `select c.sequencia, c.pos_t4, f.grafo
       from public.leads l
       join public.campanhas c on c.id = l.campanha_id
       left join public.fluxos f on f.id = l.fluxo_id
      where l.id = $1::uuid`,
    [leadId],
  );
  if (!linha) return null;
  return linha.grafo ? lerGrafo(linha.grafo, linha) : fluxoDoLegado(linha);
}

/**
 * Grava o fluxo da campanha. Se nenhum lead entrou na versão atual, ela é
 * reescrita; senão nasce uma versão nova e os leads andando ficam na deles
 * (§4.1: o fluxo não muda por baixo de quem já está nele).
 */
export async function salvarFluxo(db: Db, p: { campanhaId: string; fluxo: Fluxo; operadorId: string }): Promise<string> {
  const [atual] = await db.query<{ fluxo_id: string | null; em_uso: boolean }>(
    `select c.fluxo_id,
            exists (select 1 from public.leads l where l.fluxo_id = c.fluxo_id) as em_uso
       from public.campanhas c where c.id = $1::uuid
       for update`,
    [p.campanhaId],
  );
  if (!atual) throw new Error("Campanha não encontrada.");
  if (atual.fluxo_id && !atual.em_uso) {
    await db.query("update public.fluxos set grafo = $2::jsonb, criado_por = $3::uuid, criado_em = now() where id = $1::uuid", [
      atual.fluxo_id,
      JSON.stringify(p.fluxo),
      p.operadorId,
    ]);
    return atual.fluxo_id;
  }
  const [nova] = await db.query<{ id: string }>(
    `insert into public.fluxos (campanha_id, versao, grafo, criado_por)
     select $1::uuid, coalesce(max(versao), 0) + 1, $2::jsonb, $3::uuid from public.fluxos where campanha_id = $1::uuid
     returning id`,
    [p.campanhaId, JSON.stringify(p.fluxo), p.operadorId],
  );
  await db.query("update public.campanhas set fluxo_id = $2::uuid where id = $1::uuid", [p.campanhaId, nova!.id]);
  return nova!.id;
}

/** O bloco de texto `toque` no fluxo do lead, no formato do validador. */
export async function passoDoLead(db: Db, leadId: string, toque: string | null): Promise<PassoDeTexto | null> {
  if (!toque) return null;
  const fluxo = await fluxoDoLead(db, leadId);
  return fluxo ? passoDoNode(nodePorId(fluxo, toque)) : null;
}
