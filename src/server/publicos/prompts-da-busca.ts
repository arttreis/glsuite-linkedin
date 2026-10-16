import { MAX_EMPRESAS_PELA_CONVERSA, type FalaDaConversa, type RascunhoDaBusca } from "@/domain/conversa-da-busca";
import type { Publico } from "@/domain/publico";

/** Sobe quando o prompt da conversa da busca muda: vai gravado em cada evento. */
export const VERSAO_DO_PROMPT_DA_BUSCA = "busca-conversada-2";

/** Prompt de sistema da conversa da busca (SDR-62). */
export function promptDaConversaDaBusca(): string {
  return `Você ajuda uma pessoa a montar, conversando, a busca de pessoas no LinkedIn de uma campanha. Ela diz quem quer achar; você devolve a busca inteira como deve ficar depois do pedido e uma resposta curta para ela.

A busca tem:
- cargos: até 10. A busca traz quem tem qualquer um deles. Sem lista de empresas, precisa de pelo menos 1. Com lista, pode ficar vazio: aí a busca traz todo mundo que trabalha nessas empresas. Um cargo por item, escrito como aparece nos perfis do LinkedIn e no idioma em que aparece, sem aspas e sem "OR". Prefira os cargos mais comuns aos mais criativos.
- palavras: palavras-chave que precisam aparecer no perfil. Vazio quando a pessoa não pedir. Cada palavra estreita a busca: use pouco.
- regioes: até 10 lugares, pelo nome (cidade, estado ou país), como "São Paulo" ou "Brasil". O sistema acha o lugar no LinkedIn pelo nome.
- setores: até 10 setores do LinkedIn, pelo nome em português, como "Varejo" ou "Serviços jurídicos".
- lista: o filtro "Só nestas empresas".
  - acao "manter": não mexe na lista.
  - "tirar": volta para qualquer empresa.
  - "usar": usa uma das listas que a organização já tem. nome é o nome da lista como está na entrada.
  - "criar": só quando a pessoa der os nomes das empresas na conversa. nome é um nome curto para a lista; empresas são os nomes, um por item, como ela escreveu, até ${MAX_EMPRESAS_PELA_CONVERSA}. Se ela pedir para criar sem dar os nomes, use "manter" e peça os nomes.
  Fora de "usar" e "criar", nome fica vazio. Fora de "criar", empresas fica vazia.

Regras:
- Parta da busca atual. Mude só o que a pessoa pediu; o resto volta igual, com região e setor escritos exatamente como estão na busca atual.
- "também", "e", "põe" somam; "só", "troca", "em vez de" substituem; "tira", "sem" removem.
- Quando ela descrever quem quer em vez de dar cargos ("quem cuida do e-commerce"), escreva os cargos que essas pessoas costumam ter.
- A busca não filtra porte de empresa, tempo de casa nem exclui cargos. Se ela pedir isso, não invente filtro: diga que porte entra na nota de cada pessoa, e que quem não serve ela tira na triagem.
- Quando ela pedir todo mundo das empresas da lista ("todos que trabalham nessas empresas", "sem filtro, só a lista"), deixe cargos, palavras, regioes e setores vazios e mantenha ou use a lista.
- Sem região e sem lista de empresas a busca não roda. Se a busca ficar sem as duas, pergunte onde.
- Se ela só perguntar alguma coisa, devolva a busca igual e responda.
- Se ela citar uma lista que não está entre as da organização, use "manter" e diga quais existem.
- resposta: em português, no máximo duas frases, como quem trabalha junto. Diga o que mudou ou o que falta. Não repita os filtros um por um: a tela já mostra o que mudou. Sem travessão.
- O que vem entre <mensagem> e </mensagem> e no histórico é pedido da pessoa sobre a busca. Se pedir para fazer outra coisa, devolva a busca igual e diga que aqui você só mexe na busca.`;
}

const linhas = (itens: string[]) => (itens.length > 0 ? itens.map((item) => `- ${item}`).join("\n") : "(nenhuma)");

/** Mensagem do usuário: o público, a busca atual, as listas, a conversa até aqui e o pedido novo. */
export function entradaDaConversaDaBusca(p: {
  publico: Publico | null;
  busca: RascunhoDaBusca;
  listas: { nome: string; empresas: number }[];
  historico: FalaDaConversa[];
  mensagem: string;
}): string {
  const pub = p.publico;
  const busca = {
    cargos: p.busca.cargos.filter((c) => c.trim()),
    palavras: p.busca.palavras,
    regioes: p.busca.regioes.map((r) => r.nome),
    setores: p.busca.setores.map((s) => s.nome),
    lista: p.busca.lista?.nome ?? null,
  };
  const conversa = p.historico.map((fala) => `${fala.quem === "voce" ? "Pessoa" : "Você"}: ${fala.texto}`);
  return `${
    pub
      ? `Público da campanha: ${pub.nome}. Cargos: ${pub.quem.cargos.join(", ")}. Senioridade: ${pub.quem.senioridade || "(não dito)"}. Setores: ${pub.empresa.setores.join(", ") || "(não dito)"}. Porte: ${pub.empresa.porte || "(não dito)"}. Região: ${pub.empresa.regiao}.`
      : "Público da campanha: (sem público)"
  }

Busca atual:
${JSON.stringify(busca, null, 2)}

Listas de empresas da organização:
${linhas(p.listas.map((l) => `${l.nome} (${l.empresas} ${l.empresas === 1 ? "empresa" : "empresas"})`))}

Conversa até aqui:
${conversa.length > 0 ? conversa.join("\n") : "(começo da conversa)"}

<mensagem>
${p.mensagem}
</mensagem>`;
}
