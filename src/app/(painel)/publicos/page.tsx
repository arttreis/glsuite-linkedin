import { Archive, Check, Pencil, Plus, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { NOME_DA_PRACA } from "@/domain/publico";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterSugeridorDePublicos } from "@/server/dependencias";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { listarPublicos, type PublicoSalvo } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";
import { BotaoSugerir } from "./botao-sugerir";
import { BotaoDeStatus, ResumoDoPublico } from "./resumo";

// A sugestão chama a IA dentro da ação e leva até 1 minuto.
export const maxDuration = 120;

function CartaoDoPublico({ p }: { p: PublicoSalvo }) {
  return (
    <li className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">
            {p.status === "arquivado" ? (
              p.nome
            ) : (
              <Link href={`/publicos/${p.id}`} className="hover:underline">
                {p.nome}
              </Link>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-tinta-fraca">
            {NOME_DA_PRACA[p.praca]} · {p.origem === "ia" ? "sugerido pela IA" : "criado por alguém do time"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === "sugerido" && (
            <>
              <BotaoDeStatus id={p.id} acao="escolher" rotulo="Escolher" icone={<Check aria-hidden />} principal />
              <Link href={`/publicos/${p.id}/editar`} className="botao botao-pequeno">
                <Pencil aria-hidden />
                Editar antes
              </Link>
              <BotaoDeStatus id={p.id} acao="arquivar" rotulo="Descartar" icone={<Archive aria-hidden />} />
            </>
          )}
          {p.status === "ativo" && (
            <>
              <Link href={`/publicos/${p.id}`} className="botao botao-pequeno botao-primario">
                <Send aria-hidden />
                Abordar
              </Link>
              <Link href={`/publicos/${p.id}/editar`} className="botao botao-pequeno">
                <Pencil aria-hidden />
                Editar
              </Link>
              <BotaoDeStatus id={p.id} acao="arquivar" rotulo="Arquivar" icone={<Archive aria-hidden />} />
            </>
          )}
          {p.status === "arquivado" && <BotaoDeStatus id={p.id} acao="reativar" rotulo="Usar de novo" icone={<RotateCcw aria-hidden />} />}
        </div>
      </div>

      {p.desatualizado && p.status !== "arquivado" && (
        <Aviso tom="atencao" className="mt-4">
          O dossiê foi confirmado de novo depois deste público. Revise se ele ainda faz sentido e salve.
        </Aviso>
      )}

      <div className="mt-4">
        <ResumoDoPublico p={p} />
      </div>
    </li>
  );
}

function Grupo({ titulo, ajuda, publicos }: { titulo: string; ajuda: string; publicos: PublicoSalvo[] }) {
  if (publicos.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="font-medium">
        {titulo} <span className="text-tinta-fraca">({publicos.length})</span>
      </h2>
      <p className="mt-0.5 text-xs text-tinta-fraca">{ajuda}</p>
      <ul className="mt-3 grid gap-3">
        {publicos.map((p) => (
          <CartaoDoPublico key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );
}

export default async function PublicosPage({ searchParams }: PageProps<"/publicos">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const { publicos, temDossie } = await comOperador(obterDb(), operador.id, async (tx) => ({
    publicos: await listarPublicos(tx, operador.organizacaoId),
    temDossie: (await dossieConfirmado(tx, operador.organizacaoId)) !== null,
  }));
  const semChave = obterSugeridorDePublicos() === null;
  const escolhidos = publicos.filter((p) => p.status === "ativo");
  const sugeridos = publicos.filter((p) => p.status === "sugerido");
  const arquivados = publicos.filter((p) => p.status === "arquivado");

  return (
    <>
      <Cabecalho
        titulo="Públicos"
        descricao="Quem compra e por quê. A IA sugere a partir do dossiê da oferta; vocês escolhem, editam ou criam. Só público escolhido vira campanha."
      >
        <Link href="/publicos/novo" className={`botao ${temDossie ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!temDossie}>
          <Plus aria-hidden />
          Criar público
        </Link>
        <BotaoSugerir principal={escolhidos.length === 0} desabilitado={!temDossie || semChave} jaTemSugestoes={sugeridos.length > 0} />
      </Cabecalho>

      <div className="max-w-3xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}
        {!temDossie && (
          <Aviso tom="atencao" className="mb-5">
            Os públicos saem do dossiê da oferta, e ele ainda não foi confirmado.{" "}
            <Link href="/oferta" className="link">
              Confirmar o dossiê
            </Link>
          </Aviso>
        )}
        {temDossie && semChave && (
          <Aviso tom="atencao" className="mb-5">
            A sugestão de públicos precisa da chave da Anthropic. Peça ao admin para configurar. Dá para criar públicos à mão.
          </Aviso>
        )}

        {publicos.length === 0 && temDossie && (
          <p className="vazio">Nenhum público ainda. Peça sugestões à IA ou crie um à mão.</p>
        )}

        <Grupo titulo="Escolhidos" ajuda="Estes podem virar campanha." publicos={escolhidos} />
        <Grupo
          titulo="Sugestões da IA"
          ajuda="Hipóteses. Nada acontece com elas até alguém escolher. Pedir de novo troca estas sugestões."
          publicos={sugeridos}
        />
        <p className="mt-8 text-xs text-tinta-fraca">
          Campanhas criadas à mão, fora de um público, continuam em{" "}
          <Link href="/campaigns" className="link">
            Campanhas
          </Link>
          .
        </p>
        {arquivados.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-tinta-suave">Arquivados ({arquivados.length})</summary>
            <ul className="mt-3 grid gap-3">
              {arquivados.map((p) => (
                <CartaoDoPublico key={p.id} p={p} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
