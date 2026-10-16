import { Plus, X } from "lucide-react";
import { Tag } from "@/components/tag";
import type { CorDaTag } from "@/domain/contatos";
import { MAX_NOME_DA_TAG } from "@/domain/contatos";
import { porTagNoContatoDoPainel, tirarTagDoContatoDoPainel } from "./acoes";

type TagCurta = { id: string; nome: string; cor: CorDaTag };

/**
 * As tags de um contato, com tirar (×) e pôr pelo nome (§4.16). A tag que não
 * existe é criada. Serve à página do contato e ao painel do lead no Chats:
 * `voltar` é a tela que abre de novo depois.
 */
export function TagsDoContato({
  contatoId,
  tags,
  todas,
  voltar,
}: {
  contatoId: string;
  tags: TagCurta[];
  todas: { id: string; nome: string }[];
  voltar: string;
}) {
  const sugestoes = todas.filter((tag) => !tags.some((t) => t.id === tag.id));
  const lista = `tags-${contatoId}`;
  return (
    <div className="flex flex-col gap-2">
      {tags.length === 0 ? (
        <p className="text-[13px] text-tinta-fraca">Sem tags.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag.id}>
              <form action={tirarTagDoContatoDoPainel}>
                <input type="hidden" name="contatoId" value={contatoId} />
                <input type="hidden" name="tagId" value={tag.id} />
                <input type="hidden" name="voltar" value={voltar} />
                <Tag nome={tag.nome} cor={tag.cor}>
                  <button type="submit" className="-mr-1 rounded-full p-0.5 hover:text-tinta" aria-label={`Tirar a tag ${tag.nome}`}>
                    <X className="size-3" aria-hidden />
                  </button>
                </Tag>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={porTagNoContatoDoPainel} className="flex items-center gap-1.5">
        <input type="hidden" name="contatoId" value={contatoId} />
        <input type="hidden" name="voltar" value={voltar} />
        <input
          name="nome"
          list={lista}
          required
          maxLength={MAX_NOME_DA_TAG}
          placeholder="Nova tag ou uma que já existe"
          aria-label="Tag para pôr"
          className="campo campo-pequeno min-w-0 flex-1"
        />
        <datalist id={lista}>
          {sugestoes.map((tag) => (
            <option key={tag.id} value={tag.nome} />
          ))}
        </datalist>
        <button type="submit" className="botao botao-pequeno shrink-0" aria-label="Pôr a tag">
          <Plus aria-hidden />
          Pôr
        </button>
      </form>
    </div>
  );
}
