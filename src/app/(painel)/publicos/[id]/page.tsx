import { Check, FileUp, ListFilter, Pencil, Plug, Send, Workflow } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDaCampanha } from "@/components/etiquetas";
import { NOME_DA_PRACA } from "@/domain/publico";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { calcularFunil, type LinhaDoFunil } from "@/server/metricas/funil";
import { contasDoPublico, type ContaDoPublico } from "@/server/publicos/abordagem";
import { obterPublico, type PublicoSalvo } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";
import { comecarAAbordarDoPainel } from "../acoes";
import { BotaoDeStatus, ResumoDoPublico } from "../resumo";

const ABAS = [
  { valor: "quem", rotulo: "Quem" },
  { valor: "leads", rotulo: "Leads" },
  { valor: "abordagem", rotulo: "Abordagem" },
  { valor: "resultados", rotulo: "Resultados" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

const porcentagem = (taxa: number | null) => (taxa === null ? "sem amostra" : `${Math.round(taxa * 100)}%`);

function SituacaoDaConta({ conta }: { conta: ContaDoPublico }) {
  if (!conta.conectado) return <span className="etiqueta etiqueta-ponto etiqueta-atencao">LinkedIn não conectado</span>;
  if (conta.status !== "ativo") return <span className="etiqueta etiqueta-ponto etiqueta-atencao">Conta pausada</span>;
  return <span className="etiqueta etiqueta-ponto etiqueta-ok">Conta ativa</span>;
}

function SemConta({ p }: { p: PublicoSalvo }) {
  return (
    <Aviso tom="atencao">
      Nenhuma conta do LinkedIn que você opera é da praça {NOME_DA_PRACA[p.praca]}.{" "}
      <Link href="/perfis" className="link">
        Conectar uma conta
      </Link>
    </Aviso>
  );
}

function AbaLeads({ p, contas }: { p: PublicoSalvo; contas: ContaDoPublico[] }) {
  if (contas.length === 0) return <SemConta p={p} />;
  return (
    <ul className="grid gap-3">
      {contas.map((conta) => (
        <li key={conta.perfilId} className="cartao p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">{conta.nome}</p>
            <SituacaoDaConta conta={conta} />
          </div>
          {conta.campanha ? (
            <>
              <p className="mt-3 text-sm text-tinta-suave">
                {conta.campanha.emTriagem} para triar · {conta.campanha.naRegua} na régua · {conta.campanha.emConversa} em conversa
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/triagem?campanha=${conta.campanha.id}`} className="botao botao-pequeno botao-primario">
                  <ListFilter aria-hidden />
                  Triar {conta.campanha.emTriagem > 0 ? `${conta.campanha.emTriagem} leads` : "leads"}
                </Link>
                <Link href={`/importar?campanha=${conta.campanha.id}`} className="botao botao-pequeno">
                  <FileUp aria-hidden />
                  Importar lista
                </Link>
              </div>
            </>
          ) : (
            <form action={comecarAAbordarDoPainel} className="mt-4 flex flex-wrap items-center gap-3">
              <input type="hidden" name="publicoId" value={p.id} />
              <input type="hidden" name="perfilId" value={conta.perfilId} />
              <button type="submit" className="botao botao-pequeno botao-primario">
                <Send aria-hidden />
                Começar a abordar com esta conta
              </button>
              <span className="text-xs text-tinta-fraca">Cria a campanha deste público nesta conta, em rascunho. Nada é enviado ainda.</span>
            </form>
          )}
          {!conta.conectado && (
            <p className="mt-3 text-xs text-tinta-fraca">
              Sem LinkedIn conectado, a campanha não envia.{" "}
              <Link href="/perfis" className="link">
                Conectar
              </Link>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function AbaAbordagem({ p, contas }: { p: PublicoSalvo; contas: ContaDoPublico[] }) {
  const comCampanha = contas.filter((c) => c.campanha);
  if (contas.length === 0) return <SemConta p={p} />;
  if (comCampanha.length === 0) {
    return (
      <p className="vazio">
        Nenhuma conta aborda este público ainda.{" "}
        <Link href={`/publicos/${p.id}?aba=leads`} className="link">
          Comece pela aba Leads
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="grid gap-3">
      {comCampanha.map(({ campanha, nome, perfilId }) => (
        <li key={perfilId} className="cartao p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{nome}</p>
              <p className="text-xs text-tinta-fraca">Campanha {campanha!.nome}</p>
            </div>
            <EtiquetaDaCampanha status={campanha!.status} />
          </div>
          <p className="mt-3 text-sm text-tinta-suave">
            Ângulo: <span className="text-tinta">{p.angulo}</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/campanhas/${campanha!.id}`} className="botao botao-pequeno botao-primario">
              <Workflow aria-hidden />
              {campanha!.status === "rascunho" ? "Escrever as mensagens e ativar" : "Ver o fluxo"}
            </Link>
            {campanha!.aguardandoAprovacao > 0 && (
              <Link href="/aprovacao" className="botao botao-pequeno">
                <Check aria-hidden />
                {campanha!.aguardandoAprovacao} para aprovar
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AbaResultados({ linhas, leituraMinima }: { linhas: LinhaDoFunil[]; leituraMinima: number }) {
  if (linhas.length === 0) return <p className="vazio">Ainda sem toques. Os números aparecem quando o primeiro convite sair.</p>;
  return (
    <>
      <div className="tabela-moldura">
        <table className="tabela">
          <thead>
            <tr>
              <th>Conta</th>
              <th className="numero">Convites</th>
              <th className="numero">Aceite</th>
              <th className="numero">Respostas</th>
              <th className="numero">Resposta / aceite</th>
              <th className="numero">Conversas</th>
              <th className="numero">Reuniões</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave}>
                <td>{l.perfil}</td>
                <td className="numero">{l.convites}</td>
                <td className="numero">{porcentagem(l.taxaAceite)}</td>
                <td className="numero">{l.respostas}</td>
                <td className="numero">{porcentagem(l.taxaRespostaSobreAceite)}</td>
                <td className="numero">{l.conversas}</td>
                <td className="numero">{l.reunioes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-tinta-fraca">As taxas aparecem a partir de {leituraMinima} toques por conta. Antes disso, é sorte.</p>
    </>
  );
}

export default async function PublicoPage({ params, searchParams }: PageProps<"/publicos/[id]">) {
  const operador = await exigirOperador();
  const { id } = await params;
  const { aba: abaPedida, msg } = await searchParams;
  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const publico = await obterPublico(tx, id);
    if (!publico) return null;
    const ativo = publico.status === "ativo";
    return {
      publico,
      contas: ativo ? await contasDoPublico(tx, id) : [],
      funil: ativo ? await calcularFunil(tx, { publicoId: id }) : null,
    };
  });
  if (!dados) notFound();
  const { publico: p, contas, funil } = dados;
  const ativo = p.status === "ativo";
  const aba: Aba = ativo && ABAS.some((a) => a.valor === abaPedida) ? (abaPedida as Aba) : "quem";
  const semCampanha = contas.every((c) => !c.campanha);

  return (
    <>
      <Cabecalho
        titulo={p.nome}
        descricao={`${NOME_DA_PRACA[p.praca]} · ${p.status === "sugerido" ? "sugestão da IA, ainda não escolhida" : p.status === "arquivado" ? "arquivado" : "escolhido"}`}
        voltar={{ href: "/publicos", rotulo: "Públicos" }}
      >
        {p.status === "sugerido" && (
          <BotaoDeStatus id={p.id} acao="escolher" rotulo="Escolher este público" icone={<Check aria-hidden />} principal volta={`/publicos/${p.id}`} />
        )}
        {ativo && semCampanha && aba !== "leads" && (
          <Link href={`/publicos/${p.id}?aba=leads`} className="botao botao-primario">
            <Send aria-hidden />
            Começar a abordar
          </Link>
        )}
        {p.status !== "arquivado" && (
          <Link href={`/publicos/${p.id}/editar`} className="botao">
            <Pencil aria-hidden />
            Editar
          </Link>
        )}
      </Cabecalho>

      <div className="max-w-4xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}
        {p.desatualizado && p.status !== "arquivado" && (
          <Aviso tom="atencao" className="mb-5">
            O dossiê foi confirmado de novo depois deste público. Revise se ele ainda faz sentido e salve.
          </Aviso>
        )}

        <nav aria-label="Partes do público" className="segmentos mb-5">
          {ABAS.map((a) =>
            ativo || a.valor === "quem" ? (
              <Link
                key={a.valor}
                href={`/publicos/${p.id}?aba=${a.valor}`}
                className="segmento"
                aria-current={aba === a.valor ? "page" : undefined}
              >
                {a.rotulo}
              </Link>
            ) : (
              <span key={a.valor} className="segmento cursor-not-allowed opacity-50" title="Escolha o público antes">
                {a.rotulo}
              </span>
            ),
          )}
        </nav>

        {aba === "quem" && (
          <div className="cartao p-5">
            <ResumoDoPublico p={p} />
            {p.status === "sugerido" && (
              <p className="mt-4 text-sm text-tinta-suave">Escolha o público para abrir as abas de leads, abordagem e resultados.</p>
            )}
          </div>
        )}
        {aba === "leads" && <AbaLeads p={p} contas={contas} />}
        {aba === "abordagem" && <AbaAbordagem p={p} contas={contas} />}
        {aba === "resultados" && funil && <AbaResultados linhas={funil.porPerfil} leituraMinima={funil.leituraMinima} />}
        {aba !== "quem" && contas.length > 0 && contas.some((c) => !c.conectado || c.status !== "ativo") && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-tinta-fraca">
            <Plug className="size-3.5" aria-hidden />
            Conta pausada ou sem LinkedIn não envia nada. Ative em{" "}
            <Link href="/perfis" className="link">
              Contas do LinkedIn
            </Link>
            .
          </p>
        )}
      </div>
    </>
  );
}
