"use client";

import { Check, ExternalLink, Pencil, Plus, Search, Square, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Aviso } from "@/components/aviso";
import { MAX_NOME_DA_LISTA, type SituacaoDaEmpresa } from "@/domain/lista-de-empresas";
import type { EmpresaDaLista, ListaDeEmpresas } from "@/server/listas/listas";
import {
  adicionarEmpresasDoPainel,
  apagarListaDoPainel,
  escolherEmpresaDoPainel,
  procurarEmpresasDoPainel,
  removerEmpresaDoPainel,
  renomearListaDoPainel,
} from "../../acoes-das-listas";
import { emPartes, EntradaDeEmpresas, type EmpresasLidas } from "../entrada-de-empresas";

type Retorno = { tom: "ok" | "erro" | "neutro"; texto: string } | null;

const paginaDaEmpresa = (id: string) => `https://www.linkedin.com/company/${id}/`;

function LinkDaPagina({ id }: { id: string }) {
  return (
    <a href={paginaDaEmpresa(id)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-xs">
      ver no LinkedIn
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

function Secao({ titulo, descricao, total, mostradas, children }: { titulo: string; descricao: string; total: number; mostradas: number; children: ReactNode }) {
  if (total === 0) return null;
  return (
    <section className="cartao p-5">
      <h2 className="text-[15px] font-semibold">
        {titulo} <span className="tabular-nums text-tinta-fraca">({total})</span>
      </h2>
      <p className="mt-1 mb-4 text-[13px] text-tinta-suave">{descricao}</p>
      {children}
      {total > mostradas && <p className="mt-3 text-xs text-tinta-fraca">Mostrando {mostradas} de {total}, em ordem alfabética.</p>}
    </section>
  );
}

/**
 * A tela de uma lista de empresas (§4.11): procurar no LinkedIn em levas,
 * escolher a página certa quando há dúvida, tirar e pôr empresas, renomear e
 * apagar.
 */
export function TelaDaLista({ lista, limiteNaTela }: { lista: ListaDeEmpresas; limiteNaTela: number }) {
  const router = useRouter();
  const [retorno, setRetorno] = useState<Retorno>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const parar = useRef(false);
  const [nome, setNome] = useState(lista.nome);
  const [renomeando, setRenomeando] = useState(false);
  const [lidas, setLidas] = useState<EmpresasLidas>({ nomes: [], repetidas: 0 });
  const [entrada, setEntrada] = useState(0);

  const doTipo = (situacao: SituacaoDaEmpresa) => lista.empresas.filter((e) => e.situacao === situacao);
  const { contagem } = lista;

  const procurar = () =>
    iniciar(async () => {
      parar.current = false;
      setRetorno(null);
      let feitas = 0;
      let faltam = contagem.a_procurar;
      setProgresso(`Procurando no LinkedIn… 0 de ${faltam}.`);
      while (!parar.current) {
        const resultado = await procurarEmpresasDoPainel({ listaId: lista.id });
        if (!resultado.ok) {
          setRetorno({ tom: "erro", texto: resultado.erro });
          break;
        }
        feitas += resultado.procuradas;
        faltam = resultado.faltam;
        setProgresso(`Procurando no LinkedIn… ${feitas} de ${feitas + faltam}.`);
        if (faltam === 0 || resultado.procuradas === 0) {
          setRetorno({ tom: "ok", texto: `${feitas} ${feitas === 1 ? "empresa procurada" : "empresas procuradas"}. Veja abaixo as que pedem sua escolha.` });
          break;
        }
      }
      if (parar.current) setRetorno({ tom: "neutro", texto: `Procura parada: ${feitas} feitas, faltam ${faltam}. Dá para continuar quando quiser.` });
      setProgresso(null);
      router.refresh();
    });

  const agir = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) =>
    iniciar(async () => {
      setRetorno(null);
      const resultado = await acao();
      if (!resultado.ok) setRetorno({ tom: "erro", texto: resultado.erro });
    });

  const escolher = (empresa: EmpresaDaLista, opcaoId: string | null) =>
    agir(() => escolherEmpresaDoPainel({ listaId: lista.id, empresaId: empresa.id, opcaoId }));
  const remover = (empresa: EmpresaDaLista) => agir(() => removerEmpresaDoPainel({ listaId: lista.id, empresaId: empresa.id }));

  const renomear = () =>
    iniciar(async () => {
      const resultado = await renomearListaDoPainel({ listaId: lista.id, nome });
      if (!resultado.ok) setRetorno({ tom: "erro", texto: resultado.erro });
      else setRenomeando(false);
    });

  const adicionar = () =>
    iniciar(async () => {
      setRetorno(null);
      let adicionadas = 0;
      let repetidas = lidas.repetidas;
      for (const parte of emPartes(lidas.nomes)) {
        const resultado = await adicionarEmpresasDoPainel({ listaId: lista.id, nomes: parte });
        if (!resultado.ok) {
          setRetorno({ tom: "erro", texto: adicionadas > 0 ? `${adicionadas} entraram, o resto não: ${resultado.erro}` : resultado.erro });
          return;
        }
        adicionadas += resultado.adicionadas;
        repetidas += resultado.repetidas;
      }
      setRetorno({
        tom: "ok",
        texto: `${adicionadas} ${adicionadas === 1 ? "empresa nova" : "empresas novas"} na lista${repetidas > 0 ? `; ${repetidas} já estavam ou vieram repetidas` : ""}. Procure as novas no LinkedIn.`,
      });
      setLidas({ nomes: [], repetidas: 0 });
      setEntrada((n) => n + 1);
    });

  const apagar = () => {
    const aviso =
      lista.campanhas.length > 0
        ? `Apagar a lista "${lista.nome}"? ${lista.campanhas.length === 1 ? "A campanha que usa esta lista para" : "As campanhas que usam esta lista param"} de buscar até alguém escolher outra lista ou tirar o filtro.`
        : `Apagar a lista "${lista.nome}" e as ${Object.values(contagem).reduce((s, n) => s + n, 0)} empresas dela?`;
    if (!window.confirm(aviso)) return;
    iniciar(async () => {
      const resultado = await apagarListaDoPainel({ listaId: lista.id });
      if (!resultado.ok) setRetorno({ tom: "erro", texto: resultado.erro });
      else router.push("/campaigns/company-lists");
    });
  };

  const botaoTirar = (empresa: EmpresaDaLista) => (
    <button type="button" aria-label={`Tirar ${empresa.nome} da lista`} title="Tirar da lista" onClick={() => remover(empresa)} disabled={pendente}>
      <X className="size-3" aria-hidden />
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {contagem.a_procurar > 0 && (
          <button type="button" className="botao botao-primario" onClick={procurar} disabled={pendente}>
            <Search aria-hidden />
            Procurar no LinkedIn ({contagem.a_procurar})
          </button>
        )}
        {progresso && (
          <button type="button" className="botao" onClick={() => (parar.current = true)}>
            <Square aria-hidden />
            Parar
          </button>
        )}
        {renomeando ? (
          <span className="flex flex-wrap items-center gap-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={MAX_NOME_DA_LISTA}
              aria-label="Nome da lista"
              className="campo campo-pequeno w-64"
              disabled={pendente}
            />
            <button type="button" className="botao botao-pequeno" onClick={renomear} disabled={pendente || !nome.trim()}>
              <Check aria-hidden />
              Salvar nome
            </button>
          </span>
        ) : (
          <button type="button" className="botao" onClick={() => setRenomeando(true)} disabled={pendente}>
            <Pencil aria-hidden />
            Renomear
          </button>
        )}
        <button type="button" className="botao botao-perigo" onClick={apagar} disabled={pendente}>
          <Trash2 aria-hidden />
          Apagar lista
        </button>
      </div>
      {contagem.a_procurar > 0 && !progresso && (
        <p className="-mt-3 text-xs text-tinta-fraca">
          {contagem.a_procurar} {contagem.a_procurar === 1 ? "empresa ainda não foi procurada" : "empresas ainda não foram procuradas"} e
          ficam fora da busca. O Kakou procura uma por vez, com uma pausa curta entre elas, pela conta do LinkedIn da organização: leva uns 2
          segundos por empresa. Não conta no limite de buscas do dia.
        </p>
      )}
      {progresso && <Aviso>{progresso} Deixe esta tela aberta até terminar.</Aviso>}
      {retorno && <Aviso tom={retorno.tom}>{retorno.texto}</Aviso>}

      <Secao
        titulo="Escolha qual é"
        descricao="O LinkedIn achou mais de uma página parecida. Escolha a certa; até lá, a empresa fica fora da busca."
        total={contagem.escolher}
        mostradas={Math.min(contagem.escolher, limiteNaTela)}
      >
        <ul className="flex flex-col gap-4">
          {doTipo("escolher").map((empresa) => (
            <li key={empresa.id} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-medium">
                {empresa.nome}
                {botaoTirar(empresa)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {empresa.opcoes.map((opcao) => (
                  <span key={opcao.id} className="flex items-center gap-1.5">
                    <button type="button" className="botao botao-pequeno" onClick={() => escolher(empresa, opcao.id)} disabled={pendente}>
                      <Check aria-hidden />
                      {opcao.nome}
                    </button>
                    <LinkDaPagina id={opcao.id} />
                  </span>
                ))}
                <button type="button" className="botao botao-pequeno" onClick={() => escolher(empresa, null)} disabled={pendente}>
                  Nenhuma destas: buscar pelo nome
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="Achadas no LinkedIn"
        descricao="A busca procura quem trabalha nestas páginas. Se o Kakou escolheu a página errada, troque."
        total={contagem.achada}
        mostradas={Math.min(contagem.achada, limiteNaTela)}
      >
        <ul className="flex flex-col gap-1.5 text-sm">
          {doTipo("achada").map((empresa) => (
            <li key={empresa.id} className="flex flex-wrap items-center gap-2">
              <span>{empresa.nome}</span>
              {empresa.linkedinNome && empresa.linkedinNome !== empresa.nome && <span className="text-tinta-suave">→ {empresa.linkedinNome}</span>}
              {empresa.linkedinId && <LinkDaPagina id={empresa.linkedinId} />}
              <Trocar empresa={empresa} aoEscolher={escolher} desabilitado={pendente} />
              {botaoTirar(empresa)}
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="Sem página no LinkedIn"
        descricao="A busca procura pelo nome na empresa atual da pessoa. Pode trazer quem trabalha numa empresa de nome parecido: a nota de cada pessoa ajuda a separar."
        total={contagem.sem_pagina}
        mostradas={Math.min(contagem.sem_pagina, limiteNaTela)}
      >
        <ul className="flex flex-col gap-1.5 text-sm">
          {doTipo("sem_pagina").map((empresa) => (
            <li key={empresa.id} className="flex flex-wrap items-center gap-2">
              <span>{empresa.nome}</span>
              <Trocar empresa={empresa} aoEscolher={escolher} desabilitado={pendente} />
              {botaoTirar(empresa)}
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="Ainda não procuradas"
        descricao='Ficam fora da busca até o Kakou procurar no LinkedIn. Use "Procurar no LinkedIn", lá em cima.'
        total={contagem.a_procurar}
        mostradas={Math.min(contagem.a_procurar, limiteNaTela)}
      >
        <ul className="flex flex-wrap gap-1.5">
          {doTipo("a_procurar").map((empresa) => (
            <li key={empresa.id} className="etiqueta">
              {empresa.nome}
              {botaoTirar(empresa)}
            </li>
          ))}
        </ul>
      </Secao>

      <details className="cartao p-5">
        <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
          <Plus className="size-4 text-tinta-suave" aria-hidden />
          Adicionar empresas
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <EntradaDeEmpresas key={entrada} aoMudar={setLidas} desabilitado={pendente} />
          <div>
            <button type="button" className="botao botao-primario" onClick={adicionar} disabled={pendente || lidas.nomes.length === 0}>
              <Plus aria-hidden />
              Adicionar à lista
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

/** Trocar a página de uma empresa já resolvida, entre as opções que a procura trouxe. */
function Trocar({
  empresa,
  aoEscolher,
  desabilitado,
}: {
  empresa: EmpresaDaLista;
  aoEscolher: (empresa: EmpresaDaLista, opcaoId: string | null) => void;
  desabilitado: boolean;
}) {
  const outras = empresa.opcoes.filter((o) => o.id !== empresa.linkedinId);
  if (outras.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="link cursor-pointer">trocar</summary>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {outras.map((opcao) => (
          <button key={opcao.id} type="button" className="botao botao-pequeno" onClick={() => aoEscolher(empresa, opcao.id)} disabled={desabilitado}>
            {opcao.nome}
          </button>
        ))}
        {empresa.situacao === "achada" && (
          <button type="button" className="botao botao-pequeno" onClick={() => aoEscolher(empresa, null)} disabled={desabilitado}>
            Nenhuma destas: buscar pelo nome
          </button>
        )}
      </div>
    </details>
  );
}
