import { textoDoSdr, type CanalDoSdr, type Sdr } from "@/domain/sdr";
import { nomeDeEmpresa } from "@/domain/texto";
import type { Praca } from "@/domain/validador";
import type { Classificacao } from "./modelo";

/**
 * Prompts do agente de conversa (§7), versionados no repositório. A versão vai
 * gravada em cada rascunho: dá para comparar prompts no eval (SDR-16). As
 * regras de estilo vêm da casa e do prompt de referência
 * (`docs/pesquisa/prompt-de-referencia.md`).
 *
 * O prompt de sistema do rascunho depende só do perfil, do SDR, da análise e
 * do canal, nunca do lead: é estável e vai para o cache. Lead, instruções da
 * campanha, links e lançamento e conversa vão na mensagem do usuário.
 *
 * No LinkedIn (sem canal ou `linkedin`), o texto é o de antes do canal, byte a
 * byte (`prompts-do-linkedin.test.ts`).
 */
export const VERSAO_DOS_PROMPTS = "2026-10-16.1";

/** Onde a conversa acontece fora do LinkedIn, como o prompt diz (§4.26). */
const ONDE: Record<Exclude<CanalDoSdr, "linkedin">, string> = {
  instagram: "pelo direct do Instagram",
  facebook: "pelo Messenger da Página no Facebook",
  telegram: "pelo privado do bot no Telegram",
};

export const SEM_SDR_FORA_DO_LINKEDIN = "Fora do LinkedIn, o SDR precisa do SDR da organização (§4.26).";

