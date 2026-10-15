"use client";

import { Minus, Plus, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Aviso } from "@/components/aviso";
import type { BuscaDoPublico } from "@/domain/busca";
import { MAX_MENSAGEM, type FalaDaConversa, type MudancaNaBusca } from "@/domain/conversa-da-busca";
import type { DuvidaDaBusca } from "@/server/publicos/conversa-da-busca";
import { procurarEmpresasDoPainel } from "../acoes-das-listas";
import { conversarSobreABuscaDoPainel } from "../acoes-do-publico";

type Parametro = BuscaDoPublico["regioes"][number];

type Fala =
  | { id: number; quem: "voce"; texto: string }
  | { id: number; quem: "kakou"; texto: string; mudancas: MudancaNaBusca[]; avisos: string[]; duvidas: DuvidaDaBusca[] };

const EXEMPLOS = [
  "Diretores e heads de e-commerce em São Paulo",
  "Põe também CMO e tira o setor",
  "Cria uma lista com Magazine Luiza, Renner e C&A e busca só nelas",
];

function Digitando() {
  return (
    <li className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-linha bg-superficie-alta px-4 py-3">
      <span className="sr-only">O Kakou está montando a busca</span>
      {[0, 150, 300].map((atraso) => (
        <span key={atraso} aria-hidden className="size-1.5 animate-bounce rounded-full bg-tinta-suave" style={{ animationDelay: `${atraso}ms` }} />
      ))}
    </li>
  );
}

/**
 * A busca pela conversa (SDR-62): a pessoa diz quem quer achar e o Kakou
 * muda os filtros do formulário logo abaixo, sem salvar nem buscar. Região ou
 * setor com mais de uma opção no LinkedIn vira pergunta com botões. A
 * conversa é só desta tela: recarregou, começa de novo; a busca fica no
 * formulário.
 */
