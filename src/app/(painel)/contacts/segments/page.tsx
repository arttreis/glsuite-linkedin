import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { listarSegmentos } from "@/server/contatos/segmentos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { apagarSegmentoDoPainel } from "./acoes";

/** Os segmentos da organização (§4.17), cada um com quantos contatos tem agora. */
export default async function SegmentosPage({ searchParams }: PageProps<"/contacts/segments">) {
  const operador = await exigirOperadorNoApp();
  const { msg } = await searchParams;
  const segmentos = await comOperador(obterDb(), operador.id, (tx) => listarSegmentos(tx, operador.organizacaoId));

  return (
    <>
      <Cabecalho
        titulo="Segmentos"
        descricao="Um segmento é um filtro de contatos com nome: as tags, o canal, de onde vieram e, para os leads do LinkedIn, a etapa e a campanha. Ele é recalculado sempre que é usado, então quem passa a cumprir o filtro entra sozinho."
        voltar={{ href: "/contacts", rotulo: "Contatos" }}
      >
        <Link href="/contacts/segments/new" className="botao botao-primario">
          <Plus aria-hidden />
          Novo segmento
        </Link>
      </Cabecalho>
      <div className="flex max-w-4xl flex-col gap-4">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {segmentos.length === 0 ? (
          <p className="vazio">Nenhum segmento ainda. Crie o primeiro em &quot;Novo segmento&quot;.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Segmentos">
            {segmentos.map((segmento) => (
              <li key={segmento.id} className="cartao flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[15px] font-semibold">
                    <Link href={`/contacts/segments/${segmento.id}`} className="link">
                      {segmento.nome}
                    </Link>
                  </h2>
                  <Link href={`/contacts?segment=${segmento.id}`} className="link text-sm tabular-nums">
                    {segmento.contatos === 1 ? "1 contato agora" : `${segmento.contatos.toLocaleString("pt-BR")} contatos agora`}
                  </Link>
                </div>
                <p className="text-[13px] text-tinta-suave">{segmento.descricao}.</p>
                <details>
                  <summary className="text-xs text-tinta-fraca hover:text-tinta">Apagar</summary>
                  <form action={apagarSegmentoDoPainel} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="segmentoId" value={segmento.id} />
                    <p className="text-[13px] text-tinta-suave">Os contatos e as tags continuam. Só o filtro salvo sai.</p>
                    <button type="submit" className="botao botao-perigo botao-pequeno">
                      <Trash2 aria-hidden />
                      Apagar o segmento
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