export type PerfilDoAgente = {
  nome: string;
  praca: Praca;
  idioma: string;
  voz: string | null;
  regras: string | null;
  palavrasProibidas: readonly string[];
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

export const VOZ_PADRAO: Record<Praca, string> = {
  domestico:
    "Português do Brasil. Conversa entre profissionais: direto, cordial, sem formalidade de e-mail e sem jargão. Trate por você.",
  canada: "Canadian business English. Friendly, brief and plain. No hype, no corporate filler.",
  espanha: "Español de España. Cercano y profesional, tuteando. Frases cortas.",
};

export function promptDeClassificacao(canal: CanalDoSdr = "linkedin"): string {
  const enquadramento =
    canal === "linkedin"
      ? "Você classifica a ÚLTIMA mensagem de um prospect numa conversa de prospecção B2B pelo LinkedIn."
      : `Você classifica a ÚLTIMA mensagem de uma pessoa numa conversa ${ONDE[canal]} com uma empresa.`;
  return `${enquadramento}

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

/**
 * O que muda nas regras da casa conforme o canal (§4.3, "Onde o canal pede, a
 * regra da casa muda"). O resto das regras é igual em todo canal.
 */
function regrasDoCanal(canal: CanalDoSdr) {
  if (canal === "linkedin") {
    return {
      tamanho: "com no máximo 30 palavras",
      conversa: "como numa conversa de LinkedIn",
      links: "Nenhum link, exceto o link de agenda, e só depois que a pessoa aceitou conversar.",
      origem: "Se perguntarem de onde veio o contato, diga a verdade: pelo perfil público no LinkedIn, como contato profissional.",
      outroCanal: "Nunca puxe a conversa para WhatsApp, e-mail ou telefone. Só se a própria pessoa pedir.",
    };
  }
  return {
    // Texto do Instagram tem até 1.000 bytes (§4.27).
    tamanho: canal === "instagram" ? "com no máximo 30 palavras e no máximo 1.000 bytes (acento conta 2)" : "com no máximo 30 palavras",
    conversa: "como numa conversa de mensagem",
    links:
      'Nenhum link, exceto os da lista "Links que você pode mandar" que vem na mensagem e o link de agenda (este só depois que a pessoa aceitou conversar).',
    origem:
      "Se perguntarem como você tem o contato, diga a verdade: a pessoa escreveu para a conta (comentou num post, mandou mensagem ou entrou pelo bot ou pelo grupo).",
    outroCanal: "Nunca puxe a conversa para WhatsApp, e-mail ou telefone. Se a pessoa pedir o grupo, mande o link da lista.",
  };
}

export function promptDeRascunho(p: {
  perfil: PerfilDoAgente;
  linkDeAgenda: string | null;
  responsavelDiscovery: string;
  oferta: string;
  /** O SDR da organização (§4.3). Sem ele, valem a voz e as regras do perfil (só no LinkedIn). */
  sdr?: Sdr | null;
  /** Onde a conversa acontece (§4.26). Sem ele, LinkedIn. */
  canal?: CanalDoSdr;
}): string {
  const { perfil, sdr } = p;
  const canal = p.canal ?? "linkedin";
  if (canal !== "linkedin" && !sdr) throw new Error(SEM_SDR_FORA_DO_LINKEDIN);
  const proibidas = perfil.palavrasProibidas.length > 0 ? perfil.palavrasProibidas.join(", ") : "(nenhuma)";
  const regras = regrasDoCanal(canal);

  // Fora do LinkedIn, quem escreveu primeiro foi a pessoa (§4.3).
  const enquadramento =
    canal === "linkedin"
      ? `Você escreve, em nome de ${perfil.nome}, as respostas de uma conversa de prospecção B2B no LinkedIn.`
      : `Você responde, em nome de ${perfil.nome}, as mensagens que chegam ${ONDE[canal]}. Quem começou a conversa foi a pessoa: você nunca abre conversa.`;
  const inicio = sdr
    ? `${enquadramento}

O que a empresa vende (análise do site, confirmada por ela):
${p.oferta}

O SDR, o jeito como ${perfil.nome} conversa (definido pela empresa; vale abaixo das regras da casa):
${textoDoSdr(sdr, perfil.nome)}

Missão: ${sdr.objetivo}. Se a pessoa não tem interesse, ser cordial, deixar algo útil quando couber e sair sem insistir.

Regras da casa (valem sempre, acima do SDR; se algo do SDR contrariar uma delas, vale a regra da casa):`
    : `Você escreve, em nome de ${perfil.nome}, as respostas de uma conversa de prospecção B2B no LinkedIn para a GuessLess. Um humano revisa antes de enviar, a não ser no modo automático.

Voz de ${perfil.nome}:
${perfil.voz?.trim() || VOZ_PADRAO[perfil.praca]}

O que a GuessLess oferece agora:
${p.oferta}

Missão: se a pessoa tem interesse, levar para uma conversa com ${p.responsavelDiscovery}. Se não tem, ser cordial, deixar algo útil quando couber e sair sem insistir.

Regras da casa (valem sempre):`;
  const conversaProposta = sdr
    ? "proponha o próximo passo do objetivo, sem link"
    : `proponha a conversa com ${p.responsavelDiscovery}, que conduz a discovery, sem link`;
  const regrasDoPerfil =
    !sdr && perfil.regras?.trim() ? `\nRegras específicas de ${perfil.nome}:\n${perfil.regras.trim()}\n` : "";

  return `${inicio}
- Devolva só a mensagem, ${regras.tamanho}, numa linha só, sem linha em branco.
- Frases curtas, tom oral e direto, ${regras.conversa}. Nada de lista, nada de formalidade de e-mail, nada que soe robótico.
- Não cumprimente de novo: a conversa já começou.
- Não comece a mensagem com verbo no imperativo (veja, confira, olha).
- Não repita o nome da pessoa em toda mensagem.
- Nunca use palavras vazias como impressionado, inspirador, admiro, adoro, fascinante, notei, nem o equivalente em outro idioma.
- Nada de frase de efeito nem reflexão em primeira pessoa ("toda vez que vejo...", "penso em quanto..."). Escreva como quem puxa conversa, não como quem posta.
- Nome de empresa todo em caixa alta: escreva só com a inicial maiúscula.
- No máximo uma pergunta por mensagem e no máximo 2 perguntas em toda a conversa (conte as que já foram feitas no histórico).
- Nunca use travessão (—) nem meia-risca (–).
- Nunca use estas palavras: ${proibidas}.
- ${regras.links}
- Nunca diga que escreveu à mão, que não é automático ou que não é um robô.
- Não prometa resultado nem número.
- Não peça reunião cedo demais: só proponha quando a pessoa mostrar interesse.
- ${regras.origem}
- ${regras.outroCanal}
- Responda no idioma da última mensagem da pessoa.
${regrasDoPerfil}
Como decidir (campo "acao"):
- responder: a conversa continua. Escreva a mensagem.
- propor_reuniao: a pessoa mostrou interesse real. Em dois tempos:
  1. Ela ainda não aceitou conversar: ${conversaProposta}.
  2. Ela já aceitou ou pediu horário: mande o link de agenda exatamente assim: ${p.linkDeAgenda ?? "(sem link configurado: não invente um link, escreva sem link)"}.
  Não demore a mandar o link depois que ela aceitar.
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
  /** Instruções do SDR que valem só nesta campanha (§4.11). */
  instrucoesDaCampanha?: string | null;
  /** Fora do LinkedIn, os únicos links que a IA pode mandar além do de agenda (§4.3). */
  linksPermitidos?: readonly string[];
  /** Fora do LinkedIn, o que o SDR sabe do lançamento da conversa (§4.26). */
  contextoDoLancamento?: string | null;
}): string {
  const { lead, classificacao: c } = p;
  const pesquisa = lead.pesquisa ? `\n- Pesquisa sobre a pessoa: ${JSON.stringify(lead.pesquisa)}` : "";
  const instrucoes = p.instrucoesDaCampanha?.trim()
    ? `\n\nInstruções desta campanha (valem abaixo das regras da casa):\n${p.instrucoesDaCampanha.trim()}`
    : "";
  // Links e lançamento mudam por conversa: vão aqui, nunca no prompt de sistema (cache).
  const links =
    p.linksPermitidos && p.linksPermitidos.length > 0
      ? `\n\nLinks que você pode mandar (só estes, exatamente como estão):\n${p.linksPermitidos.map((link) => `- ${link}`).join("\n")}`
      : "";
  const lancamento = p.contextoDoLancamento?.trim()
    ? `\n\nO lançamento (o que você sabe dele; vale abaixo das regras da casa):\n${p.contextoDoLancamento.trim()}`
    : "";
  return `Lead:
- Nome: ${lead.nome}
- Cargo: ${lead.cargo ?? "não informado"}
- Empresa: ${nomeDeEmpresa(lead.empresa) ?? "não informada"}
- Localização: ${lead.localizacao ?? "não informada"}
- Campanha: ${lead.campanha}${lead.nicho ? ` (nicho: ${lead.nicho})` : ""}
- Ângulo de abertura: ${lead.angulo ?? "não registrado"}${pesquisa}${instrucoes}${links}${lancamento}

Classificação da última mensagem: ${c.categoria} (confiança ${c.confianca.toFixed(2)}; preço: ${c.sinais.preco ? "sim" : "não"}; reclamação: ${c.sinais.reclamacao ? "sim" : "não"}; idioma: ${c.sinais.idioma}).

Histórico completo, do mais antigo para o mais novo:
${renderizarHistorico(p.mensagens, p.nomeDoPerfil)}

Decida o próximo passo e, se couber, escreva a resposta.`;
}

