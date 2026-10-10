import { Repeat2, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { Aviso } from "@/components/aviso";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { comOperador, type Operador } from "@/server/db/operador";
import { obterAvaliadorDeAderencia, obterSugeridorDePublicos, obterUnipileSeConfigurada } from "@/server/dependencias";
import { obterPrevia, rodarPrevia } from "@/server/previa/previa";
import { listarPublicos, sugerirPublicos, type PublicoSalvo } from "@/server/publicos/publicos";
import { Pergunta } from "../pergunta";
import { abrirPasso } from "../portao";
import { escolherPublicoNoPrimeiroAcesso, sugerirOutrosPublicos, trocarPerfilDoLead } from "./acoes";
import { ListaDaPrevia, SeguirSemNomes } from "./lista";

// Sugerir o público e buscar a prévia são chamadas longas na abertura do passo.
export const maxDuration = 300;

/** Quantas sugestões o primeiro acesso mostra (§4.4). */
const SUGESTOES = 3;

function Procurando({ texto }: { texto: string }) {
  return (
    <div role="status" className="cartao mt-10 flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute size-10 animate-ping rounded-full bg-destaque/20" />
        <span className="size-3.5 rounded-full bg-destaque" />
      </span>
      <p className="font-medium">{texto}</p>
    </div>
  );
}

/** O público em poucas linhas: quem, que empresa, por que precisa. */
function ResumoDoPublico({ publico }: { publico: PublicoSalvo }) {
  const empresa = [publico.empresa.setores.join(", "), publico.empresa.porte, publico.empresa.regiao].filter(Boolean).join(" · ");
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {publico.quem.cargos.map((cargo) => (
          <span key={cargo} className="etiqueta">
            {cargo}
          </span>
        ))}
      </div>
      {empresa && <p className="mt-3 text-sm text-tinta-suave">{empresa}</p>}
      <p className="mt-2 text-sm">
        <span className="text-tinta-fraca">Por que precisa: </span>
        {publico.por_que.dor}
      </p>
    </>
  );
}

/** Sem público escolhido: as sugestões, para a pessoa escolher uma. */
async function Sugestoes({ operador }: { operador: Operador }) {
  const db = obterDb();
  let sugeridos = (await comOperador(db, operador.id, (tx) => listarPublicos(tx, operador.organizacaoId))).filter((p) => p.status === "sugerido");
  if (sugeridos.length === 0) {
    const sugeridor = obterSugeridorDePublicos();
    if (!sugeridor) return <Aviso tom="erro" className="mt-10">Sugerir públicos precisa da chave da Anthropic. Peça ao admin para configurar.</Aviso>;
    const resultado = await sugerirPublicos(
      { db, sugeridor, agora: () => new Date() },
      { organizacaoId: operador.organizacaoId, operadorId: operador.id },
    );
    if (!resultado.ok) return <Aviso tom="erro" className="mt-10">{resultado.erro}</Aviso>;
    sugeridos = (await comOperador(db, operador.id, (tx) => listarPublicos(tx, operador.organizacaoId))).filter((p) => p.status === "sugerido");
  }

  return (
    <div className="mt-10 flex flex-col gap-4">
      {sugeridos.slice(0, SUGESTOES).map((publico) => (
        <form key={publico.id} action={escolherPublicoNoPrimeiroAcesso} className="cartao p-6">
          <input type="hidden" name="publico" value={publico.id} />
          <h2 className="text-xl font-medium tracking-tight">{publico.nome}</h2>
          <div className="mt-3">
            <ResumoDoPublico publico={publico} />
          </div>
          <button type="submit" className="botao botao-primario mt-5">
            Esse é o meu lead
          </button>
        </form>
      ))}
      <form action={sugerirOutrosPublicos}>
        <button type="submit" className="botao botao-pequeno">
          <Sparkles aria-hidden />
          Sugerir outros
        </button>
      </form>
    </div>
  );
}

/** Com o público escolhido: o perfil do lead e a prévia de pessoas reais. */
async function Previa({ operador, publico }: { operador: Operador; publico: PublicoSalvo }) {
  const db = obterDb();
  let previa = await obterPrevia(db, operador.organizacaoId);
  if (!previa || previa.publicoId !== publico.id || previa.status === "buscando") {
    previa = await rodarPrevia(
      { db, unipile: obterUnipileSeConfigurada() ?? null, avaliador: obterAvaliadorDeAderencia(), agora: new Date() },
      { organizacaoId: operador.organizacaoId, publicoId: publico.id },
    );
  }
  const { nota_de_corte: corte } = await lerConfiguracao(db, "busca");

  return (
    <>
      <section className="cartao mt-10 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-tinta-fraca">Perfil do lead</p>
            <h2 className="mt-1 text-xl font-medium tracking-tight">{publico.nome}</h2>
          </div>
          <form action={trocarPerfilDoLead}>
            <input type="hidden" name="publico" value={publico.id} />
            <button type="submit" className="botao botao-pequeno">
              <Repeat2 aria-hidden />
              Trocar
            </button>
          </form>
        </header>
        <div className="mt-3">
          <ResumoDoPublico publico={publico} />
        </div>
      </section>

      {previa.status === "pronta" && previa.pessoas.length > 0 ? (
        <>
          <p className="mt-8 text-sm text-tinta-suave">
            {previa.pessoas.length} {previa.pessoas.length === 1 ? "pessoa real" : "pessoas reais"} no LinkedIn
            {previa.regiao ? `, em ${previa.regiao.nome}` : ""}, com a nota de quanto cada uma parece com o seu lead.
          </p>
          <ListaDaPrevia inicial={previa.pessoas} corte={corte} />
        </>
      ) : (
        <>
          <Aviso tom="atencao" className="mt-8">
            <p className="font-medium">{previa.motivo ?? "A prévia ficou sem nomes."}</p>
            <p className="mt-1">
              Os nomes chegam quando você vincular o seu LinkedIn: a busca roda pela sua conta, com esse mesmo perfil de lead.
            </p>
          </Aviso>
          <SeguirSemNomes />
        </>
      )}
    </>
  );
}

/** Passo 4 (§2.1, §4.4): quem compra de você, com nomes reais do LinkedIn. */
export default async function PassoLeads({ searchParams }: PageProps<"/comecar/leads">) {
  const { operador } = await abrirPasso("leads");
  const { msg } = await searchParams;
  const publicos = await comOperador(obterDb(), operador.id, (tx) => listarPublicos(tx, operador.organizacaoId));
  const escolhido = publicos.find((publico) => publico.status === "ativo");

  return (
    <>
      <Pergunta passo="leads">
        {escolhido
          ? "Pessoas reais do LinkedIn com o perfil do seu lead. Tire quem não quer: só quem ficar marcado entra na abordagem."
          : "A partir da análise, estes são os perfis de lead com mais chance de comprar. Escolha um para ver pessoas reais."}
      </Pergunta>
      {typeof msg === "string" && (
        <Aviso tom="erro" className="mt-6">
          {msg}
        </Aviso>
      )}
      {escolhido ? (
        <Suspense fallback={<Procurando texto={`Procurando no LinkedIn quem é ${escolhido.nome.toLowerCase()}...`} />}>
          <Previa operador={operador} publico={escolhido} />
        </Suspense>
      ) : (
        <Suspense fallback={<Procurando texto="Pensando em quem compra de você..." />}>
          <Sugestoes operador={operador} />
        </Suspense>
      )}
    </>
  );
}