export function ConversaDaBusca({
  campanhaId,
  busca,
  aoMudar,
  desabilitado,
}: {
  campanhaId: string;
  busca: BuscaDoPublico;
  aoMudar: (parcial: Partial<BuscaDoPublico>) => void;
  desabilitado: boolean;
}) {
  const router = useRouter();
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [procura, setProcura] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const sequencia = useRef(0);
  const lista = useRef<HTMLOListElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [falas, pendente]);

  /** A lista que a conversa criou: procura as empresas no LinkedIn, de leva em leva, como a tela da lista. */
  const procurarEmpresas = async (criada: { id: string; empresas: number }) => {
    let feitas = 0;
    setProcura(`Procurando as empresas da lista no LinkedIn… 0 de ${criada.empresas}.`);
    for (;;) {
      const resultado = await procurarEmpresasDoPainel({ listaId: criada.id });
      if (!resultado.ok) {
        setProcura(null);
        setErro(`A lista foi criada, mas a procura das empresas parou: ${resultado.erro} Dá para continuar na tela da lista.`);
        break;
      }
      feitas += resultado.procuradas;
      if (resultado.faltam === 0 || resultado.procuradas === 0) {
        setProcura(null);
        break;
      }
      setProcura(`Procurando as empresas da lista no LinkedIn… ${feitas} de ${feitas + resultado.faltam}.`);
    }
    router.refresh();
  };

  const enviar = (mensagem: string) => {
    const limpa = mensagem.trim();
    if (!limpa || pendente) return;
    const historico: FalaDaConversa[] = falas.map((f) => ({ quem: f.quem, texto: f.texto }));
    const minha: Fala = { id: ++sequencia.current, quem: "voce", texto: limpa };
    setFalas((atuais) => [...atuais, minha]);
    setTexto("");
    setErro(null);
    iniciar(async () => {
      const resultado = await conversarSobreABuscaDoPainel({ campanhaId, busca, historico, mensagem: limpa });
      if (!resultado.ok) {
        // A mensagem que não deu resposta sai da conversa e volta para o campo.
        setFalas((atuais) => atuais.filter((f) => f.id !== minha.id));
        setTexto(limpa);
        setErro(resultado.erro);
        return;
      }
      const { cargos, palavras, regioes, setores, lista: listaDaBusca } = resultado.busca;
      aoMudar({ cargos, palavras, regioes, setores, lista: listaDaBusca });
      setFalas((atuais) => [
        ...atuais,
        {
          id: ++sequencia.current,
          quem: "kakou",
          texto: resultado.resposta,
          mudancas: resultado.mudancas,
          avisos: resultado.avisos,
          duvidas: resultado.duvidas,
        },
      ]);
      if (resultado.listaCriada && resultado.listaCriada.empresas > 0) void procurarEmpresas(resultado.listaCriada);
    });
  };

  /** Responde a dúvida com a opção escolhida: entra no filtro e a pergunta some. */
  const escolher = (falaId: number, duvida: DuvidaDaBusca, opcao: Parametro) => {
    const campo = duvida.tipo === "LOCATION" ? "regioes" : "setores";
    const atuais = busca[campo];
    if (!atuais.some((p) => p.id === opcao.id)) aoMudar({ [campo]: [...atuais, opcao].slice(0, 10) });
    setFalas((todas) =>
      todas.map((f) =>
        f.id === falaId && f.quem === "kakou"
          ? {
              ...f,
              duvidas: f.duvidas.filter((d) => d !== duvida),
              mudancas: [...f.mudancas, { sinal: "+" as const, texto: opcao.nome }],
            }
          : f,
      ),
    );
  };

  const aoSubmeter = (e: FormEvent) => {
    e.preventDefault();
    enviar(texto);
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(texto);
    }
  };

  const travado = desabilitado || pendente;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-destaque/25 bg-gradient-to-b from-destaque/[0.06] to-transparent">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-destaque" aria-hidden />
          Diga quem você quer achar
        </p>
        {falas.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-tinta-fraca hover:text-tinta"
            onClick={() => {
              setFalas([]);
              setErro(null);
            }}
            disabled={pendente}
          >
            <RotateCcw className="size-3" aria-hidden />
            Recomeçar conversa
          </button>
        )}
      </div>

      {falas.length === 0 ? (
        <div className="flex flex-col gap-2 px-4 pt-2 pb-1">
          <p className="text-xs text-tinta-suave">O Kakou muda os filtros aqui embaixo. Você confere e busca.</p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {EXEMPLOS.map((exemplo) => (
              <button
                key={exemplo}
                type="button"
                onClick={() => setTexto(exemplo)}
                disabled={travado}
                className="rounded-full border border-linha px-2.5 py-1 text-tinta-suave hover:border-linha-forte hover:text-tinta"
              >
                {exemplo}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol ref={lista} aria-live="polite" className="flex max-h-80 flex-col gap-3 overflow-y-auto px-4 py-3">
          {falas.map((fala) =>
            fala.quem === "voce" ? (
              <li key={fala.id} className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-destaque/30 bg-destaque/15 px-3.5 py-2 text-sm">
                {fala.texto}
              </li>
            ) : (
              <li key={fala.id} className="flex max-w-[85%] flex-col items-start gap-1.5 self-start">
                <p className="rounded-2xl rounded-bl-md border border-linha bg-superficie-alta px-3.5 py-2 text-sm">{fala.texto}</p>
                {fala.mudancas.length > 0 && (
                  <ul className="flex flex-wrap gap-1 px-1" aria-label="O que mudou na busca">
                    {fala.mudancas.map((m, n) => (
                      <li
                        key={n}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                          m.sinal === "+" ? "border-destaque/35 bg-destaque/10 text-destaque" : "border-linha text-tinta-fraca line-through"
                        }`}
                      >
                        {m.sinal === "+" ? <Plus className="size-3" aria-label="entrou" /> : <Minus className="size-3" aria-label="saiu" />}
                        {m.texto}
                      </li>
                    ))}
                  </ul>
                )}
                {fala.avisos.map((aviso) => (
                  <p key={aviso} className="px-1 text-xs text-atencao">
                    {aviso}
                  </p>
                ))}
                {fala.duvidas.map((duvida) => (
                  <div key={`${duvida.tipo}:${duvida.texto}`} className="flex flex-col gap-1 px-1">
                    <p className="text-xs text-tinta-suave">Qual {duvida.tipo === "LOCATION" ? "lugar" : "setor"} é &quot;{duvida.texto}&quot;?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {duvida.opcoes.map((opcao) => (
                        <button
                          key={opcao.id}
                          type="button"
                          className="botao botao-pequeno"
                          onClick={() => escolher(fala.id, duvida, opcao)}
                          disabled={desabilitado}
                        >
                          <Plus aria-hidden />
                          {opcao.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </li>
            ),
          )}
          {pendente && <Digitando />}
        </ol>
      )}

      <form onSubmit={aoSubmeter} className="flex items-end gap-2 p-3">
        <label htmlFor="conversa-da-busca" className="sr-only">
          Quem você quer achar
        </label>
        <textarea
          id="conversa-da-busca"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          rows={1}
          maxLength={MAX_MENSAGEM}
          placeholder={falas.length === 0 ? "Ex.: sócios de escritórios de advocacia no Rio de Janeiro" : "Ajuste a busca: põe, tira, troca…"}
          className="campo min-h-11 flex-1 resize-none"
          disabled={desabilitado}
        />
        <button type="submit" className="botao botao-primario h-11 shrink-0 px-4" disabled={travado || texto.trim().length === 0}>
          <SendHorizontal aria-hidden />
          <span className="sr-only sm:not-sr-only">Enviar</span>
        </button>
      </form>
      {procura && <p className="px-4 pb-3 text-xs text-tinta-suave">{procura}</p>}
      {erro && (
        <Aviso tom="erro" className="mx-3 mb-3">
          {erro}
        </Aviso>
      )}
    </div>
  );
}