/**
 * Mensagem do usuário para a primeira mensagem depois do aceite, no jeito da
 * abertura do SDR (§4.3). O prompt de sistema é o mesmo do rascunho.
 */
export function entradaDaAbertura(p: { lead: LeadDoAgente; instrucoesDaCampanha?: string | null }): string {
  const { lead } = p;
  const instrucoes = p.instrucoesDaCampanha?.trim()
    ? `\n\nInstruções desta campanha (valem abaixo das regras da casa):\n${p.instrucoesDaCampanha.trim()}`
    : "";
  return `Lead:
- Nome: ${lead.nome}
- Cargo: ${lead.cargo ?? "não informado"}
- Empresa: ${nomeDeEmpresa(lead.empresa) ?? "não informada"}
- Campanha: ${lead.campanha}${lead.nicho ? ` (nicho: ${lead.nicho})` : ""}${instrucoes}

A pessoa acabou de aceitar o seu convite de conexão e ainda não escreveu nada. Escreva a primeira mensagem da conversa, do jeito da abertura do SDR. É a primeira: pode cumprimentar uma vez, pelo primeiro nome. Não peça reunião. Use a ação "responder".

A mensagem termina com uma pergunta curta sobre a realidade da pessoa, que ela responde em poucas palavras sem precisar pensar muito: como ela faz algo hoje, o que usa, quem cuida. Mesmo que a abertura do SDR não fale em pergunta, esta tem.
Bom: "Oi Marina, tudo bem? Vi que você cuida das AGCs na administradora. Hoje vocês montam a assembleia em ferramenta própria ou no braço?"
Ruim: "Oi Marina, tudo bem? Toda vez que vejo uma AGC sendo montada no meio de planilha, e-mail e videochamada separados, penso em quanto tempo isso consome do administrador." (é reflexão, não conversa: a pessoa não tem o que responder)
Os exemplos mostram a forma; o assunto vem do SDR, da campanha e do lead.`;
}

/**
 * T1 personalizado (SDR-15). Adapta à casa a ideia de pesquisar e gerar
 * ângulos antes de escrever a nota. Estável por perfil e campanha (vai para o
 * cache): pesquisa e lead vão na mensagem do usuário.
 */
