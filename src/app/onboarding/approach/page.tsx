import { Suspense } from "react";
import { Aviso } from "@/components/aviso";
import { tamanhoDoPublico } from "@/domain/busca";
import { RAMPA_PADRAO, TETO_SEMANAL_PADRAO } from "@/domain/rampa";
import { gerarAbordagem, obterAbordagem, type ResultadoDaAbordagem } from "@/server/abordagem/recomendada";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { comOperador, type Operador } from "@/server/db/operador";
import { obterAvaliadorDeAderencia, obterEscritorDeFluxo, obterSugeridorDePublicos, obterUnipileSeConfigurada } from "@/server/dependencias";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { obterPrevia, rodarPrevia } from "@/server/previa/previa";
import { listarPublicos, publicoDoPrimeiroAcesso, sugerirPublicos } from "@/server/publicos/publicos";
import { obterSdr } from "@/server/sdr/sdr";
import { abrirPasso } from "../portao";
import { AreaDeTrabalho, type PreviaDaTela } from "./area-de-trabalho";
import { Lateral } from "./lateral";

// Sugerir o público, buscar a prévia e escrever a abordagem são chamadas longas na abertura do passo.
export const maxDuration = 300;

function Pensando() {
  return (
    <div role="status" className="cartao mx-auto mt-10 flex min-h-64 max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute size-10 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3.5 rounded-full bg-destaque" />
      </span>
      <p className="font-medium">Pensando em quem compra de você...</p>
    </div>
  );
}

/** A prévia do público em uso: a que já existe, ou uma busca nova pela conta da casa. */
async function garantirPrevia(organizacaoId: string, publicoId: string): Promise<PreviaDaTela> {
  try {
    const db = obterDb();
    let previa = await obterPrevia(db, organizacaoId);
    if (!previa || previa.publicoId !== publicoId || previa.status === "buscando") {
      previa = await rodarPrevia(
        { db, unipile: obterUnipileSeConfigurada() ?? null, avaliador: obterAvaliadorDeAderencia(), agora: new Date() },
        { organizacaoId, publicoId },
      );
    }
    return { ok: true, previa, tamanho: tamanhoDoPublico(previa.totalNoLinkedin) };
  } catch (erro) {
    console.error("Prévia do primeiro acesso falhou", erro);
    return { ok: false, erro: "Não consegui buscar as pessoas agora. Recarregue a página." };
  }
}

/** A abordagem do público em uso: a que já existe, ou escrita agora na voz do SDR. */
async function garantirAbordagem(operador: Operador, publicoId: string): Promise<ResultadoDaAbordagem> {
  try {
    const db = obterDb();
    const atual = await obterAbordagem(db, operador.organizacaoId);
    if (atual && atual.publicoId === publicoId) return { ok: true, abordagem: atual };
    const escritor = obterEscritorDeFluxo();
    if (!escritor) return { ok: false, erro: "Escrever a abordagem precisa da chave da Anthropic. Peça ao admin para configurar." };
    return await gerarAbordagem(
      { db, escritor, agora: new Date() },
      { organizacaoId: operador.organizacaoId, nome: operador.nome, operadorId: operador.id },
    );
  } catch (erro) {
    console.error("Abordagem do primeiro acesso falhou", erro);
    return { ok: false, erro: "Não consegui escrever a abordagem agora. Recarregue a página." };
  }
}

/**
 * Garante o público em uso (o escolhido, ou a sugestão de maior aderência) e
 * entrega a área de trabalho. A busca das pessoas e a escrita das mensagens
 * correm juntas e chegam na tela cada uma no seu tempo. Roda dentro do Suspense.
 */
async function Area({ operador }: { operador: Operador }) {
  const db = obterDb();
  const doPrimeiroAcesso = () =>
    comOperador(db, operador.id, (tx) =>
      publicoDoPrimeiroAcesso(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
    );

  let publico = await doPrimeiroAcesso();
  if (!publico) {
    const sugeridor = obterSugeridorDePublicos();
    if (!sugeridor) return <Aviso tom="erro">Sugerir públicos precisa da chave da Anthropic. Peça ao admin para configurar.</Aviso>;
    const sugestao = await sugerirPublicos(
      { db, sugeridor, agora: () => new Date() },
      { organizacaoId: operador.organizacaoId, operadorId: operador.id },
    );
    if (!sugestao.ok) return <Aviso tom="erro">{sugestao.erro}</Aviso>;
    publico = await doPrimeiroAcesso();
    if (!publico) return <Aviso tom="erro">A IA não trouxe nenhum público aproveitável. Recarregue para tentar de novo.</Aviso>;
  }

  // As duas chamadas longas começam agora e não são esperadas aqui.
  const previa = garantirPrevia(operador.organizacaoId, publico.id);
  const abordagem = garantirAbordagem(operador, publico.id);

  const { publicos, analise } = await comOperador(db, operador.id, async (tx) => ({
    publicos: (await listarPublicos(tx, operador.organizacaoId)).filter((p) => p.status !== "arquivado"),
    analise: await dossieConfirmado(tx, operador.organizacaoId),
  }));
  const sdr = await obterSdr(db, operador.organizacaoId);
  const { nota_de_corte: corte } = await lerConfiguracao(db, "busca");

  return (
    <AreaDeTrabalho
      key={publico.id}
      previa={previa}
      abordagem={abordagem}
      corte={corte}
      convitesPorDia={RAMPA_PADRAO[0]!.convites_dia}
      tetoSemanal={TETO_SEMANAL_PADRAO}
      chamarVoce={sdr?.sdr.quando_chamar_voce ?? []}
      lateral={<Lateral analise={analise} sdr={sdr?.sdr ?? null} publicos={publicos} corte={corte} />}
    />
  );
}

/**
 * Passo 4 (§2.1, SDR-56): quem abordar e o que dizer, numa tela só. Os
 * públicos pela aderência, as pessoas reais do LinkedIn, as mensagens como
 * chegam para cada uma, e a permissão.
 */
export default async function PassoAbordagem({ searchParams }: PageProps<"/onboarding/approach">) {
  const { operador } = await abrirPasso("abordagem");
  const { msg } = await searchParams;
  return (
    <>
      {typeof msg === "string" && (
        <Aviso tom="erro" className="mx-auto mb-6 max-w-2xl">
          {msg}
        </Aviso>
      )}
      <Suspense fallback={<Pensando />}>
        <Area operador={operador} />
      </Suspense>
    </>
  );
}
