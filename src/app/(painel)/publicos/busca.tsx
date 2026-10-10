"use client";

import { Plus, Save, Search, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { ListaDeFrases } from "@/components/campos-de-edicao";
import type { BuscaDoPublico } from "@/domain/busca";
import { procurarParametrosDoPainel, rodarBuscaDoPainel, salvarBuscaDoPainel } from "./acoes";

type Parametro = BuscaDoPublico["regioes"][number];
type Tipo = "LOCATION" | "INDUSTRY";

/** Região ou setor: os escolhidos, uma caixa para procurar no LinkedIn e atalhos com o texto do público. */
function Escolha({
  rotulo,
  tipo,
  campanhaId,
  escolhidos,
  atalhos,
  aoMudar,
  desabilitado,
}: {
  rotulo: string;
  tipo: Tipo;
  campanhaId: string;
  escolhidos: Parametro[];
  atalhos: string[];
  aoMudar: (itens: Parametro[]) => void;
  desabilitado: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [opcoes, setOpcoes] = useState<Parametro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [procurando, iniciar] = useTransition();

  const procurar = (termo: string) =>
    iniciar(async () => {
      setTexto(termo);
      setErro(null);
      const resultado = await procurarParametrosDoPainel({ campanhaId, tipo, texto: termo });
      if (resultado.ok) setOpcoes(resultado.itens);
      else setErro(resultado.erro);
    });

  return (
    <div className="flex flex-col gap-2">
      <p className="rotulo">{rotulo}</p>
      {escolhidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {escolhidos.map((item) => (
            <span key={item.id} className="etiqueta">
              {item.nome}
              <button
                type="button"
                aria-label={`Tirar ${item.nome}`}
                onClick={() => aoMudar(escolhidos.filter((e) => e.id !== item.id))}
                disabled={desabilitado}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              procurar(texto);
            }
          }}
          placeholder={`Procurar ${rotulo.toLowerCase()} no LinkedIn`}
          aria-label={`Procurar ${rotulo.toLowerCase()}`}
          className="campo campo-pequeno w-64"
          disabled={desabilitado}
        />
        <button type="button" className="botao botao-pequeno" onClick={() => procurar(texto)} disabled={desabilitado || procurando}>
          <Search aria-hidden />
          {procurando ? "Procurando…" : "Procurar"}
        </button>
        {atalhos.map((atalho) => (
          <button key={atalho} type="button" className="botao botao-pequeno" onClick={() => procurar(atalho)} disabled={desabilitado || procurando}>
            {atalho}
          </button>
        ))}
      </div>
      {erro && <p className="text-xs text-tinta-suave">{erro}</p>}
      {opcoes && (
        <div className="flex flex-wrap gap-1.5">
          {opcoes.length === 0 && <span className="text-xs text-tinta-fraca">Nada encontrado com esse texto.</span>}
          {opcoes
            .filter((opcao) => !escolhidos.some((e) => e.id === opcao.id))
            .map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                className="botao botao-pequeno"
                onClick={() => aoMudar([...escolhidos, opcao])}
                disabled={desabilitado || escolhidos.length >= 10}
              >
                <Plus aria-hidden />
                {opcao.nome}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * A busca do público no LinkedIn, na aba Leads (§4.13). Monta com os cargos do
 * público; região e setor vêm da lista do LinkedIn. O que a busca trouxer vai
 * para a triagem da campanha, pelas regras de importação.
 */
export function BuscaDaCampanha({
  campanhaId,
  inicial,
  salva,
  saldoHoje,
  tetoDoDia,
  suspensaAte,
  atalhos,
}: {
  campanhaId: string;
  inicial: BuscaDoPublico;
  salva: boolean;
  saldoHoje: number;
  tetoDoDia: number;
  suspensaAte: string | null;
  atalhos: { regioes: string[]; setores: string[] };
}) {
  const [busca, setBusca] = useState<BuscaDoPublico>(inicial);
  const [quantidade, setQuantidade] = useState(Math.min(25, saldoHoje));
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string; triar?: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (parcial: Partial<BuscaDoPublico>) => {
    setRetorno(null);
    setBusca((atual) => ({ ...atual, ...parcial }));
  };

  const salvar = (depois?: () => Promise<void>) =>
    iniciar(async () => {
      const salvo = await salvarBuscaDoPainel({ campanhaId, busca });
      if (!salvo.ok) {
        setRetorno({ tom: "erro", texto: salvo.erro });
        return;
      }
      if (depois) await depois();
      else setRetorno({ tom: "ok", texto: "Busca salva." });
    });

  const buscar = () =>
    salvar(async () => {
      const resultado = await rodarBuscaDoPainel({ campanhaId, quantidade });
      if (!resultado.ok) {
        setRetorno({ tom: "erro", texto: resultado.erro, triar: true });
        return;
      }
      const r = resultado.resumo;
      setRetorno({
        tom: "ok",
        texto: `${resultado.resultados} pessoas encontradas: ${r.novos} novas na triagem, ${r.bloqueados} bloqueadas, ${r.duplicados} repetidas, ${r.optouts} com opt-out (não entraram).`,
        triar: r.novos > 0,
      });
    });

  const travado = pendente || Boolean(suspensaAte);

  return (
    <div className="recuo mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">Busca no LinkedIn</p>
        <p className="text-xs text-tinta-fraca">
          Hoje: {tetoDoDia - saldoHoje} de {tetoDoDia} pessoas buscadas por esta conta
        </p>
      </div>
      {suspensaAte && (
        <Aviso tom="atencao">O LinkedIn limitou as buscas desta conta. A busca volta no próximo dia útil; convites e mensagens seguem.</Aviso>
      )}
      {!salva && <p className="text-xs text-tinta-fraca">Montada com os cargos do público. Escolha a região antes de buscar.</p>}
      {busca.esgotada && (
        <Aviso tom="atencao">Esta busca já trouxe todo mundo que o LinkedIn mostra com esses filtros. Mude algum filtro para achar mais gente.</Aviso>
      )}

      <div className="flex flex-col gap-2">
        <p className="rotulo">Cargos (qualquer um deles)</p>
        <ListaDeFrases nome="Cargo" itens={busca.cargos} maximo={10} maxCaracteres={80} aoMudar={(cargos) => mudar({ cargos })} desabilitado={travado} />
      </div>
      <label className="rotulo">
        Palavras-chave (opcional)
        <input
          value={busca.palavras}
          maxLength={200}
          onChange={(e) => mudar({ palavras: e.target.value })}
          placeholder="Ex.: marketplace"
          className="campo"
          disabled={travado}
        />
      </label>
      <Escolha
        rotulo="Regiões"
        tipo="LOCATION"
        campanhaId={campanhaId}
        escolhidos={busca.regioes}
        atalhos={atalhos.regioes}
        aoMudar={(regioes) => mudar({ regioes })}
        desabilitado={travado}
      />
      <Escolha
        rotulo="Setores (opcional)"
        tipo="INDUSTRY"
        campanhaId={campanhaId}
        escolhidos={busca.setores}
        atalhos={atalhos.setores}
        aoMudar={(setores) => mudar({ setores })}
        desabilitado={travado}
      />
      <p className="text-xs text-tinta-fraca">A busca do LinkedIn não filtra porte de empresa: isso entra na nota de cada pessoa.</p>

      {retorno && (
        <Aviso tom={retorno.tom}>
          {retorno.texto}{" "}
          {retorno.triar && (
            <Link href={`/triagem?campanha=${campanhaId}`} className="link">
              Ir para a triagem
            </Link>
          )}
        </Aviso>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="botao botao-primario" onClick={buscar} disabled={travado || saldoHoje === 0 || busca.regioes.length === 0}>
          <Search aria-hidden />
          {pendente ? "Buscando…" : `Buscar ${quantidade} pessoas`}
        </button>
        <select
          value={quantidade}
          onChange={(e) => setQuantidade(Number(e.target.value))}
          aria-label="Quantas pessoas buscar"
          className="campo campo-pequeno"
          disabled={travado || saldoHoje === 0}
        >
          {[10, 25, 50, 100]
            .filter((n) => n < saldoHoje)
            .concat(saldoHoje > 0 ? [saldoHoje] : [])
            .map((n) => (
              <option key={n} value={n}>
                {n === saldoHoje ? `${n} (o que resta hoje)` : n}
              </option>
            ))}
        </select>
        <button type="button" className="botao" onClick={() => salvar()} disabled={travado}>
          <Save aria-hidden />
          Salvar sem buscar
        </button>
      </div>
      {saldoHoje === 0 && <p className="text-xs text-tinta-fraca">Esta conta já buscou o teto de hoje. Amanhã tem mais.</p>}
    </div>
  );
}