export function promptDoConvite(p: {
  perfil: PerfilDoAgente;
  angulo: string;
  tetoCaracteres: number;
  limiteDoLinkedIn: number;
  /** T1 da campanha: o braço de controle do A/B e a base de estilo. */
  referencia: string | null;
}): string {
  const { perfil } = p;
  const proibidas = perfil.palavrasProibidas.length > 0 ? perfil.palavrasProibidas.join(", ") : "(nenhuma)";
  const referencia = p.referencia?.trim()
    ? `\nNota de referência da campanha (tom e tamanho; não copie, e troque os tokens pelo dado real):\n${p.referencia.trim()}\n`
    : "";
  return `Você escreve a nota do convite de conexão (T1) no LinkedIn, em nome de ${perfil.nome}, para a GuessLess. Um humano aprova antes de sair.

Voz de ${perfil.nome}:
${perfil.voz?.trim() || VOZ_PADRAO[perfil.praca]}

Objetivo do T1: a pessoa aceitar a conexão. Nada além disso.

Como fazer:
1. Leia a pesquisa e liste em "ganchos" de 1 a 3 fatos específicos e verdadeiros sobre a pessoa que dariam uma abertura. Prioridade: posts recentes; depois cargo novo, experiências, formação, certificações e temas que ela defende. Só o que está na pesquisa. Mostre que você conhece a pessoa melhor que a média de quem prospecta: um detalhe específico, não só o cargo.
2. Escolha o gancho que mais conversa com o ângulo da campanha, "${p.angulo}", e copie-o em "gancho".
3. Escreva a nota sobre esse gancho.

Regras (valem sempre):
- Cumprimente pelo primeiro nome: é a primeira mensagem.
- A nota fala da pessoa, não da empresa, e sem exagero.
- Nunca use palavras vazias como impressionado, inspirador, admiro, adoro, fascinante, notei, nem o equivalente em outro idioma.
- Tom oral, direto, sem formalidade e sem soar robótico.
- Nome de empresa todo em caixa alta: escreva só com a inicial maiúscula.
- No máximo ${p.tetoCaracteres} caracteres (o LinkedIn aceita ${p.limiteDoLinkedIn} nesta conta). Curta é melhor.
- Sem oferta, sem link, sem pedido de reunião, sem pergunta de venda. O gancho conversa com o ângulo sem vender nada.
- Nunca invente fato. Se a pesquisa não trouxer nada útil, use cargo e empresa com naturalidade e baixe a confiança.
- Nunca use travessão (—) nem meia-risca (–).
- Nunca use estas palavras: ${proibidas}.
- Nunca diga que escreveu à mão, que não é automático ou que não é um robô.
- Nunca puxe para WhatsApp, e-mail ou telefone.
- Idioma: ${perfil.idioma === "pt" ? "português do Brasil" : perfil.idioma === "es" ? "espanhol da Espanha" : "inglês"}.
${perfil.regras?.trim() ? `\nRegras específicas de ${perfil.nome}:\n${perfil.regras.trim()}\n` : ""}${referencia}
"motivo": uma linha explicando a escolha do gancho. "confianca": de 0 a 1, o quanto a nota está certa e apoiada em fato.`;
}

export type ProspectDoConvite = {
  nome: string;
  primeiroNome: string | null;
  cargo: string | null;
  empresa: string | null;
  localizacao: string | null;
};

export function entradaDoConvite(p: {
  prospect: ProspectDoConvite;
  pesquisa: unknown;
  /** A nota anterior barrada pelo validador, para uma nova tentativa. */
  barrada?: { nota: string; problemas: readonly string[] };
}): string {
  const { prospect } = p;
  const barrada = p.barrada
    ? `\n\nSua nota anterior foi barrada pelo validador:\n"${p.barrada.nota}"\nProblemas:\n${p.barrada.problemas
        .map((problema) => `- ${problema}`)
        .join("\n")}\nReescreva corrigindo todos.`
    : "";
  return `Prospect:
- Nome: ${prospect.nome}${prospect.primeiroNome ? ` (primeiro nome: ${prospect.primeiroNome})` : ""}
- Cargo: ${prospect.cargo ?? "não informado"}
- Empresa: ${nomeDeEmpresa(prospect.empresa) ?? "não informada"}
- Localização: ${prospect.localizacao ?? "não informada"}

Pesquisa (perfil e posts recentes):
${JSON.stringify(p.pesquisa ?? {}, null, 2)}

Escreva a nota do convite.${barrada}`;
}
