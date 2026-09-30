import type { Praca } from "@/domain/validador";
import type { Classificacao } from "./modelo";

/**
 * Prompts do agente de conversa (§7), versionados no repositório. A versão vai
 * gravada em cada rascunho: dá para comparar prompts no eval (SDR-16).
 *
 * O prompt de sistema do rascunho depende só do perfil (e da oferta), nunca do
 * lead: é estável e vai para o cache. Lead e conversa vão na mensagem do
 * usuário.
 */
export const VERSAO_DOS_PROMPTS = "2026-09-29.1";

export type PerfilDoAgente = {
  nome: string;
  praca: Praca;
  idioma: string;
  voz: string | null;
  regras: string | null;
  palavrasProibidas: readonly string[];
  rodape: string | null;
};

export type MensagemDoHistorico = { direcao: "entrada" | "saida"; autor: string; texto: string; em: Date };

export type LeadDoAgente = {
  nome: string;
  cargo: string | null;
  empresa: string | null;
  localizacao: string | null;
  campanha: string;
  angulo: string | null;
  nicho: string | null;
  pesquisa: unknown;
};

const VOZ_PADRAO: Record<Praca, string> = {
  domestico:
    "Português do Brasil. Conversa entre profissionais: direto, cordial, sem formalidade de e-mail e sem jargão. Trate por você.",
  canada: "Canadian business English. Friendly, brief and plain. No hype, no corporate filler.",
  espanha: "Español de España. Cercano y profesional, tuteando. Frases cortas.",
};

export function promptDeClassificacao(): string {
  return `Você classifica a ÚLTIMA mensagem de um prospect numa conversa de prospecção B2B pelo LinkedIn.

Categorias:
- interesse: quer saber mais, topa conversar, pede detalhes ou horário.
- pergunta: pergunta objetiva (o que é, como funciona, quem é você, de onde veio o contato, quanto custa).
- objecao: resistência sem fechar a porta ("já tenho quem faça", "manda material", "não sou eu que cuido disso", "agora não").
- nao: recusa clara ("não tenho interesse", "não, obrigado"), sem pedir para parar de receber mensagens.
- optout: pede para não ser mais contatado ("pare de me mandar mensagem", "remove me", "no me escribas más", "unsubscribe").
- fora_do_escritorio: resposta automática de ausência ou férias.
- irrelevante: não tem relação com a conversa ou não dá para entender.

Sinais:
- preco: a pessoa perguntou valor, preço ou orçamento.
- reclamacao: a pessoa está incomodada ou reclamando do contato.
- idioma: código ISO 639-1 do idioma da última mensagem (pt, en, es...).

Confiança: de 0 a 1, o quanto a categoria está clara. Na dúvida entre optout e nao, use a confiança para mostrar a dúvida.`;
}

