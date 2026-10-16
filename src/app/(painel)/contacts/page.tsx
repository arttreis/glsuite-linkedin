import { Tags as IconeTags, Layers, Upload } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { ORIGENS_DO_CONTATO, ROTULO_DA_ORIGEM } from "@/domain/contatos";
import { CANAIS_DO_FILTRO, descreverFiltro, lerFiltro, type FiltroDeContatos } from "@/domain/filtro-de-contatos";
import { CONTATOS_POR_PAGINA, listarContatos } from "@/server/contatos/contatos";
import { nomesParaOsFiltros, obterSegmento } from "@/server/contatos/segmentos";
import { listarTags } from "@/server/contatos/tags";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { ListaDeContatos } from "./lista";

const ROTULO_DO_CANAL: Record<(typeof CANAIS_DO_FILTRO)[number], string> = {
  whatsapp: "Podem receber pelo WhatsApp",
  telegram: "Podem receber pelo Telegram",
  linkedin: "Leads do LinkedIn",
};

const texto = (valor: unknown) => (typeof valor === "string" ? valor : undefined);

/** O filtro da tela a partir da URL. O que não vale vira o padrão (`lerFiltro`). */
function filtroDaUrl(params: Record<string, string | string[] | undefined>): FiltroDeContatos {
  const tag = texto(params.tag);
  const origem = texto(params.origin);
  return lerFiltro({
    texto: texto(params.q),
    tags: { todas: [], alguma: tag ? [tag] : [], nenhuma: [] },
    canal: texto(params.channel) || undefined,
    origens: origem ? [origem] : [],
    situacao: texto(params.status) || undefined,
  });
}

