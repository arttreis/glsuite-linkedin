"use client";

import { ArrowRight, FileUp, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { ResultadoDaImportacao, type RespostaDaImportacao } from "@/components/resultado-da-importacao";
import {
  ehLinhaInvalida,
  lerArquivoDeImportacao,
  normalizarPessoa,
  type LinhaInvalida,
  type PessoaImportada,
} from "@/domain/importacao";
import { importarArquivo } from "./acoes";

export type OpcaoDeCampanha = { id: string; nome: string; perfil: string };

type Previa = { arquivoNome: string; pessoas: PessoaImportada[]; invalidas: LinhaInvalida[] };

export function FormularioImportacao({ campanhas }: { campanhas: OpcaoDeCampanha[] }) {
  const [campanhaId, setCampanhaId] = useState(campanhas[0]?.id ?? "");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [resposta, setResposta] = useState<RespostaDaImportacao | null>(null);
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
          Busca no LinkedIn
        </h2>
        <p className="mt-1.5 text-[13px] text-tinta-suave">
          Busque por cargo, empresa, local e setor (ou cole a URL de uma busca), confira a prévia e leve para a triagem só quem
          fizer sentido.
        </p>
        <Link href={`/buscar?campanha=${campanhaId}`} className="botao mt-4">
          Buscar leads
          <ArrowRight aria-hidden />
        </Link>
      </section>

      {resposta && <ResultadoDaImportacao resposta={resposta} campanhaId={campanhaId} />}
    </div>
  );
}
