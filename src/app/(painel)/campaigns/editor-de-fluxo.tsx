"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type XYPosition,
} from "@xyflow/react";
import {
  CircleAlert,
  ClipboardList,
  Clock,
  Flag,
  MessageSquare,
  Play,
  Split,
  Trash2,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ROTULO_DO_TIPO,
  tetoDoBloco,
  type ArestaDoFluxo,
  type Fluxo,
  type NodeDoFluxo,
  type ProblemaDoBloco,
  type ProblemaDoFluxo,
  type Saida,
  type TipoDeNode,
} from "@/domain/fluxo";

type Props = {
  fluxo: Fluxo;
  onChange(f: Fluxo): void;
  problemasDeCopy: ProblemaDoBloco[];
  problemasDoFluxo: ProblemaDoFluxo[];
};

/** Erro de copy impede salvar; problema de forma só impede ativar. */
type Gravidade = "erro" | "atencao";
type DadosDoBloco = { node: NodeDoFluxo; problema: Gravidade | null };
type BlocoDoCanvas = Node<DadosDoBloco, "bloco">;
type Selecao = { tipo: "bloco" | "seta"; id: string } | null;

const LARGURA_DO_BLOCO = 224;
const DESCIDA = 150;

// ---------------------------------------------------------------------------
// Como cada bloco aparece

function tituloDoBloco(node: NodeDoFluxo): string {
  if (node.tipo === "condicao") return node.condicao === "aceitou" ? "Aceitou o convite?" : "Já é conexão?";
  return ROTULO_DO_TIPO[node.tipo];
}

const ICONE_DO_TIPO: Record<TipoDeNode, LucideIcon> = {
  inicio: Play,
  convite: UserPlus,
  esperar: Clock,
  condicao: Split,
  mensagem: MessageSquare,
  tarefa: ClipboardList,
  fim: Flag,
};

const diasUteis = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;

function resumoDoBloco(node: NodeDoFluxo): string {
  switch (node.tipo) {
    case "inicio":
      return "O lead aprovado na triagem entra aqui";
    case "convite":
      return node.template.trim() || "Sem nota";
    case "esperar":
      return node.dias_uteis === 0 ? "Sem espera" : `Esperar ${diasUteis(node.dias_uteis)}`;
    case "condicao":
      if (node.condicao === "conectado") return "Conexão de 1º grau";
      return node.prazo_dias_uteis ? `Prazo de ${diasUteis(node.prazo_dias_uteis)}` : "Prazo padrão: 21 dias corridos";
    case "mensagem":
      return node.template.trim() || "Sem texto";
    case "tarefa":
      return node.roteiro.trim() || "Sem roteiro";
    case "fim":
      return node.resultado === "pausa_60" ? "Fim: pausa de 60 dias e volta com ângulo diferente" : "Fim: sem resposta";
  }
}

