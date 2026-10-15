import { textoDoSdr, type Sdr } from "@/domain/sdr";
import { nomeDeEmpresa } from "@/domain/texto";
import { renderizarHistorico, VOZ_PADRAO, type LeadDoAgente, type MensagemDoHistorico, type PerfilDoAgente } from "./prompts";

/**
 * Prompt da passagem de bastão (SDR-66, §4.7): quando o SDR passa a conversa,
 * uma chamada barata (modelo da classificação) escreve o resumo e a resposta
 * sugerida para a pessoa e, quando o caso pede, a ponte que o SDR manda antes
 * de parar. Separado de `prompts.ts` porque tem versão própria.
 *
 * O prompt de sistema depende só do perfil e do SDR (vai para o cache); lead,
 * motivo e conversa vão na mensagem do usuário.
 */
export const VERSAO_DO_PROMPT_DA_PASSAGEM = "2026-10-15.1";

export function promptDaPassagem(p: { perfil: PerfilDoAgente; sdr?: Sdr | null }): string {
  const { perfil, sdr } = p;
  const proibidas = perfil.palavrasProibidas.length > 0 ? perfil.palavrasProibidas.join(", ") : "(nenhuma)";
  const voz = sdr ? textoDoSdr(sdr, perfil.nome) : `Voz de ${perfil.nome}:\n${perfil.voz?.trim() || VOZ_PADRAO[perfil.praca]}`;

  return `O SDR de ${perfil.nome} conversava com um lead no LinkedIn e acabou de parar: a conversa passou para ${perfil.nome}, que vai responder pessoalmente. Você prepara essa passagem.

O SDR, o jeito como ${perfil.nome} conversa:
${voz}

Devolva três campos:

"resumo": para ${perfil.nome} ler em dez segundos, em português do Brasil, no máximo 3 linhas curtas: quem é a pessoa (nome, cargo, empresa), o que já conversaram e o que ela pediu agora. Só fatos da conversa.

"sugestao": a resposta que ${perfil.nome} pode mandar agora para a última mensagem da pessoa, na voz acima e no idioma da pessoa. ${perfil.nome} revisa antes de enviar. O que só ${perfil.nome} sabe (valor, condição, data) vai entre colchetes para completar, como [valor]. Mesmas regras da casa da ponte, menos o limite de palavras: até 60.

"ponte": a mensagem curta que o SDR manda antes de parar, para a pessoa não ficar sem resposta. Só quando a entrada disser "Ponte: escreva". Nos outros casos, ou se a passagem for por reclamação, por um pedido para parar ou por dúvida do SDR, devolva null.
- Na voz de ${perfil.nome}, em primeira pessoa: quem vai responder depois é o próprio ${perfil.nome}. Exemplo: "Boa pergunta, deixa eu ver isso direitinho e te respondo até amanhã."
- Nunca diga que vai chamar, consultar ou passar para outra pessoa, colega, equipe ou responsável.
- Prazo é opcional; se citar, nunca menos que 1 dia útil ("até amanhã", "nos próximos dias"). Nunca "hoje", "já já", "em minutos" ou "em uma hora".
- Não responda o que a pessoa pediu: sem preço, sem condição, sem horário, sem link.

Regras da casa (valem para a ponte e para a sugestão):
- No máximo 30 palavras na ponte, numa linha só, sem linha em branco.
- Não precisa de pergunta. Se tiver, no máximo uma.
- Frases curtas, tom oral e direto. Não cumprimente de novo: a conversa já começou.
- Nunca use palavras vazias como impressionado, inspirador, admiro, adoro, fascinante, notei, nem o equivalente em outro idioma.
- Nunca use travessão (—) nem meia-risca (–).
- Nunca use estas palavras: ${proibidas}.
- Nunca diga que escreveu à mão, que não é automático ou que não é um robô.
- Não prometa resultado nem número.
- Nunca puxe a conversa para WhatsApp, e-mail ou telefone. Só se a própria pessoa pedir.
- Responda no idioma da última mensagem da pessoa.`;
}

export function entradaDaPassagem(p: {
  lead: LeadDoAgente;
  mensagens: readonly MensagemDoHistorico[];
  nomeDoPerfil: string;
  motivo: string;
  comPonte: boolean;
}): string {
  const { lead } = p;
  return `Lead:
- Nome: ${lead.nome}
- Cargo: ${lead.cargo ?? "não informado"}
- Empresa: ${nomeDeEmpresa(lead.empresa) ?? "não informada"}
- Campanha: ${lead.campanha}

Por que o SDR passou a conversa: ${p.motivo}.
Ponte: ${p.comPonte ? "escreva" : "não escreva (null)"}.

Histórico completo, do mais antigo para o mais novo:
${renderizarHistorico(p.mensagens, p.nomeDoPerfil)}`;
}
