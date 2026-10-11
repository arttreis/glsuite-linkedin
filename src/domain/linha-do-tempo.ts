import { inicioDoFluxo, proximoNode, type Fluxo, type NodeDoFluxo } from "./fluxo";

/** Um texto da campanha na ordem em que sai, com quando ele sai (§4.11). */
export type PassoDaLinha = { nodeId: string; tipo: "convite" | "mensagem" | "tarefa"; texto: string; quando: string };

const TEXTO = new Set(["convite", "mensagem", "tarefa"]);

function quando(dias: number, referencia: "inicio" | "aceite" | "anterior"): string {
  if (referencia === "inicio") return "Assim que a pessoa entra na fila";
  const base = referencia === "aceite" ? "do aceite" : "da mensagem anterior";
  if (dias === 0) return referencia === "aceite" ? "Logo depois do aceite" : "Logo depois da mensagem anterior";
  return `${dias} ${dias === 1 ? "dia útil" : "dias úteis"} depois ${base}`;
}

/**
 * A linha do tempo da campanha: o caminho de quem aceita e não responde, do
 * convite à última mensagem. Desvio que não é o "sim" fica para o editor de
 * blocos; `completa` diz se todo texto do fluxo está na linha.
 */
export function linhaDoTempo(f: Fluxo): { passos: PassoDaLinha[]; completa: boolean } {
  const passos: PassoDaLinha[] = [];
  const vistos = new Set<string>();
  let dias = 0;
  let referencia: "inicio" | "aceite" | "anterior" = "inicio";
  const inicio = inicioDoFluxo(f);
  let atual: NodeDoFluxo | undefined = inicio ? proximoNode(f, inicio.id) : undefined;

  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    switch (atual.tipo) {
      case "convite":
      case "mensagem":
        passos.push({ nodeId: atual.id, tipo: atual.tipo, texto: atual.template, quando: quando(dias, referencia) });
        dias = 0;
        referencia = "anterior";
        atual = proximoNode(f, atual.id);
        break;
      case "tarefa":
        passos.push({ nodeId: atual.id, tipo: "tarefa", texto: atual.roteiro, quando: quando(dias, referencia) });
        dias = 0;
        referencia = "anterior";
        atual = proximoNode(f, atual.id);
        break;
      case "condicao":
        if (atual.condicao === "aceitou") {
          dias = 0;
          referencia = "aceite";
        }
        atual = proximoNode(f, atual.id, "sim");
        break;
      case "esperar":
        dias += atual.dias_uteis;
        atual = proximoNode(f, atual.id);
        break;
      default:
        atual = undefined;
    }
  }

  const textos = f.nodes.filter((node) => TEXTO.has(node.tipo)).length;
  return { passos, completa: textos === passos.length };
}

/** O mesmo fluxo com os textos trocados nos blocos indicados; a forma não muda. */
export function fluxoComTextosNovos(f: Fluxo, textos: Readonly<Record<string, string>>): Fluxo {
  return {
    ...f,
    nodes: f.nodes.map((node) => {
      const texto = textos[node.id];
      if (texto === undefined) return node;
      if (node.tipo === "convite" || node.tipo === "mensagem") return { ...node, template: texto.trim() };
      if (node.tipo === "tarefa") return { ...node, roteiro: texto.trim() };
      return node;
    }),
  };
}