function BlocoDoFluxo({ data, selected }: NodeProps<BlocoDoCanvas>) {
  const { node, problema } = data;
  const Icone = ICONE_DO_TIPO[node.tipo];
  const borda = selected
    ? "border-destaque shadow-[0_0_0_3px_rgb(95_227_154/0.18)]"
    : problema === "erro"
      ? "border-erro/70"
      : problema === "atencao"
        ? "border-atencao/60"
        : "border-linha-forte";
  return (
    <div
      style={{ width: LARGURA_DO_BLOCO }}
      className={`relative rounded-xl border bg-superficie-alta px-3 py-2.5 text-left ${borda} ${node.tipo === "condicao" ? "pb-6" : ""}`}
    >
      {node.tipo !== "inicio" && <Handle type="target" position={Position.Top} />}
      <div className="flex items-center gap-2 text-[13px] font-medium text-tinta">
        <Icone className="size-4 shrink-0 text-tinta-suave" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{tituloDoBloco(node)}</span>
        {problema === "erro" && <CircleAlert className="size-4 shrink-0 text-erro" aria-label="Texto com problema" />}
        {problema === "atencao" && <TriangleAlert className="size-4 shrink-0 text-atencao" aria-label="Bloco incompleto" />}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-tinta-suave">{resumoDoBloco(node)}</p>
      {node.tipo === "condicao" ? (
        <>
          <span className="absolute bottom-1.5 left-1/4 -translate-x-1/2 text-[11px] text-ok">sim</span>
          <span className="absolute bottom-1.5 left-3/4 -translate-x-1/2 text-[11px] text-tinta-fraca">não</span>
          <Handle type="source" id="sim" position={Position.Bottom} style={{ left: "25%" }} />
          <Handle type="source" id="nao" position={Position.Bottom} style={{ left: "75%" }} />
        </>
      ) : (
        node.tipo !== "fim" && <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const TIPOS_DE_NODE = { bloco: BlocoDoFluxo };

// ---------------------------------------------------------------------------
// Paleta: blocos que dá para adicionar (o Início já existe e é único)

const PALETA: { chave: string; rotulo: string; Icone: LucideIcon; criar(id: string, posicao: XYPosition): NodeDoFluxo }[] = [
  { chave: "convite", rotulo: "Convite", Icone: UserPlus, criar: (id, posicao) => ({ id, posicao, tipo: "convite", template: "" }) },
  { chave: "esperar", rotulo: "Esperar", Icone: Clock, criar: (id, posicao) => ({ id, posicao, tipo: "esperar", dias_uteis: 2 }) },
  {
    chave: "condicao",
    rotulo: "Aceitou o convite?",
    Icone: Split,
    criar: (id, posicao) => ({ id, posicao, tipo: "condicao", condicao: "aceitou", prazo_dias_uteis: null }),
  },
  {
    chave: "condicao",
    rotulo: "Já é conexão?",
    Icone: Split,
    criar: (id, posicao) => ({ id, posicao, tipo: "condicao", condicao: "conectado" }),
  },
  { chave: "mensagem", rotulo: "Mensagem", Icone: MessageSquare, criar: (id, posicao) => ({ id, posicao, tipo: "mensagem", template: "" }) },
  { chave: "fim", rotulo: "Fim", Icone: Flag, criar: (id, posicao) => ({ id, posicao, tipo: "fim", resultado: "sem_resposta" }) },
];

/** Id novo no padrão do schema; os ids existentes nunca mudam (as ações apontam para eles). */
function novoId(prefixo: string, existentes: Set<string>): string {
  for (;;) {
    const id = `${prefixo}-${Math.random().toString(36).slice(2, 8)}`;
    if (!existentes.has(id)) return id;
  }
}

const idDaSeta = (a: ArestaDoFluxo) => `${a.de}>${a.para}>${a.saida ?? ""}`;

// ---------------------------------------------------------------------------

export function EditorDeFluxo(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ fluxo, onChange, problemasDeCopy, problemasDoFluxo }: Props) {
  const reactFlow = useReactFlow<BlocoDoCanvas, Edge>();
  const moldura = useRef<HTMLDivElement>(null);
  const [selecao, setSelecao] = useState<Selecao>(null);
  // O React Flow mede os blocos; sem guardar a medida, cada mudança do fluxo os esconderia até medir de novo.
  const [medidas, setMedidas] = useState<Record<string, { width: number; height: number }>>({});
  // Posição durante o arraste; vai para o fluxo quando o bloco é solto.
  const [arrastando, setArrastando] = useState<Record<string, XYPosition>>({});

  const copyComProblema = useMemo(() => problemasDeCopy.filter((p) => p.violacoes.length > 0), [problemasDeCopy]);
  const gravidade = useMemo(() => {
    const mapa = new Map<string, Gravidade>();
    for (const p of problemasDoFluxo) if (p.nodeId) mapa.set(p.nodeId, "atencao");
    for (const p of copyComProblema) mapa.set(p.toque, "erro");
    return mapa;
  }, [problemasDoFluxo, copyComProblema]);

  const nodes = useMemo<BlocoDoCanvas[]>(
    () =>
      fluxo.nodes.map((node, indice) => ({
        id: node.id,
        type: "bloco",
        position: arrastando[node.id] ?? node.posicao ?? { x: 0, y: indice * DESCIDA },
        data: { node, problema: gravidade.get(node.id) ?? null },
        selected: selecao?.tipo === "bloco" && selecao.id === node.id,
        deletable: node.tipo !== "inicio",
        ...(medidas[node.id] ? { measured: medidas[node.id] } : {}),
      })),
    [fluxo.nodes, arrastando, gravidade, selecao, medidas],
  );

  const edges = useMemo<Edge[]>(
    () =>
      fluxo.arestas.map((aresta) => {
        const id = idDaSeta(aresta);
        const selecionada = selecao?.tipo === "seta" && selecao.id === id;
        return {
          id,
          source: aresta.de,
          target: aresta.para,
          sourceHandle: aresta.saida ?? null,
          type: "smoothstep",
          selected: selecionada,
          label: aresta.saida === "sim" ? "sim" : aresta.saida === "nao" ? "não" : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: selecionada ? "#5fe39a" : "#56605b" },
        };
      }),
    [fluxo.arestas, selecao],
  );

  const nodeSelecionado = selecao?.tipo === "bloco" ? fluxo.nodes.find((n) => n.id === selecao.id) : undefined;
  const setaSelecionada = selecao?.tipo === "seta" ? fluxo.arestas.find((a) => idDaSeta(a) === selecao.id) : undefined;

  function aoMudarBlocos(mudancas: NodeChange<BlocoDoCanvas>[]) {
    for (const mudanca of mudancas) {
      if (mudanca.type === "dimensions" && mudanca.dimensions) {
        const { width, height } = mudanca.dimensions;
        setMedidas((atual) =>
          atual[mudanca.id]?.width === width && atual[mudanca.id]?.height === height
            ? atual
            : { ...atual, [mudanca.id]: { width, height } },
        );
      } else if (mudanca.type === "position" && mudanca.position) {
        const posicao = mudanca.position;
        setArrastando((atual) => ({ ...atual, [mudanca.id]: posicao }));
      } else if (mudanca.type === "select") {
        setSelecao((atual) =>
          mudanca.selected ? { tipo: "bloco", id: mudanca.id } : atual?.tipo === "bloco" && atual.id === mudanca.id ? null : atual,
        );
      }
    }
  }

  function aoMudarSetas(mudancas: EdgeChange[]) {
    for (const mudanca of mudancas) {
      if (mudanca.type !== "select") continue;
      setSelecao((atual) =>
        mudanca.selected ? { tipo: "seta", id: mudanca.id } : atual?.tipo === "seta" && atual.id === mudanca.id ? null : atual,
      );
    }
  }

  function aoSoltar(arrastados: BlocoDoCanvas[]) {
    const posicoes = new Map(arrastados.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
    setArrastando({});
    onChange({ ...fluxo, nodes: fluxo.nodes.map((n) => (posicoes.has(n.id) ? { ...n, posicao: posicoes.get(n.id) } : n)) });
  }

  /** Cada saída tem uma seta só: ligar de novo pela mesma saída troca o destino. */
  function conectar(conexao: Connection) {
    if (conexao.source === conexao.target) return;
    const saida: Saida | undefined = conexao.sourceHandle === "sim" || conexao.sourceHandle === "nao" ? conexao.sourceHandle : undefined;
    const arestas = fluxo.arestas.filter((a) => !(a.de === conexao.source && a.saida === saida));
    onChange({ ...fluxo, arestas: [...arestas, { de: conexao.source, para: conexao.target, ...(saida ? { saida } : {}) }] });
  }

  function apagar(blocos: string[], setas: string[]) {
    const fora = new Set(fluxo.nodes.filter((n) => blocos.includes(n.id) && n.tipo !== "inicio").map((n) => n.id));
    onChange({
      ...fluxo,
      nodes: fluxo.nodes.filter((n) => !fora.has(n.id)),
      arestas: fluxo.arestas.filter((a) => !setas.includes(idDaSeta(a)) && !fora.has(a.de) && !fora.has(a.para)),
    });
    setSelecao(null);
  }

  function trocar(novo: NodeDoFluxo) {
    onChange({ ...fluxo, nodes: fluxo.nodes.map((n) => (n.id === novo.id ? novo : n)) });
  }

  /**
   * Com um bloco selecionado, o novo entra logo abaixo e ligado na primeira
   * saída livre dele; sem seleção, entra no meio da tela, solto.
   */
  function adicionar(item: (typeof PALETA)[number]) {
    const id = novoId(item.chave, new Set(fluxo.nodes.map((n) => n.id)));
    const base = nodeSelecionado && nodeSelecionado.tipo !== "fim" ? nodeSelecionado : undefined;
    let posicao: XYPosition;
    let arestas = fluxo.arestas;
    if (base) {
      const origem = base.posicao ?? { x: 0, y: 0 };
      const saidas: (Saida | null)[] = base.tipo === "condicao" ? ["sim", "nao"] : [null];
      const livre = saidas.findIndex((s) => !fluxo.arestas.some((a) => a.de === base.id && (a.saida ?? null) === s));
      const saida = livre >= 0 ? saidas[livre]! : null;
      posicao = { x: origem.x + (saida === "nao" ? LARGURA_DO_BLOCO + 40 : 0), y: origem.y + DESCIDA };
      if (livre >= 0) arestas = [...arestas, { de: base.id, para: id, ...(saida ? { saida } : {}) }];
    } else {
      const caixa = moldura.current?.getBoundingClientRect();
      const centro = caixa
        ? reactFlow.screenToFlowPosition({ x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 })
        : { x: 0, y: 0 };
      posicao = { x: Math.round(centro.x - LARGURA_DO_BLOCO / 2), y: Math.round(centro.y - 30) };
    }
    onChange({ ...fluxo, nodes: [...fluxo.nodes, item.criar(id, posicao)], arestas });
    setSelecao({ tipo: "bloco", id });
  }

  function focar(nodeId: string) {
    const node = fluxo.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setSelecao({ tipo: "bloco", id: nodeId });
    const { x, y } = node.posicao ?? { x: 0, y: 0 };
    void reactFlow.setCenter(x + LARGURA_DO_BLOCO / 2, y + 40, { zoom: Math.max(reactFlow.getZoom(), 0.8), duration: 300 });
  }

  const nomeDoBloco = (nodeId: string) => {
    const node = fluxo.nodes.find((n) => n.id === nodeId);
    return node ? tituloDoBloco(node) : "Bloco";
  };

  const listaDeProblemas = [
    ...copyComProblema.flatMap((p) =>
      p.violacoes.map((v) => ({ chave: `copy|${p.toque}|${v.regra}`, nodeId: p.toque as string | null, mensagem: v.mensagem, tom: "erro" as const })),
    ),
    ...problemasDoFluxo.map((p, i) => ({ chave: `forma|${i}`, nodeId: p.nodeId, mensagem: p.mensagem, tom: "atencao" as const })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-tinta-suave">Adicionar bloco:</span>
        {PALETA.map((item) => (
          <button key={item.rotulo} type="button" onClick={() => adicionar(item)} className="botao botao-pequeno">
            <item.Icone aria-hidden />
            {item.rotulo}
          </button>
        ))}
      </div>

      {listaDeProblemas.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {listaDeProblemas.map((problema) => {
            const Icone = problema.tom === "erro" ? CircleAlert : TriangleAlert;
            const cor = problema.tom === "erro" ? "text-erro" : "text-atencao";
            const conteudo = (
              <>
                <Icone className={`mt-0.5 size-4 shrink-0 ${cor}`} aria-hidden />
                <span>
                  {problema.nodeId && <span className="font-medium text-tinta">{nomeDoBloco(problema.nodeId)}: </span>}
                  <span className="text-tinta-suave">{problema.mensagem}</span>
                </span>
              </>
            );
            return (
              <li key={problema.chave}>
                {problema.nodeId ? (
                  <button
                    type="button"
                    onClick={() => focar(problema.nodeId!)}
                    className="flex items-start gap-1.5 rounded-md text-left hover:underline hover:decoration-linha-forte"
                  >
                    {conteudo}
                  </button>
                ) : (
                  <p className="flex items-start gap-1.5">{conteudo}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div ref={moldura} className="fluxo h-[560px] overflow-hidden rounded-2xl border border-linha">
          <ReactFlow<BlocoDoCanvas, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={TIPOS_DE_NODE}
            colorMode="dark"
            onNodesChange={aoMudarBlocos}
            onEdgesChange={aoMudarSetas}
            onNodeDragStop={(_evento, _node, arrastados) => aoSoltar(arrastados)}
            onConnect={conectar}
            isValidConnection={(c) => c.source !== c.target && nomeDoTipo(fluxo, c.target) !== "inicio"}
            onDelete={({ nodes: blocos, edges: setas }) => apagar(blocos.map((n) => n.id), setas.map((e) => e.id))}
            onPaneClick={() => setSelecao(null)}
            deleteKeyCode={["Delete", "Backspace"]}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable style={{ width: 140, height: 96 }} />
          </ReactFlow>
        </div>

        <aside className="cartao self-start p-4">
          {nodeSelecionado ? (
            <PainelDoBloco
              key={nodeSelecionado.id}
              node={nodeSelecionado}
              copy={problemasDeCopy.find((p) => p.toque === nodeSelecionado.id)}
              forma={problemasDoFluxo.filter((p) => p.nodeId === nodeSelecionado.id)}
              aoTrocar={trocar}
              aoApagar={() => apagar([nodeSelecionado.id], [])}
            />
          ) : setaSelecionada ? (
            <div className="flex flex-col gap-3 text-sm">
              <h3 className="font-medium">Seta</h3>
              <p className="text-tinta-suave">
                De <span className="text-tinta">{nomeDoBloco(setaSelecionada.de)}</span>
                {setaSelecionada.saida && ` (saída "${setaSelecionada.saida === "sim" ? "sim" : "não"}")`} para{" "}
                <span className="text-tinta">{nomeDoBloco(setaSelecionada.para)}</span>.
              </p>
              <button type="button" onClick={() => apagar([], [idDaSeta(setaSelecionada)])} className="botao botao-pequeno botao-perigo self-start">
                <Trash2 aria-hidden />
                Apagar seta
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm text-tinta-suave">
              <h3 className="font-medium text-tinta">Como montar</h3>
              <p>Clique num bloco para editar o que ele faz.</p>
              <p>Para ligar dois blocos, arraste da bolinha de baixo de um até o outro. A condição tem duas saídas: sim e não.</p>
              <p>Com um bloco selecionado, o bloco novo entra logo abaixo dele, já ligado.</p>
              <p>Delete apaga o bloco ou a seta selecionada. O Início não sai.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function nomeDoTipo(f: Fluxo, nodeId: string) {
  return f.nodes.find((n) => n.id === nodeId)?.tipo;
}

// ---------------------------------------------------------------------------
// Painel lateral do bloco selecionado

/** Inteiro dentro do intervalo; vazio vira `vazio`. */
function lerNumero<T>(valor: string, min: number, max: number, vazio: T): number | T {
  if (valor.trim() === "") return vazio;
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : vazio;
}

const DICA_DE_VARIAVEIS = (
  <p className="text-xs text-tinta-fraca">
    Variáveis: só {"{{first_name}}"} e {"{{company}}"}.
  </p>
);

function PainelDoBloco({
  node,
  copy,
  forma,
  aoTrocar,
  aoApagar,
}: {
  node: NodeDoFluxo;
  copy: ProblemaDoBloco | undefined;
  forma: ProblemaDoFluxo[];
  aoTrocar(novo: NodeDoFluxo): void;
  aoApagar(): void;
}) {
  const Icone = ICONE_DO_TIPO[node.tipo];

  const campoDeTeto = (n: Extract<NodeDoFluxo, { tipo: "convite" | "mensagem" }>) => (
    <label className="rotulo">
      Teto de caracteres (opcional)
      <input
        type="number"
        min={1}
        max={2000}
        value={n.max_caracteres ?? ""}
        placeholder={`${tetoDoBloco({ toque: n.id, tipo: n.tipo === "convite" ? "convite" : "dm" })} (padrão)`}
        onChange={(e) => aoTrocar({ ...n, max_caracteres: lerNumero(e.target.value, 1, 2000, undefined) })}
        className="campo campo-pequeno w-32 tabular-nums"
      />
    </label>
  );

  let campos: ReactNode;
  switch (node.tipo) {
    case "inicio":
      campos = (
        <p className="text-sm text-tinta-suave">
          O lead aprovado na triagem entra no fluxo por aqui. Ligue o Início a um Convite ou a &quot;Já é conexão?&quot;.
        </p>
      );
      break;
    case "convite":
      campos = (
        <>
          <label className="rotulo">
            Nota do convite
            <textarea
              value={node.template}
              onChange={(e) => aoTrocar({ ...node, template: e.target.value })}
              rows={5}
              placeholder="Nota curta, sem oferta, sem link. Vazio = convite sem nota."
              className="campo w-full"
            />
          </label>
          {DICA_DE_VARIAVEIS}
          {campoDeTeto(node)}
        </>
      );
      break;
    case "esperar":
      campos = (
        <>
          <label className="rotulo">
            Dias úteis de espera
            <input
              type="number"
              min={0}
              max={60}
              value={node.dias_uteis}
              onChange={(e) => aoTrocar({ ...node, dias_uteis: lerNumero(e.target.value, 0, 60, 0) })}
              className="campo campo-pequeno w-24 tabular-nums"
            />
          </label>
          <p className="text-xs text-tinta-fraca">Contados a partir do bloco anterior, no fuso do perfil, sem fim de semana nem feriado.</p>
        </>
      );
      break;
    case "condicao":
      campos =
        node.condicao === "aceitou" ? (
          <>
            <p className="text-sm text-tinta-suave">
              Sim: a pessoa aceitou o convite. Não: o prazo acabou e o convite é retirado. Vem logo depois de um Convite.
            </p>
            <label className="rotulo">
              Prazo em dias úteis (opcional)
              <input
                type="number"
                min={1}
                max={60}
                value={node.prazo_dias_uteis ?? ""}
                placeholder="21 dias corridos"
                onChange={(e) => aoTrocar({ ...node, prazo_dias_uteis: lerNumero(e.target.value, 1, 60, null) })}
                className="campo campo-pequeno w-40 tabular-nums"
              />
            </label>
            <p className="text-xs text-tinta-fraca">Vazio: o padrão da casa, 21 dias corridos.</p>
          </>
        ) : (
          <p className="text-sm text-tinta-suave">
            Sim: a pessoa já é conexão de 1º grau e pode receber mensagem direto. Não: segue para o convite. Vem logo depois
            do Início.
          </p>
        );
      break;
    case "mensagem":
      campos = (
        <>
          <label className="rotulo">
            Texto da mensagem
            <textarea
              value={node.template}
              onChange={(e) => aoTrocar({ ...node, template: e.target.value })}
              rows={6}
              className="campo w-full"
            />
          </label>
          {DICA_DE_VARIAVEIS}
          {campoDeTeto(node)}
        </>
      );
      break;
    case "tarefa":
      campos = (
        <>
          <label className="rotulo">
            Roteiro de apoio
            <textarea
              value={node.roteiro}
              onChange={(e) => aoTrocar({ ...node, roteiro: e.target.value })}
              rows={6}
              className="campo w-full"
            />
          </label>
          <p className="text-xs text-tinta-fraca">O dono do perfil escreve à mão no LinkedIn. O roteiro é só apoio.</p>
        </>
      );
      break;
    case "fim":
      campos = (
        <label className="rotulo">
          Quem chega aqui sem responder
          <select
            value={node.resultado}
            onChange={(e) => aoTrocar({ ...node, resultado: e.target.value as typeof node.resultado })}
            className="campo"
          >
            <option value="sem_resposta">Sem resposta</option>
            <option value="pausa_60">Pausa de 60 dias e volta com ângulo diferente</option>
          </select>
        </label>
      );
      break;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        <Icone className="size-4 text-tinta-suave" aria-hidden />
        {tituloDoBloco(node)}
      </h3>
      {campos}
      {copy?.previa && (
        <div className="recuo">
          <p className="text-xs text-tinta-fraca tabular-nums">Prévia, {copy.previa.length} caracteres</p>
          <p className="mt-1 whitespace-pre-wrap text-tinta">{copy.previa}</p>
        </div>
      )}
      {copy?.violacoes.map((violacao) => (
        <p key={violacao.regra} className="flex items-start gap-1.5 text-sm text-erro">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {violacao.mensagem}
        </p>
      ))}
      {forma.map((problema) => (
        <p key={problema.mensagem} className="flex items-start gap-1.5 text-sm text-atencao">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problema.mensagem}
        </p>
      ))}
      {node.tipo !== "inicio" && (
        <button type="button" onClick={aoApagar} className="botao botao-pequeno botao-perigo mt-1 self-start">
          <Trash2 aria-hidden />
          Apagar bloco
        </button>
      )}
    </div>
  );
}