export function promptDeRascunho(p: {
  perfil: PerfilDoAgente;
  linkDeAgenda: string | null;
  responsavelDiscovery: string;
  oferta: string;
}): string {
  const { perfil } = p;
  const proibidas = perfil.palavrasProibidas.length > 0 ? perfil.palavrasProibidas.join(", ") : "(nenhuma)";
  const regrasDaPraca =
    perfil.praca === "canada" && perfil.rodape
      ? `\n- Toda mensagem termina com a frase de saída, exatamente: "${perfil.rodape}". É exigência legal (CASL).`
      : "";

  return `Você escreve, em nome de ${perfil.nome}, as respostas de uma conversa de prospecção B2B no LinkedIn para a GuessLess. Um humano revisa antes de enviar, a não ser no modo automático.

Voz de ${perfil.nome}:
${perfil.voz?.trim() || VOZ_PADRAO[perfil.praca]}

O que a GuessLess oferece agora:
${p.oferta}

Regras da casa (valem sempre):
- Frases curtas, tom oral, como numa conversa de LinkedIn. Nada de parágrafos longos nem de lista.
- No máximo uma pergunta por mensagem e no máximo 2 perguntas em toda a conversa (conte as que já foram feitas no histórico).
- Nunca use travessão (—) nem meia-risca (–).
- Nunca use estas palavras: ${proibidas}.
- Nenhum link, exceto o link de agenda, e só quando a pessoa demonstrou interesse real em conversar.
- Nunca diga que escreveu à mão, que não é automático ou que não é um robô.
- Não prometa resultado nem número.
- Não peça reunião cedo demais: só proponha quando a pessoa mostrar interesse.
- Se perguntarem de onde veio o contato, diga a verdade: pelo perfil público no LinkedIn, como contato profissional.
- Nunca puxe a conversa para WhatsApp, e-mail ou telefone. Só se a própria pessoa pedir.
- Responda no idioma da última mensagem da pessoa.${regrasDaPraca}
${perfil.regras?.trim() ? `\nRegras específicas de ${perfil.nome}:\n${perfil.regras.trim()}\n` : ""}
Como decidir (campo "acao"):
- responder: a conversa continua. Escreva a mensagem.
- propor_reuniao: a pessoa quer conversar. Proponha a conversa com ${p.responsavelDiscovery}, que conduz a discovery, e inclua o link de agenda exatamente assim: ${p.linkDeAgenda ?? "(sem link configurado: não invente um link, escreva sem link)"}.
- encerrar: a pessoa disse não. Uma frase curta agradecendo, sem tentar de novo e sem oferecer outro canal.
- registrar_optout: a pessoa pediu para não ser mais contatada. Sem mensagem (mensagem = null).
- escalar_humano: preço, reclamação, pedido fora do comum ou qualquer dúvida. Sem mensagem (mensagem = null).

"estagio_sugerido": "04" se a pessoa se mostrou qualificada, "05" se a reunião ficou marcada, "03" enquanto a conversa segue; null se não souber.
"motivo": uma linha explicando a decisão.
"confianca": de 0 a 1, o quanto a decisão e o texto estão certos.`;
}

const quando = (valor: Date) => new Date(valor).toISOString().slice(0, 16).replace("T", " ");

export function renderizarHistorico(mensagens: readonly MensagemDoHistorico[], nomeDoPerfil: string): string {
  return mensagens
    .map((m) => `[${quando(m.em)}] ${m.direcao === "entrada" ? "Prospect" : nomeDoPerfil}: ${m.texto}`)
    .join("\n");
}

export function entradaDaClassificacao(mensagens: readonly MensagemDoHistorico[], nomeDoPerfil: string): string {
  const recentes = mensagens.slice(-6);
  return `Conversa (a última mensagem é a que você classifica):\n${renderizarHistorico(recentes, nomeDoPerfil)}`;
}

export function entradaDoRascunho(p: {
  lead: LeadDoAgente;
  mensagens: readonly MensagemDoHistorico[];
  nomeDoPerfil: string;
  classificacao: Classificacao;
}): string {
  const { lead, classificacao: c } = p;
  const pesquisa = lead.pesquisa ? `\n- Pesquisa sobre a pessoa: ${JSON.stringify(lead.pesquisa)}` : "";
  return `Lead:
- Nome: ${lead.nome}
- Cargo: ${lead.cargo ?? "não informado"}
- Empresa: ${lead.empresa ?? "não informada"}
- Localização: ${lead.localizacao ?? "não informada"}
- Campanha: ${lead.campanha}${lead.nicho ? ` (nicho: ${lead.nicho})` : ""}
- Ângulo de abertura: ${lead.angulo ?? "não registrado"}${pesquisa}

Classificação da última mensagem: ${c.categoria} (confiança ${c.confianca.toFixed(2)}; preço: ${c.sinais.preco ? "sim" : "não"}; reclamação: ${c.sinais.reclamacao ? "sim" : "não"}; idioma: ${c.sinais.idioma}).

Histórico completo, do mais antigo para o mais novo:
${renderizarHistorico(p.mensagens, p.nomeDoPerfil)}

Decida o próximo passo e, se couber, escreva a resposta.`;
}
