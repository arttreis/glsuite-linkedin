"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import {
  contatosUnicos,
  LINHAS_POR_ENVIO,
  lerPlanilhaDeContatos,
  lerTags,
  MAX_LINHAS_POR_IMPORTACAO,
  telefoneLegivel,
  type PlanilhaLida,
} from "@/domain/contatos";
import { importarContatosDoPainel } from "../acoes";

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: "Nome",
  telefone: "Telefone",
  email: "E-mail",
  empresa: "Empresa",
  cargo: "Cargo",
  tags: "Tags",
};

const NA_TELA = 8;

/**
 * Importar contatos (§4.15): cola ou sobe a planilha, confere o que o Kakou
 * leu, marca a autorização do WhatsApp e importa em partes.
 */
export function Importacao({ organizacao }: { organizacao: string }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [tagsParaTodos, setTagsParaTodos] = useState("");
  const [autorizou, setAutorizou] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [fim, setFim] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const lida: (PlanilhaLida & { repetidos: number }) | null = useMemo(() => {
    if (!texto.trim()) return null;
    const planilha = lerPlanilhaDeContatos(texto);
    const { contatos, repetidos } = contatosUnicos(planilha.contatos);
    return { ...planilha, contatos, repetidos };
  }, [texto]);
  const comTelefone = lida?.contatos.filter((c) => c.telefone).length ?? 0;

  const lerArquivo = async (lista: FileList | null) => {
    const escolhido = lista?.[0];
    if (!escolhido) return;
    setFim(null);
    setArquivo(escolhido.name);
    setTexto(await escolhido.text());
  };

  const importar = () =>
    iniciar(async () => {
      if (!lida) return;
      setFim(null);
      let importacaoId: string | null = null;
      const total = { criados: 0, atualizados: 0, tagsCriadas: 0 };
      for (let inicio = 0; inicio < lida.contatos.length; inicio += LINHAS_POR_ENVIO) {
        setProgresso(`Importando: ${inicio} de ${lida.contatos.length}…`);
        const parte = lida.contatos.slice(inicio, inicio + LINHAS_POR_ENVIO).map((c) => ({
          nome: c.nome,
          primeiroNome: c.primeiroNome,
          telefone: c.telefone,
          email: c.email,
          empresa: c.empresa,
          cargo: c.cargo,
          tags: c.tags,
        }));
        const resultado = await importarContatosDoPainel({
          importacaoId,
          arquivoNome: arquivo,
          autorizacaoWhatsapp: autorizou,
          tagsParaTodos: lerTags(tagsParaTodos),
          contatos: parte,
        });
        if (!resultado.ok) {
          setProgresso(null);
          setFim({
            tom: "erro",
            texto: inicio === 0 ? resultado.erro : `Entraram ${inicio} contatos, mas o resto não: ${resultado.erro} Importe de novo o que faltou.`,
          });
          return;
        }
        importacaoId = resultado.importacaoId;
        total.criados += resultado.criados;
        total.atualizados += resultado.atualizados;
        total.tagsCriadas += resultado.tagsCriadas;
      }
      setProgresso(null);
      const novos = total.criados === 1 ? "1 contato novo" : `${total.criados} contatos novos`;
      const completados = total.atualizados === 1 ? "1 que já existia e foi completado" : `${total.atualizados} que já existiam e foram completados`;
      const tagsNovas = total.tagsCriadas === 1 ? ", com 1 tag nova" : total.tagsCriadas > 1 ? `, com ${total.tagsCriadas} tags novas` : "";
      setFim({ tom: "ok", texto: `Pronto: ${novos} e ${completados}${tagsNovas}.` });
      setTexto("");
      setArquivo(null);
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-planilha">
        <h2 id="titulo-planilha" className="text-[15px] font-semibold">
          A planilha
        </h2>
        <p className="text-[13px] text-tinta-suave">
          A primeira linha é o cabeçalho. O Kakou reconhece as colunas pelo nome: nome, telefone (ou celular, whatsapp), e-mail, empresa,
          cargo e tags (separadas por vírgula). Cada linha precisa de telefone ou e-mail. Até {MAX_LINHAS_POR_IMPORTACAO.toLocaleString("pt-BR")}{" "}
          linhas por vez.
        </p>
        <label className="rotulo">
          Arquivo CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="campo-arquivo" disabled={pendente} onChange={(e) => lerArquivo(e.target.files)} />
        </label>
        <label className="rotulo">
          Ou cole aqui (de uma planilha, com o cabeçalho)
          <textarea
            value={texto}
            onChange={(e) => {
              setFim(null);
              setArquivo(null);
              setTexto(e.target.value);
            }}
            rows={6}
            placeholder={"nome;telefone;email;empresa;tags\nMaria Souza;(11) 99999-8888;maria@acme.com;Acme;cliente, vip"}
            className="campo font-mono text-xs"
            disabled={pendente}
          />
        </label>
      </section>

      {lida && (
        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-leitura">
          <h2 id="titulo-leitura" className="text-[15px] font-semibold">
            O que o Kakou leu
          </h2>
          <p className="text-sm">
            <span className="tabular-nums font-medium">{lida.contatos.length.toLocaleString("pt-BR")}</span> contatos prontos para entrar
            {lida.repetidos > 0 && `, ${lida.repetidos} repetidos juntados`}
            {lida.recusadas.length > 0 && `, ${lida.recusadas.length} linhas que não entram`}
            {lida.alemDoTeto > 0 && `, ${lida.alemDoTeto} além do limite desta vez`}.
          </p>
          {Object.keys(lida.colunas).length > 0 && (
            <p className="text-[13px] text-tinta-suave">
              Colunas: {Object.entries(lida.colunas).map(([campo, coluna]) => `${ROTULO_DO_CAMPO[campo]} ← "${coluna}"`).join(" · ")}
            </p>
          )}
          {lida.contatos.length > 0 && (
            <div className="tabela-moldura">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th>Empresa</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {lida.contatos.slice(0, NA_TELA).map((c) => (
                    <tr key={c.linha}>
                      <td>{c.nome}</td>
                      <td className="tabular-nums">{c.telefone ? telefoneLegivel(c.telefone) : ""}</td>
                      <td>{c.email}</td>
                      <td>{c.empresa}</td>
                      <td className="text-xs text-tinta-suave">{c.tags.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lida.contatos.length > NA_TELA && <p className="text-xs text-tinta-fraca">e mais {lida.contatos.length - NA_TELA}.</p>}
          {lida.recusadas.length > 0 && (
            <details>
              <summary className="text-[13px] text-tinta-suave">Linhas que não entram ({lida.recusadas.length})</summary>
              <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                {lida.recusadas.slice(0, 50).map((r) => (
                  <li key={r.linha}>
                    Linha {r.linha}: {r.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {lida && lida.contatos.length > 0 && (
        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-importar">
          <h2 id="titulo-importar" className="text-[15px] font-semibold">
            Importar
          </h2>
          <label className="rotulo max-w-md">
            Pôr estas tags em todos (opcional)
            <input
              value={tagsParaTodos}
              onChange={(e) => setTagsParaTodos(e.target.value)}
              placeholder="Ex.: evento-sp, outubro"
              className="campo campo-pequeno"
              disabled={pendente}
            />
          </label>
          {comTelefone > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={autorizou} onChange={(e) => setAutorizou(e.target.checked)} disabled={pendente} />
              <span>
                Estas pessoas autorizaram receber mensagens da {organizacao} pelo WhatsApp.
                <span className="block text-[13px] text-tinta-suave">
                  Sem esta marca, os contatos entram, mas não recebem disparo pelo WhatsApp. A marca fica guardada com o seu nome e a data. Quem já
                  saiu do WhatsApp continua de fora.
                </span>
              </span>
            </label>
          )}
          {fim?.tom === "erro" && <Aviso tom="erro">{fim.texto}</Aviso>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="botao botao-primario" onClick={importar} disabled={pendente}>
              <Upload aria-hidden />
              {pendente ? "Importando…" : `Importar ${lida.contatos.length.toLocaleString("pt-BR")} contatos`}
            </button>
            {progresso && <span className="text-xs text-tinta-fraca">{progresso}</span>}
          </div>
        </section>
      )}

      {fim?.tom === "ok" && (
        <Aviso tom="ok">
          {fim.texto}{" "}
          <Link href="/contacts" className="link">
            Ver os contatos
          </Link>
        </Aviso>
      )}
    </div>
  );
}
