"use client";

import { BriefcaseBusiness, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { Tags } from "@/components/tag";
import { ROTULO_DA_ORIGEM, telefoneLegivel } from "@/domain/contatos";
import type { FiltroDeContatos } from "@/domain/filtro-de-contatos";
import type { ContatoDaLista, SituacaoNoWhatsapp } from "@/server/contatos/contatos";
import { mudarTagEmMassaDoPainel } from "./acoes";

type ContatoNaTela = Omit<ContatoDaLista, "criadoEm"> & { criadoEm: string };

const WHATSAPP: Record<SituacaoNoWhatsapp, { rotulo: string; tom: string }> = {
  pode: { rotulo: "WhatsApp", tom: "text-tinta" },
  sem_autorizacao: { rotulo: "WhatsApp sem autorização", tom: "text-tinta-fraca" },
  saiu: { rotulo: "Saiu do WhatsApp", tom: "text-tinta-fraca line-through" },
};

/** Os canais do contato em ícones com nome: quem lê sabe por onde dá para falar. */
function Canais({ contato }: { contato: ContatoNaTela }) {
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      {contato.linkedin && (
        <span className="flex items-center gap-1 text-tinta-suave">
          <BriefcaseBusiness className="size-3" aria-hidden />
          LinkedIn
        </span>
      )}
      {contato.whatsapp && (
        <span className={`flex items-center gap-1 ${WHATSAPP[contato.whatsapp].tom}`} title={contato.telefone ? telefoneLegivel(contato.telefone) : undefined}>
          <MessageCircle className="size-3" aria-hidden />
          {WHATSAPP[contato.whatsapp].rotulo}
        </span>
      )}
      {!contato.linkedin && !contato.whatsapp && contato.email && <span className="text-tinta-fraca">só e-mail</span>}
    </span>
  );
}

/**
 * A lista de Contatos com a tag em massa (§4.16): nos marcados ou em todos do
 * filtro. "Todos do filtro" manda o filtro, e o servidor roda de novo: vale
 * para todos, não só para os desta página.
 */
export function ListaDeContatos({
  contatos,
  total,
  filtro,
  tags,
}: {
  contatos: ContatoNaTela[];
  total: number;
  filtro: FiltroDeContatos;
  tags: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [emTodos, setEmTodos] = useState(false);
  const [tagId, setTagId] = useState(tags[0]?.id ?? "");
  const [resultado, setResultado] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const todosDaPagina = contatos.length > 0 && contatos.every((c) => marcados.has(c.id));
  const quantos = emTodos ? total : marcados.size;

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const mudar = (acao: "por" | "tirar") =>
    iniciar(async () => {
      setResultado(null);
      const alvo = emTodos ? { filtro } : { ids: [...marcados] };
      const feito = await mudarTagEmMassaDoPainel({ tagId, acao, alvo });
      const nome = tags.find((t) => t.id === tagId)?.nome ?? "a tag";
      if (!feito.ok) {
        setResultado({ tom: "erro", texto: feito.erro });
        return;
      }
      const em = feito.contatos === 1 ? "1 contato" : `${feito.contatos.toLocaleString("pt-BR")} contatos`;
      setResultado({
        tom: "ok",
        texto: feito.contatos === 0 ? `Nada mudou: ${acao === "por" ? "todos já tinham" : "ninguém tinha"} "${nome}".` : `"${nome}" ${acao === "por" ? "posta em" : "tirada de"} ${em}.`,
      });
      setMarcados(new Set());
      setEmTodos(false);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="cartao flex flex-wrap items-center gap-3 p-3" aria-label="Tag em massa">
        {tags.length === 0 ? (
          <p className="text-[13px] text-tinta-suave">
            Para marcar vários contatos de uma vez, crie uma tag em{" "}
            <Link href="/contacts/tags" className="link">
              Tags
            </Link>
            .
          </p>
        ) : (
          <>
            <span className="text-[13px] text-tinta-suave">
              {emTodos
                ? `Todos os ${total.toLocaleString("pt-BR")} do filtro`
                : marcados.size === 0
                  ? "Marque contatos na lista ou use todos do filtro"
                  : `${marcados.size} marcado${marcados.size === 1 ? "" : "s"}`}
            </span>
            {!emTodos && total > marcados.size && (
              <button type="button" className="link text-[13px]" onClick={() => setEmTodos(true)}>
                Usar todos os {total.toLocaleString("pt-BR")} do filtro
              </button>
            )}
            {emTodos && (
              <button type="button" className="link text-[13px]" onClick={() => setEmTodos(false)}>
                Só os marcados
              </button>
            )}
            <select aria-label="Tag" value={tagId} onChange={(e) => setTagId(e.target.value)} className="campo campo-pequeno ml-auto w-auto">
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.nome}
                </option>
              ))}
            </select>
            <button type="button" className="botao botao-pequeno" disabled={pendente || quantos === 0 || !tagId} onClick={() => mudar("por")}>
              Pôr tag
            </button>
            <button type="button" className="botao botao-pequeno" disabled={pendente || quantos === 0 || !tagId} onClick={() => mudar("tirar")}>
              Tirar tag
            </button>
          </>
        )}
      </div>
      {resultado && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}

      <div className="tabela-moldura">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Marcar todos desta página"
                  className="size-4"
                  checked={todosDaPagina}
                  onChange={() => setMarcados(todosDaPagina ? new Set() : new Set(contatos.map((c) => c.id)))}
                />
              </th>
              <th>Contato</th>
              <th>Canais</th>
              <th>Tags</th>
              <th>Veio de</th>
            </tr>
          </thead>
          <tbody>
            {contatos.map((contato) => (
              <tr key={contato.id} className={contato.naoContatar ? "opacity-60" : ""}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Marcar ${contato.nome}`}
                    className="size-4"
                    checked={emTodos || marcados.has(contato.id)}
                    disabled={emTodos}
                    onChange={() => alternar(contato.id)}
                  />
                </td>
                <td>
                  <Link href={`/contacts/${contato.id}`} className="link font-medium">
                    {contato.nome}
                  </Link>
                  <span className="block truncate text-xs text-tinta-suave">{[contato.cargo, contato.empresa].filter(Boolean).join(" · ")}</span>
                  {contato.naoContatar && <span className="text-xs text-erro">não contatar</span>}
                </td>
                <td>
                  <Canais contato={contato} />
                </td>
                <td>
                  <Tags tags={contato.tags} max={4} />
                </td>
                <td className="text-xs text-tinta-suave">{ROTULO_DA_ORIGEM[contato.origem]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
