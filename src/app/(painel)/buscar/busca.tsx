"use client";

import { ArrowDown, Plus, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, useTransition, type ChangeEvent } from "react";
import { Aviso } from "@/components/aviso";
import { ResultadoDaImportacao, type RespostaDaImportacao } from "@/components/resultado-da-importacao";
import {
  FILTROS_INICIAIS,
  GRAUS_DE_CONEXAO,
  IDIOMAS_DO_PERFIL,
  podeSelecionar,
  rotuloDaSituacao,
  temFiltroDeConteudo,
  type FiltrosDeBusca,
  type GrauDeConexao,
  type IdiomaDoPerfil,
  type OpcaoDeFiltro,
  type SituacaoNaBase,
} from "@/domain/busca";
import { semAcentos } from "@/domain/texto";
import { buscar, importar, sugerir, type BuscaDoFormulario, type PessoaEncontrada } from "./acoes";

export type OpcaoDeCampanha = { id: string; nome: string; perfil: string };

/** O que a busca trouxe até agora, com a busca que trouxe (para carregar mais e para importar). */
type Lista = {
  busca: BuscaDoFormulario;
  pessoas: PessoaEncontrada[];
  cursor: string | null;
  teto: { usados: number; maximo: number };
  aviso: string | null;
};

const GRAU: Record<GrauDeConexao, string> = { 1: "1º (já é conexão)", 2: "2º", 3: "3º e além" };

const TOM_DA_SITUACAO: Record<SituacaoNaBase["tipo"], string> = {
  nova: "etiqueta-ok",
  na_base: "",
  na_campanha: "",
  de_outro_perfil: "etiqueta-atencao",
  optout: "etiqueta-erro",
};

const nomeDe = (p: PessoaEncontrada) => p.nome ?? ([p.primeiroNome, p.sobrenome].filter(Boolean).join(" ") || "Sem nome");
const urlDe = (p: PessoaEncontrada) =>
  p.urlPublica?.split("?")[0] ?? `https://www.linkedin.com/in/${p.publicIdentifier ?? p.providerId}`;
const normalizar = (texto: string) => semAcentos(texto).toLowerCase();

