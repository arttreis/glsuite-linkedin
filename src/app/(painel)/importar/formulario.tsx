"use client";

import { FileUp, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import {
  ehLinhaInvalida,
  lerArquivoDeImportacao,
  normalizarPessoa,
  type LinhaInvalida,
  type PessoaImportada,
} from "@/domain/importacao";
import { importarArquivo, importarBuscaDaUnipile, type RespostaDaImportacao } from "./acoes";

export type OpcaoDeCampanha = { id: string; nome: string; perfil: string };

type Previa = { arquivoNome: string; pessoas: PessoaImportada[]; invalidas: LinhaInvalida[] };

function Resultado({ resposta, campanhaId }: { resposta: RespostaDaImportacao; campanhaId: string }) {
  if (!resposta.ok) return <Aviso tom="erro">{resposta.erro}</Aviso>;
  const r = resposta.resumo;
  const numeros: [string, number][] = [
    ["Novos na triagem", r.novos],
    ["Bloqueados", r.bloqueados],
    ["Duplicados", r.duplicados],
    ["Com opt-out (não entraram)", r.optouts],
    ["Sem provider_id", r.semProviderId],
    ["Linhas inválidas", r.invalidas.length],
    ...(r.comAlerta > 0 ? ([["Com alerta de cooldown", r.comAlerta]] as [string, number][]) : []),
  ];
  return (
    <Aviso tom="ok">
      <p className="font-medium">Importação concluída.</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-3">
            <dt className="text-tinta-suave">{rotulo}</dt>
            <dd className="tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/triagem?campanha=${campanhaId}`} className="link mt-3 inline-block">
        Ir para a triagem
      </Link>
    </Aviso>
  );
}

export function FormularioImportacao({ campanhas }: { campanhas: OpcaoDeCampanha[] }) {
  const [campanhaId, setCampanhaId] = useState(campanhas[0]?.id ?? "");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [resposta, setResposta] = useState<RespostaDaImportacao | null>(null);
  const [consulta, setConsulta] = useState("");
  const [limite, setLimite] = useState(50);
  const [pendente, iniciar] = useTransition();

  async function lerArquivo(arquivo: File | undefined) {
    setResposta(null);
    setPrevia(null);
    setErroArquivo(null);
    if (!arquivo) return;
    try {
      const objetos = lerArquivoDeImportacao(arquivo.name, await arquivo.text());
      const pessoas: PessoaImportada[] = [];
      const invalidas: LinhaInvalida[] = [];
      objetos.forEach((objeto, indice) => {
        const resultado = normalizarPessoa(objeto, indice + 2);
        if (ehLinhaInvalida(resultado)) invalidas.push(resultado);
        else pessoas.push(resultado);
      });
      setPrevia({ arquivoNome: arquivo.name, pessoas, invalidas });
    } catch (erro) {
      setErroArquivo(`Não consegui ler o arquivo: ${(erro as Error).message}`);
    }
  }

  if (campanhas.length === 0) {
    return (
      <div className="vazio">
        <p>Nenhuma campanha disponível. Crie uma campanha antes de importar.</p>
        <Link href="/campanhas/nova" className="botao botao-primario">
          <Plus aria-hidden />
          Nova campanha
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="rotulo max-w-md">
        Campanha
        <select value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)} className="campo">
          {campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.perfil}: {c.nome}
            </option>
          ))}
        </select>
      </label>

      <section className="cartao p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <FileUp className="size-4 text-tinta-fraca" aria-hidden />
          Arquivo CSV ou JSON (Apify)
        </h2>
        <p className="mt-1.5 text-[13px] text-tinta-suave">
          Colunas aceitas: provider_id ou URL do perfil, nome, cargo, empresa, empresa_dominio, localização, data da coleta.
        </p>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          aria-label="Arquivo da lista"
          onChange={(e) => lerArquivo(e.target.files?.[0])}
          className="campo-arquivo mt-4 block"
        />
        {erroArquivo && (
          <Aviso tom="erro" className="mt-4">
            {erroArquivo}
          </Aviso>
        )}
        {previa && (
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <p>
              <span className="tabular-nums">{previa.pessoas.length}</span> pessoas válidas e{" "}
              <span className="tabular-nums">{previa.invalidas.length}</span> linhas inválidas
            </p>
            {previa.invalidas.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-xs text-tinta-fraca">
                {previa.invalidas.slice(0, 5).map((linha) => (
                  <li key={linha.linha}>
                    Linha {linha.linha}: {linha.motivo}
                  </li>
                ))}
              </ul>
            )}
            <ul className="recuo max-h-48 overflow-auto text-xs">
              {previa.pessoas.slice(0, 10).map((pessoa) => (
                <li key={pessoa.urlPublica} className="py-0.5">
                  <span className="text-tinta">{pessoa.nome}</span>, {pessoa.cargo ?? "sem cargo"}, {pessoa.empresa ?? "sem empresa"}
                </li>
              ))}
            </ul>
            <div>
              <button
                type="button"
                disabled={pendente || previa.pessoas.length === 0}
                onClick={() =>
                  iniciar(async () => {
                    setResposta(
                      await importarArquivo({
                        campanhaId,
                        fonte: previa.arquivoNome.toLowerCase().endsWith(".json") ? "apify" : "csv",
                        arquivoNome: previa.arquivoNome,
                        pessoas: previa.pessoas,
                        invalidas: previa.invalidas,
                      }),
                    );
                  })
                }
                className="botao botao-primario"
              >
                {pendente ? "Importando..." : `Importar ${previa.pessoas.length} pessoas`}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="cartao p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Search className="size-4 text-tinta-fraca" aria-hidden />
          Busca na Unipile
        </h2>
        <p className="mt-1.5 text-[13px] text-tinta-suave">
          Cole a URL de uma busca do LinkedIn (ou Sales Navigator) ou digite palavras-chave. A busca usa a conta do perfil da
          campanha.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            aria-label="Busca do LinkedIn ou palavras-chave"
            placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
            className="campo min-w-0 flex-1 basis-72"
          />
          <input
            type="number"
            min={1}
            max={500}
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
            className="campo w-24 tabular-nums"
            aria-label="Máximo de resultados"
          />
          <button
            type="button"
            disabled={pendente || consulta.trim().length < 2}
            onClick={() =>
              iniciar(async () => {
                setResposta(await importarBuscaDaUnipile({ campanhaId, consulta, limite }));
              })
            }
            className="botao"
          >
            Buscar e importar
          </button>
        </div>
      </section>

      {resposta && <Resultado resposta={resposta} campanhaId={campanhaId} />}
    </div>
  );
}