/** Contatos (§4.15): todos com quem a organização pode falar, em qualquer canal, com as tags. */
export default async function ContatosPage({ searchParams }: PageProps<"/contacts">) {
  const operador = await exigirOperadorNoApp();
  const params = await searchParams;
  const pagina = Math.max(1, Number(texto(params.page)) || 1);
  const segmentoId = /^[0-9a-f-]{36}$/i.test(texto(params.segment) ?? "") ? texto(params.segment)! : null;
  const { lista, tags, segmento, filtro, nomes } = await comOperador(obterDb(), operador.id, async (tx) => {
    // Com segmento, vale o filtro dele (§4.17); sem, o da URL.
    const segmento = segmentoId ? await obterSegmento(tx, { id: segmentoId, organizacaoId: operador.organizacaoId }) : null;
    const filtro = segmento?.filtros ?? filtroDaUrl(params);
    return {
      segmento,
      filtro,
      lista: await listarContatos(tx, { organizacaoId: operador.organizacaoId, filtro, pagina }),
      tags: await listarTags(tx, operador.organizacaoId),
      nomes: await nomesParaOsFiltros(tx, operador.organizacaoId),
    };
  });
  const paginas = Math.max(1, Math.ceil(lista.total / CONTATOS_POR_PAGINA));
  const comPagina = (n: number) => {
    const busca = new URLSearchParams();
    for (const chave of ["q", "tag", "channel", "origin", "status", "segment"]) {
      const valor = texto(params[chave]);
      if (valor) busca.set(chave, valor);
    }
    if (n > 1) busca.set("page", String(n));
    return busca.size > 0 ? `/contacts?${busca.toString()}` : "/contacts";
  };

  return (
    <>
      <Cabecalho
        titulo="Contatos"
        descricao={`Todo mundo com quem a organização pode falar: ${operador.modulos.includes("linkedin") ? "os leads do LinkedIn, " : ""}quem você importou e quem entrou pelos canais. Use as tags para separar e achar.`}
      >
        <Link href="/contacts/segments" className="botao">
          <Layers aria-hidden />
          Segmentos
        </Link>
        <Link href="/contacts/tags" className="botao">
          <IconeTags aria-hidden />
          Tags
        </Link>
        <Link href="/contacts/import" className="botao botao-primario">
          <Upload aria-hidden />
          Importar contatos
        </Link>
      </Cabecalho>

      <div className="flex max-w-6xl flex-col gap-5">
        {typeof params.msg === "string" && <Aviso>{params.msg}</Aviso>}
        {segmentoId && !segmento && <Aviso tom="atencao">Esse segmento não existe mais. A lista mostra os filtros de sempre.</Aviso>}

        {segmento ? (
          <div className="cartao flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              Segmento <span className="font-medium">{segmento.nome}</span>
            </p>
            <div className="flex gap-3 text-[13px]">
              <Link href={`/contacts/segments/${segmento.id}`} className="link">
                Editar o segmento
              </Link>
              <Link href="/contacts" className="link">
                Ver todos os contatos
              </Link>
            </div>
          </div>
        ) : (
          <form method="get" className="cartao flex flex-wrap items-end gap-3 p-4" aria-label="Filtrar contatos">
            <label className="rotulo min-w-0 flex-1 basis-56">
              Procurar
              <input name="q" defaultValue={filtro.texto ?? ""} placeholder="Nome, empresa, cargo, telefone ou e-mail" className="campo campo-pequeno" />
            </label>
            <label className="rotulo">
              Tag
              <select name="tag" defaultValue={filtro.tags.alguma[0] ?? ""} className="campo campo-pequeno w-auto">
                <option value="">Qualquer</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="rotulo">
              Canal
              <select name="channel" defaultValue={filtro.canal ?? ""} className="campo campo-pequeno w-auto">
                <option value="">Qualquer</option>
                {CANAIS_DO_FILTRO.map((canal) => (
                  <option key={canal} value={canal}>
                    {ROTULO_DO_CANAL[canal]}
                  </option>
                ))}
              </select>
            </label>
            <label className="rotulo">
              Veio de
              <select name="origin" defaultValue={filtro.origens[0] ?? ""} className="campo campo-pequeno w-auto">
                <option value="">Qualquer lugar</option>
                {ORIGENS_DO_CONTATO.map((origem) => (
                  <option key={origem} value={origem}>
                    {ROTULO_DA_ORIGEM[origem]}
                  </option>
                ))}
              </select>
            </label>
            <label className="rotulo">
              Quem
              <select name="status" defaultValue={filtro.situacao} className="campo campo-pequeno w-auto">
                <option value="podem">Pode ser contatado</option>
                <option value="nao_contatar">Pediu para não ser contatado</option>
                <option value="todos">Todos</option>
              </select>
            </label>
            <button type="submit" className="botao botao-pequeno">
              Filtrar
            </button>
          </form>
        )}

        <p className="text-sm text-tinta-suave">
          {descreverFiltro(filtro, nomes)}: <span className="tabular-nums text-tinta">{lista.total.toLocaleString("pt-BR")}</span>.
        </p>

        {lista.total === 0 ? (
          <div className="vazio">
            <p>
              Nenhum contato aqui.
              {operador.modulos.includes("linkedin") ? " Os leads do LinkedIn entram sozinhos; os outros você importa de uma planilha." : " Importe os seus de uma planilha."}
            </p>
            <Link href="/contacts/import" className="botao botao-primario">
              <Upload aria-hidden />
              Importar contatos
            </Link>
          </div>
        ) : (
          <ListaDeContatos
            contatos={lista.contatos.map((c) => ({ ...c, criadoEm: new Date(c.criadoEm).toISOString() }))}
            total={lista.total}
            filtro={filtro}
            tags={tags.map(({ id, nome }) => ({ id, nome }))}
          />
        )}

        {paginas > 1 && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm">
            {pagina > 1 ? (
              <Link href={comPagina(pagina - 1)} className="link">
                Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="text-tinta-fraca">
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas ? (
              <Link href={comPagina(pagina + 1)} className="link">
                Próximos
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </>
  );
}
