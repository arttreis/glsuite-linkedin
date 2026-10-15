"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterAjustadorDeSdr, obterGeradorDeSdr, obterModeloDeLinguagem } from "@/server/dependencias";
import { gerarSdr } from "@/server/sdr/sdr";
import {
  ajustarNoTeste,
  aprovarSdr,
  comecarTeste,
  desfazerAjuste,
  responderComoLead,
  type ResultadoDoTeste,
} from "@/server/sdr/teste";
import { exigirOperador } from "@/server/supabase/servidor";

const MENSAGEM_SEM_CHAVE = "O SDR precisa da chave da Anthropic para conversar. Peça ao admin para configurar.";
const SEM_CHAVE: ResultadoDoTeste = { ok: false, erro: MENSAGEM_SEM_CHAVE };

// O chat roda com a conexão do sistema, sempre na organização do operador: as
// chamadas da IA levam segundos e não devem segurar uma transação aberta.
async function contexto() {
  const operador = await exigirOperador();
  return { operador, base: { organizacaoId: operador.organizacaoId, nome: operador.nome } };
}

/** Começa ou recomeça a conversa, com o mesmo tipo de lead ou outro. */
export async function recomecarConversa(entrada: { segmento?: string | null }): Promise<ResultadoDoTeste> {
  const { base } = await contexto();
  const modelo = obterModeloDeLinguagem();
  if (!modelo) return SEM_CHAVE;
  return comecarTeste({ db: obterDb(), modelo, agora: new Date() }, { ...base, segmento: entrada.segmento ?? null });
}

/** A pessoa responde no papel de lead. */
export async function responderNoTeste(entrada: { texto: string }): Promise<ResultadoDoTeste> {
  const { base } = await contexto();
  const modelo = obterModeloDeLinguagem();
  if (!modelo) return SEM_CHAVE;
  return responderComoLead({ db: obterDb(), modelo, agora: new Date() }, { ...base, texto: entrada.texto });
}

/** "Ajustar o SDR": o pedido, e a resposta que ele aponta, se houver. */
export async function ajustarNoChat(entrada: { pedido: string; referenciaId: string | null }): Promise<ResultadoDoTeste> {
  const { operador, base } = await contexto();
  const modelo = obterModeloDeLinguagem();
  const ajustador = obterAjustadorDeSdr();
  if (!modelo || !ajustador) return SEM_CHAVE;
  return ajustarNoTeste(
    { db: obterDb(), modelo, ajustador, agora: new Date() },
    { ...base, pedido: entrada.pedido, referenciaId: entrada.referenciaId, operadorId: operador.id },
  );
}

/** Volta o SDR para antes da última mudança. */
export async function desfazerNoChat(): Promise<ResultadoDoTeste> {
  const { operador, base } = await contexto();
  const modelo = obterModeloDeLinguagem();
  if (!modelo) return SEM_CHAVE;
  return desfazerAjuste({ db: obterDb(), modelo, agora: new Date() }, { ...base, operadorId: operador.id });
}

/** "Ficou bom": aprova o SDR e segue para os leads. */
export async function ficouBom(): Promise<{ ok: false; erro: string } | void> {
  const { operador } = await contexto();
  const { ok } = await comOperador(obterDb(), operador.id, (tx) =>
    aprovarSdr(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  if (!ok) return { ok: false, erro: "O SDR ainda não está pronto." };
  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/approach");
}

/**
 * O objetivo mudou depois do SDR: gera de novo, como versão nova, e recomeça a
 * conversa de teste com o SDR novo. Só com o clique (§4.2.1).
 */
export async function gerarSdrDeNovoNoPrimeiroAcesso() {
  const { operador, base } = await contexto();
  const gerador = obterGeradorDeSdr();
  const modelo = obterModeloDeLinguagem();
  if (!gerador || !modelo) redirect(`/onboarding/sdr?msg=${encodeURIComponent(MENSAGEM_SEM_CHAVE)}`);
  const db = obterDb();
  const gerado = await gerarSdr({ db, gerador: gerador! }, { ...base, operadorId: operador.id, agora: new Date() });
  if (gerado.ok) await comecarTeste({ db, modelo: modelo!, agora: new Date() }, base);
  revalidatePath("/onboarding/sdr");
  redirect(gerado.ok ? "/onboarding/sdr" : `/onboarding/sdr?msg=${encodeURIComponent(gerado.erro)}`);
}
