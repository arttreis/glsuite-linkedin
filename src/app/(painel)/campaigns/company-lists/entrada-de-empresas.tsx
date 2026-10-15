"use client";

import { useState } from "react";
import { empresasUnicas, lerNomesDeEmpresas, NOMES_POR_ENVIO } from "@/domain/lista-de-empresas";

/** Os nomes em partes de até `NOMES_POR_ENVIO`, para cada chamada ao servidor caber no limite. */
export function emPartes(nomes: readonly string[]): string[][] {
  const partes: string[][] = [];
  for (let inicio = 0; inicio < nomes.length; inicio += NOMES_POR_ENVIO) partes.push(nomes.slice(inicio, inicio + NOMES_POR_ENVIO));
  return partes;
}

/** Empresas lidas do texto e do arquivo, já sem repetidas. */
export type EmpresasLidas = { nomes: string[]; repetidas: number };

/**
 * Onde a pessoa põe os nomes das empresas: colando, um por linha, ou subindo
 * um CSV/TXT. O arquivo é lido no navegador; a tela mostra quantas empresas
 * vão entrar antes de mandar.
 */
export function EntradaDeEmpresas({ aoMudar, desabilitado }: { aoMudar: (lidas: EmpresasLidas) => void; desabilitado: boolean }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<{ nome: string; nomes: string[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const juntar = (novoTexto: string, novoArquivo: typeof arquivo) => {
    const { empresas, repetidas } = empresasUnicas([...lerNomesDeEmpresas(novoTexto), ...(novoArquivo?.nomes ?? [])]);
    aoMudar({ nomes: empresas.map((e) => e.nome), repetidas });
    return { total: empresas.length, repetidas };
  };
  const [contagem, setContagem] = useState({ total: 0, repetidas: 0 });

  async function lerArquivo(escolhido: File | undefined) {
    setErro(null);
    if (!escolhido) {
      setArquivo(null);
      setContagem(juntar(texto, null));
      return;
    }
    try {
      const lido = { nome: escolhido.name, nomes: lerNomesDeEmpresas(await escolhido.text(), escolhido.name) };
      setArquivo(lido);
      setContagem(juntar(texto, lido));
      if (lido.nomes.length === 0) setErro("Não achei nomes de empresa nesse arquivo.");
    } catch (falha) {
      setErro(`Não consegui ler o arquivo: ${(falha as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="rotulo">
        Cole os nomes das empresas, um por linha
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setContagem(juntar(e.target.value, arquivo));
          }}
          rows={8}
          placeholder={"Ex.:\nAcme Administração Judicial\nBrasil Recuperações"}
          className="campo w-full"
          disabled={desabilitado}
        />
      </label>
      <label className="rotulo">
        Ou suba uma planilha (.csv ou .txt)
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(e) => lerArquivo(e.target.files?.[0])}
          className="campo-arquivo block"
          disabled={desabilitado}
        />
      </label>
      <p className="text-xs text-tinta-fraca">
        Na planilha, vale a coluna chamada empresa, nome, company ou razão social; sem uma delas, a primeira coluna. Pode ser só a lista de
        nomes, sem cabeçalho.
      </p>
      {erro && <p className="text-xs text-tinta-suave">{erro}</p>}
      {contagem.total > 0 && (
        <p className="text-sm">
          <span className="tabular-nums font-medium">{contagem.total}</span> {contagem.total === 1 ? "empresa vai entrar" : "empresas vão entrar"}
          {contagem.repetidas > 0 && (
            <span className="text-tinta-suave">
              {" "}
              ({contagem.repetidas} {contagem.repetidas === 1 ? "repetida entra" : "repetidas entram"} uma vez só)
            </span>
          )}
          .
        </p>
      )}
    </div>
  );
}