/** Local ou setor: o operador digita, a Unipile sugere, e o id escolhido vira filtro. */
function CampoDeOpcoes({
  rotulo,
  tipo,
  campanhaId,
  exemplo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  tipo: "LOCATION" | "INDUSTRY";
  campanhaId: string;
  exemplo: string;
  valor: OpcaoDeFiltro[];
  aoMudar: (valor: OpcaoDeFiltro[]) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState<{ termo: string; opcoes: OpcaoDeFiltro[] } | null>(null);
  const termo = texto.trim();

  useEffect(() => {
    if (termo.length < 2 || !campanhaId) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      const opcoes = await sugerir({ campanhaId, tipo, texto: termo });
      if (!cancelado) setSugestoes({ termo, opcoes });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [termo, campanhaId, tipo]);

  const aberto = termo.length >= 2;
  const carregando = aberto && sugestoes?.termo !== termo;
  const opcoes = (sugestoes?.opcoes ?? []).filter((o) => !valor.some((v) => v.id === o.id));

  function escolher(opcao: OpcaoDeFiltro) {
    aoMudar([...valor, opcao]);
    setTexto("");
  }

  return (
    <div className="rotulo">
      <label htmlFor={id}>{rotulo}</label>
      {valor.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${rotulo} escolhidos`}>
          {valor.map((opcao) => (
            <li key={opcao.id} className="etiqueta pr-1">
              {opcao.titulo}
              <button
                type="button"
                className="rounded-full p-0.5 text-tinta-fraca hover:text-tinta"
                aria-label={`Remover ${opcao.titulo}`}
                onClick={() => aoMudar(valor.filter((v) => v.id !== opcao.id))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setTexto("");
            if (e.key === "Enter") {
              // Enter escolhe a primeira sugestão em vez de enviar a busca.
              e.preventDefault();
              if (opcoes[0] && !carregando) escolher(opcoes[0]);
            }
          }}
          placeholder={`Digite e escolha: ${exemplo}`}
          autoComplete="off"
          aria-describedby={aberto ? `${id}-sugestoes` : undefined}
          className="campo w-full"
        />
        {aberto && (
          <div
            id={`${id}-sugestoes`}
            aria-live="polite"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-linha-forte bg-superficie-alta p-1 text-sm shadow-lg"
          >
            {carregando ? (
              <p className="px-2 py-1.5 text-tinta-fraca">Procurando no LinkedIn...</p>
            ) : opcoes.length === 0 ? (
              <p className="px-2 py-1.5 text-tinta-fraca">Nada encontrado. Tente outro nome.</p>
            ) : (
              <ul>
                {opcoes.map((opcao) => (
                  <li key={opcao.id}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1.5 text-left font-normal text-tinta hover:bg-superficie"
                      onClick={() => escolher(opcao)}
                    >
                      {opcao.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function alternar<T>(lista: readonly T[], item: T, marcado: boolean): T[] {
  return marcado ? [...lista, item] : lista.filter((x) => x !== item);
}

function Filtros({
  filtros,
  campanhaId,
  aoMudar,
}: {
  filtros: FiltrosDeBusca;
  campanhaId: string;
  aoMudar: (filtros: FiltrosDeBusca) => void;
}) {
  const texto = (campo: "palavrasChave" | "cargo" | "empresa") => ({
    value: filtros[campo],
    onChange: (e: ChangeEvent<HTMLInputElement>) => aoMudar({ ...filtros, [campo]: e.target.value }),
  });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="rotulo">
          Cargo
          <input {...texto("cargo")} placeholder="Head de marketing OR CMO" maxLength={200} className="campo" />
        </label>
        <label className="rotulo">
          Empresa atual
          <input {...texto("empresa")} placeholder="Nome da empresa" maxLength={200} className="campo" />
        </label>
        <label className="rotulo">
          Palavras-chave
          <input {...texto("palavrasChave")} placeholder="e-commerce" maxLength={200} className="campo" />
        </label>
        <CampoDeOpcoes
          rotulo="Local"
          tipo="LOCATION"
          exemplo="São Paulo"
          campanhaId={campanhaId}
          valor={filtros.locais}
          aoMudar={(locais) => aoMudar({ ...filtros, locais })}
        />
        <CampoDeOpcoes
          rotulo="Setor"
          tipo="INDUSTRY"
          exemplo="Varejo"
          campanhaId={campanhaId}
          valor={filtros.setores}
          aoMudar={(setores) => aoMudar({ ...filtros, setores })}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
        <fieldset>
          <legend className="text-[13px] font-medium text-tinta-suave">Grau de conexão</legend>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {GRAUS_DE_CONEXAO.map((grau) => (
              <label key={grau} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={filtros.graus.includes(grau)}
                  onChange={(e) => aoMudar({ ...filtros, graus: alternar(filtros.graus, grau, e.target.checked) })}
                />
                {GRAU[grau]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[13px] font-medium text-tinta-suave">Idioma do perfil</legend>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {(Object.entries(IDIOMAS_DO_PERFIL) as [IdiomaDoPerfil, string][]).map(([codigo, nome]) => (
              <label key={codigo} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={filtros.idiomas.includes(codigo)}
                  onChange={(e) => aoMudar({ ...filtros, idiomas: alternar(filtros.idiomas, codigo, e.target.checked) })}
                />
                {nome}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="mt-4 text-xs text-tinta-fraca">
        Cargo e palavras-chave aceitam OR e aspas, como no LinkedIn. Grau e idioma sem nada marcado valem qualquer um.
      </p>
    </>
  );
}

export function BuscaDeLeads({ campanhas, campanhaInicial }: { campanhas: OpcaoDeCampanha[]; campanhaInicial: string }) {
  const [campanhaId, setCampanhaId] = useState(campanhaInicial);
  const [modo, setModo] = useState<"filtros" | "url">("filtros");
  const [filtros, setFiltros] = useState<FiltrosDeBusca>(FILTROS_INICIAIS);
  const [url, setUrl] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [esconderIndisponiveis, setEsconderIndisponiveis] = useState(true);
  const [filtroLocal, setFiltroLocal] = useState("");
  const [resposta, setResposta] = useState<RespostaDaImportacao | null>(null);
  const [acao, setAcao] = useState<"buscar" | "mais" | "importar" | null>(null);
  const [pendente, iniciar] = useTransition();

  if (campanhas.length === 0) {
    return (
      <div className="vazio max-w-3xl">
        <p>Nenhuma campanha disponível. A busca leva as pessoas para uma campanha: crie uma antes.</p>
        <Link href="/campanhas/nova" className="botao botao-primario">
          <Plus aria-hidden />
          Nova campanha
        </Link>
      </div>
    );
  }

  // A situação de cada pessoa depende da campanha: trocar de campanha começa do zero.
  function trocarCampanha(id: string) {
    setCampanhaId(id);
    setLista(null);
    setSelecionados(new Set());
    setResposta(null);
    setErro(null);
  }

  function executarBusca() {
    const busca: BuscaDoFormulario = modo === "url" ? { modo: "url", url: url.trim() } : { modo: "filtros", filtros };
    if (modo === "filtros" && !temFiltroDeConteudo(filtros)) {
      setErro("Preencha pelo menos um destes: cargo, empresa, palavras-chave, local ou setor.");
      return;
    }
    setAcao("buscar");
    setErro(null);
    setResposta(null);
    iniciar(async () => {
      const r = await buscar({ campanhaId, busca, cursor: null });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setLista({ busca, pessoas: r.pessoas, cursor: r.cursor, teto: r.teto, aviso: r.aviso });
      setSelecionados(new Set(r.pessoas.filter((p) => podeSelecionar(p.situacao)).map((p) => p.providerId)));
    });
  }

  function carregarMais() {
    if (!lista?.cursor) return;
    const atual = lista;
    setAcao("mais");
    setErro(null);
    iniciar(async () => {
      const r = await buscar({ campanhaId, busca: atual.busca, cursor: atual.cursor });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      const conhecidas = new Set(atual.pessoas.map((p) => p.providerId));
      const novas = r.pessoas.filter((p) => !conhecidas.has(p.providerId));
      setLista({ ...atual, pessoas: [...atual.pessoas, ...novas], cursor: r.cursor, teto: r.teto, aviso: r.aviso });
      setSelecionados(
        (antes) => new Set([...antes, ...novas.filter((p) => podeSelecionar(p.situacao)).map((p) => p.providerId)]),
      );
    });
  }

  function levarParaATriagem() {
    if (!lista) return;
    const atual = lista;
    const escolhidas = atual.pessoas.filter((p) => selecionados.has(p.providerId) && podeSelecionar(p.situacao));
    if (escolhidas.length === 0) return;
    setAcao("importar");
    setResposta(null);
    iniciar(async () => {
      const r = await importar({ campanhaId, busca: atual.busca, selecionados: escolhidas });
      setResposta(r);
      if (!r.ok) return;
      // Quem foi levado agora está na campanha (na triagem, livre ou bloqueado).
      const levadas = new Set(escolhidas.map((p) => p.providerId));
      setLista({
        ...atual,
        pessoas: atual.pessoas.map((p) => (levadas.has(p.providerId) ? { ...p, situacao: { tipo: "na_campanha" } } : p)),
      });
      setSelecionados(new Set());
    });
  }

  const pessoas = lista?.pessoas ?? [];
  const termo = normalizar(filtroLocal.trim());
  const visiveis = pessoas.filter(
    (p) =>
      (!esconderIndisponiveis || podeSelecionar(p.situacao)) &&
      (!termo ||
        normalizar([nomeDe(p), p.cargoAtual, p.titulo, p.empresaAtual, p.localizacao].filter(Boolean).join(" ")).includes(termo)),
  );
  const selecionaveisVisiveis = visiveis.filter((p) => podeSelecionar(p.situacao));
  const todasVisiveisMarcadas =
    selecionaveisVisiveis.length > 0 && selecionaveisVisiveis.every((p) => selecionados.has(p.providerId));
  const escolhidas = pessoas.filter((p) => selecionados.has(p.providerId) && podeSelecionar(p.situacao)).length;
  const novas = pessoas.filter((p) => p.situacao.tipo === "nova").length;
  const indisponiveis = pessoas.filter((p) => !podeSelecionar(p.situacao)).length;

  function marcar(ids: string[], marcado: boolean) {
    setSelecionados((antes) => {
      const depois = new Set(antes);
      for (const id of ids) {
        if (marcado) depois.add(id);
        else depois.delete(id);
      }
      return depois;
    });
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <label className="rotulo max-w-md">
        Campanha
        <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)} className="campo">
          {campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.perfil}: {c.nome}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-tinta-fraca">
          A busca usa o LinkedIn do perfil desta campanha e mostra quem já está nela.
        </span>
      </label>

      <section className="cartao p-5">
        <div className="segmentos" role="group" aria-label="Como buscar">
          <button type="button" className="segmento" aria-pressed={modo === "filtros"} onClick={() => setModo("filtros")}>
            Por filtros
          </button>
          <button type="button" className="segmento" aria-pressed={modo === "url"} onClick={() => setModo("url")}>
            Colar URL de uma busca do LinkedIn
          </button>
        </div>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            executarBusca();
          }}
        >
          {modo === "filtros" ? (
            <Filtros filtros={filtros} campanhaId={campanhaId} aoMudar={setFiltros} />
          ) : (
            <label className="rotulo">
              URL da busca de pessoas
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
                className="campo"
              />
              <span className="text-xs font-normal text-tinta-fraca">
                Monte a busca no LinkedIn, copie a URL da barra do navegador e cole aqui. URL do Sales Navigator só funciona se
                a conta tiver o plano.
              </span>
            </label>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pendente} className="botao botao-primario">
              <Search aria-hidden />
              {pendente && acao === "buscar" ? "Buscando..." : "Buscar"}
            </button>
            {modo === "filtros" && (
              <button type="button" className="botao" onClick={() => setFiltros(FILTROS_INICIAIS)}>
                Limpar filtros
              </button>
            )}
            <span className="text-xs text-tinta-fraca">
              Cada clique traz até 50 pessoas e conta para o limite diário de busca do perfil.
            </span>
          </div>
        </form>
      </section>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {lista && (
        <section aria-label="Resultado da busca" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              <span className="tabular-nums">{pessoas.length}</span> pessoas encontradas
              <span className="font-normal text-tinta-suave">
                {" "}
                · <span className="tabular-nums">{novas}</span> novas · <span className="tabular-nums">{indisponiveis}</span>{" "}
                não podem entrar
              </span>
            </h2>
            <p className="text-xs text-tinta-fraca">
              O perfil buscou <span className="tabular-nums">{lista.teto.usados}</span> de{" "}
              <span className="tabular-nums">{lista.teto.maximo}</span> pessoas nas últimas 24 horas.
            </p>
          </div>

          {lista.aviso && <Aviso tom="atencao">{lista.aviso}</Aviso>}

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={filtroLocal}
              onChange={(e) => setFiltroLocal(e.target.value)}
              placeholder="Filtrar nesta lista: nome, cargo, empresa, local"
              aria-label="Filtrar nesta lista"
              className="campo campo-pequeno min-w-0 flex-1 basis-64"
            />
            <label className="flex items-center gap-2 text-[13px] text-tinta-suave">
              <input
                type="checkbox"
                className="size-4"
                checked={esconderIndisponiveis}
                onChange={(e) => setEsconderIndisponiveis(e.target.checked)}
              />
              Esconder quem não pode entrar
            </label>
            <button
              type="button"
              disabled={pendente || escolhidas === 0}
              onClick={levarParaATriagem}
              className="botao botao-primario"
            >
              <UserPlus aria-hidden />
              {pendente && acao === "importar" ? "Levando..." : `Levar ${escolhidas} para a triagem`}
            </button>
          </div>

          {visiveis.length === 0 ? (
            <div className="vazio">
              <p>
                {pessoas.length === 0
                  ? "A busca não trouxe ninguém. Afrouxe algum filtro e busque de novo."
                  : "Ninguém nesta lista com esse filtro."}
              </p>
            </div>
          ) : (
            <div className="tabela-moldura">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        aria-label="Selecionar todas as pessoas visíveis que podem entrar"
                        title="Selecionar todas as visíveis"
                        checked={todasVisiveisMarcadas}
                        onChange={(e) => marcar(selecionaveisVisiveis.map((p) => p.providerId), e.target.checked)}
                      />
                    </th>
                    <th>Pessoa</th>
                    <th>Empresa</th>
                    <th>Local</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const nome = nomeDe(p);
                    const selecionavel = podeSelecionar(p.situacao);
                    return (
                      <tr key={p.providerId} className={selecionavel ? undefined : "opacity-60"}>
                        <td>
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4"
                            checked={selecionavel && selecionados.has(p.providerId)}
                            disabled={!selecionavel}
                            onChange={(e) => marcar([p.providerId], e.target.checked)}
                            aria-label={selecionavel ? `Selecionar ${nome}` : `${nome} não pode entrar`}
                          />
                        </td>
                        <td>
                          <a href={urlDe(p)} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                            {nome}
                          </a>
                          <span className="block text-xs text-tinta-fraca">{p.cargoAtual ?? p.titulo ?? "sem cargo"}</span>
                        </td>
                        <td>{p.empresaAtual ?? "—"}</td>
                        <td className="text-xs text-tinta-suave">{p.localizacao ?? "—"}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <span className={`etiqueta ${TOM_DA_SITUACAO[p.situacao.tipo]}`}>{rotuloDaSituacao(p.situacao)}</span>
                            {p.distancia === "FIRST_DEGREE" && <span className="etiqueta etiqueta-info">Já é conexão</span>}
                            {p.convitePendente && <span className="etiqueta">Convite pendente</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {lista.cursor ? (
              <button type="button" disabled={pendente} onClick={carregarMais} className="botao">
                <ArrowDown aria-hidden />
                {pendente && acao === "mais" ? "Carregando..." : "Carregar mais 50"}
              </button>
            ) : (
              pessoas.length > 0 && <span className="text-xs text-tinta-fraca">A busca não tem mais resultados.</span>
            )}
          </div>
          <p className="text-xs text-tinta-fraca">
            A situação é um aviso. Na triagem, as regras são conferidas de novo: opt-out não entra, pessoa de outro perfil fica
            bloqueada e o cooldown de empresa aparece como alerta.
          </p>
        </section>
      )}

      {resposta && <ResultadoDaImportacao resposta={resposta} campanhaId={campanhaId} />}
    </div>
  );
}
