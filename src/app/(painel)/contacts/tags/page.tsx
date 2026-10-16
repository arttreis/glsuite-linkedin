import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { NOME_DA_COR, Tag } from "@/components/tag";
import { CORES_DAS_TAGS, MAX_NOME_DA_TAG, MAX_TAGS_POR_ORGANIZACAO, type CorDaTag } from "@/domain/contatos";
import { listarTags } from "@/server/contatos/tags";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { apagarTagDoPainel, criarTagDoPainel, editarTagDoPainel } from "../acoes";

function SeletorDeCor({ valor, rotulo }: { valor: CorDaTag; rotulo: string }) {
  return (
    <select name="cor" defaultValue={valor} aria-label={rotulo} className="campo campo-pequeno w-auto">
      {CORES_DAS_TAGS.map((cor) => (
        <option key={cor} value={cor}>
          {NOME_DA_COR[cor]}
        </option>
      ))}
    </select>
  );
}

/** As tags da organização (§4.16): criar, renomear, trocar a cor e apagar. */
export default async function TagsPage({ searchParams }: PageProps<"/contacts/tags">) {
  const operador = await exigirOperadorNoApp();
  const { msg } = await searchParams;
  const tags = await comOperador(obterDb(), operador.id, (tx) => listarTags(tx, operador.organizacaoId));

  return (
    <>
      <Cabecalho
        titulo="Tags"
        descricao="Rótulos que você põe nos contatos para separar e achar: cliente, evento, interesse. Renomear ou trocar a cor vale para todos os contatos que têm a tag."
        voltar={{ href: "/contacts", rotulo: "Contatos" }}
      />
      <div className="flex max-w-3xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}

        <section className="cartao p-5" aria-labelledby="titulo-nova-tag">
          <h2 id="titulo-nova-tag" className="text-[15px] font-semibold">
            Nova tag
          </h2>
          <form action={criarTagDoPainel} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="rotulo min-w-0 flex-1 basis-56">
              Nome
              <input name="nome" required maxLength={MAX_NOME_DA_TAG} placeholder="Ex.: Cliente" className="campo campo-pequeno" />
            </label>
            <SeletorDeCor valor="cinza" rotulo="Cor da tag nova" />
            <button type="submit" className="botao botao-primario botao-pequeno">
              <Plus aria-hidden />
              Criar
            </button>
          </form>
          <p className="mt-2 text-xs text-tinta-fraca">
            {tags.length} de {MAX_TAGS_POR_ORGANIZACAO} tags. Tag com o mesmo nome, sem diferença de maiúscula ou acento, não se repete.
          </p>
        </section>

        {tags.length === 0 ? (
          <p className="vazio">Nenhuma tag ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Tags">
            {tags.map((tag) => (
              <li key={tag.id} className="cartao flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Tag nome={tag.nome} cor={tag.cor} />
                  <Link href={`/contacts?tag=${tag.id}`} className="link text-[13px]">
                    {tag.contatos === 1 ? "1 contato" : `${tag.contatos.toLocaleString("pt-BR")} contatos`}
                  </Link>
                </div>
                <form action={editarTagDoPainel} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="tagId" value={tag.id} />
                  <input
                    name="nome"
                    defaultValue={tag.nome}
                    required
                    maxLength={MAX_NOME_DA_TAG}
                    aria-label={`Nome da tag ${tag.nome}`}
                    className="campo campo-pequeno min-w-0 flex-1 basis-48"
                  />
                  <SeletorDeCor valor={tag.cor} rotulo={`Cor da tag ${tag.nome}`} />
                  <button type="submit" className="botao botao-pequeno">
                    Salvar
                  </button>
                </form>
                <details>
                  <summary className="text-xs text-tinta-fraca hover:text-tinta">Apagar</summary>
                  <form action={apagarTagDoPainel} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="tagId" value={tag.id} />
                    <p className="text-[13px] text-tinta-suave">
                      {tag.contatos === 0
                        ? "Nenhum contato tem esta tag."
                        : `A tag sai de ${tag.contatos === 1 ? "1 contato" : `${tag.contatos.toLocaleString("pt-BR")} contatos`}.`}
                    </p>
                    <button type="submit" className="botao botao-perigo botao-pequeno">
                      <Trash2 aria-hidden />
                      Apagar a tag
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
