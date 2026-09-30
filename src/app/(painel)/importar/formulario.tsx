"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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

const campo = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";

function Resultado({ resposta, campanhaId }: { resposta: RespostaDaImportacao; campanhaId: string }) {
  if (!resposta.ok) return <p className="text-sm text-red-700">{resposta.erro}</p>;
  const r = resposta.resumo;
  return (
    <div className="rounded-md bg-neutral-100 p-3 text-sm">
      <p>
        {r.novos} novos na triagem · {r.bloqueados} bloqueados · {r.duplicados} duplicados · {r.optouts} com
        opt-out (não entraram) · {r.semProviderId} sem provider_id · {r.invalidas.length} linhas inválidas
        {r.comAlerta > 0 && ` · ${r.comAlerta} com alerta de cooldown`}
      </p>
      <Link href={`/triagem?campanha=${campanhaId}`} className="mt-2 inline-block underline underline-offset-2">
        Ir para a triagem
      </Link>
    </div>
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
    return <p className="text-sm text-neutral-600">Nenhuma campanha disponível. Crie uma campanha antes de importar.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="flex max-w-md flex-col gap-1 text-sm font-medium">
        Campanha
        <select value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)} className={campo}>
          {campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.perfil} · {c.nome}
            </option>
          ))}
        </select>
      </label>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">Arquivo CSV ou JSON (Apify)</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Colunas aceitas: provider_id ou URL do perfil, nome, cargo, empresa, empresa_dominio, localização, data da coleta.
        </p>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => lerArquivo(e.target.files?.[0])}
          className="mt-3 text-sm"
        />
        {erroArquivo && <p className="mt-2 text-sm text-red-700">{erroArquivo}</p>}
        {previa && (
          <div className="mt-3 text-sm">
            <p>
              {previa.pessoas.length} pessoas válidas · {previa.invalidas.length} linhas inválidas
            </p>
            {previa.invalidas.slice(0, 5).map((linha) => (
              <p key={linha.linha} className="text-xs text-neutral-500">
                Linha {linha.linha}: {linha.motivo}
              </p>
            ))}
            <ul className="mt-2 max-h-48 overflow-auto text-xs text-neutral-600">
              {previa.pessoas.slice(0, 10).map((pessoa) => (
                <li key={pessoa.urlPublica}>
                  {pessoa.nome} · {pessoa.cargo ?? "sem cargo"} · {pessoa.empresa ?? "sem empresa"}
                </li>
              ))}
            </ul>
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
              className="mt-3 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pendente ? "Importando..." : `Importar ${previa.pessoas.length} pessoas`}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">Busca na Unipile</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Cole a URL de uma busca do LinkedIn (ou Sales Navigator) ou digite palavras-chave. A busca usa a conta do perfil da
          campanha.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
            className={`${campo} min-w-80 flex-1`}
          />
          <input
            type="number"
            min={1}
            max={500}
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
            className={`${campo} w-24`}
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
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Buscar e importar
          </button>
        </div>
      </section>

      {resposta && <Resultado resposta={resposta} campanhaId={campanhaId} />}
    </div>
  );
}
