import { Temporal } from "temporal-polyfill";
import { detectarOptout } from "./optout";
import { primeiroNome, semAcentos } from "./texto";

/**
 * Disparos (§4.18 a §4.20): regras puras. O que a tela mostra antes de
 * confirmar, a fila e os webhooks usam as mesmas funções.
 */

export const TIPOS_DE_CANAL = ["whatsapp", "telegram"] as const;
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number];

export const NOME_DO_CANAL: Record<TipoDeCanal, string> = { whatsapp: "WhatsApp", telegram: "Telegram" };

export type StatusDoDisparo = "rascunho" | "agendado" | "enviando" | "pausado" | "concluido" | "cancelado";
export type StatusDoEnvio = "pendente" | "enviando" | "enviado" | "entregue" | "lido" | "falhou" | "pulado" | "cancelado";

// --- Template do WhatsApp ----------------------------------------------------------

export type BotaoDoTemplate = { type: string; text?: string; url?: string };
export type ComponenteDoTemplate = { type: string; format?: string; text?: string; buttons?: BotaoDoTemplate[] };

/** Um template aprovado, como o Kakou guarda (o que veio de `GET /{waba-id}/message_templates`). */
export type TemplateDoWhatsapp = {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  status: string;
  formato: "named" | "positional";
  componentes: ComponenteDoTemplate[];
};

export const FORMATOS_DE_MIDIA = ["IMAGE", "VIDEO", "DOCUMENT"] as const;
export type FormatoDeMidia = (typeof FORMATOS_DE_MIDIA)[number];

/** O que o template pede para sair: cada variável do cabeçalho, do corpo e da URL, e a mídia do cabeçalho. */
export type VariavelDoTemplate =
  | { onde: "cabecalho"; chave: string }
  | { onde: "midia"; formato: FormatoDeMidia }
  | { onde: "corpo"; chave: string }
  | { onde: "botao"; indice: number; chave: string };

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Os placeholders distintos de um texto, na ordem em que aparecem; posicionais em ordem numérica. */
function placeholders(texto: string | undefined): string[] {
  const vistos: string[] = [];
  for (const achado of (texto ?? "").matchAll(PLACEHOLDER)) if (!vistos.includes(achado[1]!)) vistos.push(achado[1]!);
  return vistos.every((p) => /^\d+$/.test(p)) ? vistos.sort((a, b) => Number(a) - Number(b)) : vistos;
}

const componente = (template: TemplateDoWhatsapp, tipo: string) => template.componentes.find((c) => c.type.toUpperCase() === tipo);

/** As variáveis do template (§4.19): cabeçalho (texto ou mídia), corpo e sufixo das URLs dinâmicas. */
export function variaveisDoTemplate(template: TemplateDoWhatsapp): VariavelDoTemplate[] {
  const variaveis: VariavelDoTemplate[] = [];
  const cabecalho = componente(template, "HEADER");
  if (cabecalho) {
    const formato = cabecalho.format?.toUpperCase();
    if ((FORMATOS_DE_MIDIA as readonly string[]).includes(formato ?? "")) variaveis.push({ onde: "midia", formato: formato as FormatoDeMidia });
    else for (const chave of placeholders(cabecalho.text)) variaveis.push({ onde: "cabecalho", chave });
  }
  for (const chave of placeholders(componente(template, "BODY")?.text)) variaveis.push({ onde: "corpo", chave });
  (componente(template, "BUTTONS")?.buttons ?? []).forEach((botao, indice) => {
    if (botao.type.toUpperCase() === "URL") for (const chave of placeholders(botao.url)) variaveis.push({ onde: "botao", indice, chave });
  });
  return variaveis;
}

/** O id estável da variável, para guardar de onde vem o valor de cada uma. */
export function idDaVariavel(variavel: VariavelDoTemplate): string {
  if (variavel.onde === "midia") return "midia";
  if (variavel.onde === "botao") return `botao:${variavel.indice}:${variavel.chave}`;
  return `${variavel.onde}:${variavel.chave}`;
}

export function rotuloDaVariavel(variavel: VariavelDoTemplate): string {
  if (variavel.onde === "midia") return `Link ${variavel.formato === "IMAGE" ? "da imagem" : variavel.formato === "VIDEO" ? "do vídeo" : "do documento"} do cabeçalho`;
  if (variavel.onde === "botao") return `{{${variavel.chave}}} no link do botão ${variavel.indice + 1}`;
  return `{{${variavel.chave}}} no ${variavel.onde === "cabecalho" ? "cabeçalho" : "texto"}`;
}

export const CAMPOS_DO_CONTATO = ["primeiro_nome", "nome", "empresa", "cargo"] as const;
export type CampoDoContato = (typeof CAMPOS_DO_CONTATO)[number];

export const ROTULO_DO_CAMPO: Record<CampoDoContato, string> = {
  primeiro_nome: "Primeiro nome",
  nome: "Nome completo",
  empresa: "Empresa",
  cargo: "Cargo",
};

/** De onde vem o valor de uma variável: um campo do contato ou um texto fixo, igual para todos. */
export type FonteDaVariavel = { campo: CampoDoContato } | { texto: string };

export type ConteudoDoWhatsapp = {
  tipo: "whatsapp";
  template: TemplateDoWhatsapp;
  /** Pelo `idDaVariavel`. A mídia do cabeçalho é um texto fixo: o link público do arquivo. */
  variaveis: Record<string, FonteDaVariavel>;
};

export type ConteudoDoTelegram = { tipo: "telegram"; texto: string; botao: { texto: string; url: string } | null };

export type ConteudoDoDisparo = ConteudoDoWhatsapp | ConteudoDoTelegram;

export type DadosDoContato = { nome: string; primeiroNome: string | null; empresa: string | null; cargo: string | null };

function valorDoCampo(campo: CampoDoContato, contato: DadosDoContato): string | null {
  if (campo === "primeiro_nome") return contato.primeiroNome?.trim() || primeiroNome(contato.nome);
  if (campo === "nome") return contato.nome.trim() || null;
  return contato[campo]?.trim() || null;
}

export type TemplatePreenchido = { ok: true; componentes: Record<string, unknown>[]; texto: string } | { ok: false; motivo: string };

/**
 * O template preenchido para um contato (§4.19): os componentes no formato do
 * envio da Cloud API e o texto como chega, para a prévia e para a trilha.
 * Variável sem valor deixa o contato de fora, com o motivo: nada sai pela
 * metade.
 */
export function preencherTemplate(conteudo: ConteudoDoWhatsapp, contato: DadosDoContato): TemplatePreenchido {
  const { template } = conteudo;
  const valores = new Map<string, string>();
  for (const variavel of variaveisDoTemplate(template)) {
    const id = idDaVariavel(variavel);
    const fonte = conteudo.variaveis[id];
    const valor = !fonte ? null : "campo" in fonte ? valorDoCampo(fonte.campo, contato) : fonte.texto.trim() || null;
    if (!valor) {
      const de = fonte && "campo" in fonte ? `sem ${ROTULO_DO_CAMPO[fonte.campo].toLowerCase()}` : "sem valor";
      return { ok: false, motivo: `Contato ${de} para ${rotuloDaVariavel(variavel)}.` };
    }
    valores.set(id, valor);
  }

  const nomeado = template.formato === "named";
  const parametro = (id: string, chave: string) => ({ type: "text", text: valores.get(id)!, ...(nomeado ? { parameter_name: chave } : {}) });
  const componentes: Record<string, unknown>[] = [];
  const variaveis = variaveisDoTemplate(template);

  const midia = variaveis.find((v) => v.onde === "midia");
  const doCabecalho = variaveis.filter((v) => v.onde === "cabecalho");
  if (midia && midia.onde === "midia") {
    const tipo = midia.formato.toLowerCase();
    componentes.push({ type: "header", parameters: [{ type: tipo, [tipo]: { link: valores.get("midia") } }] });
  } else if (doCabecalho.length > 0) {
    componentes.push({ type: "header", parameters: doCabecalho.map((v) => parametro(idDaVariavel(v), (v as { chave: string }).chave)) });
  }
  const doCorpo = variaveis.filter((v) => v.onde === "corpo");
  if (doCorpo.length > 0) componentes.push({ type: "body", parameters: doCorpo.map((v) => parametro(idDaVariavel(v), (v as { chave: string }).chave)) });
  for (const variavel of variaveis) {
    if (variavel.onde !== "botao") continue;
    componentes.push({ type: "button", sub_type: "url", index: String(variavel.indice), parameters: [{ type: "text", text: valores.get(idDaVariavel(variavel)) }] });
  }

  const trocar = (texto: string | undefined, onde: "cabecalho" | "corpo") =>
    (texto ?? "").replace(PLACEHOLDER, (_trecho, chave: string) => valores.get(`${onde}:${chave}`) ?? "");
  const cabecalho = componente(template, "HEADER");
  const partes = [
    cabecalho && !midia ? trocar(cabecalho.text, "cabecalho") : null,
    trocar(componente(template, "BODY")?.text, "corpo"),
    componente(template, "FOOTER")?.text ?? null,
  ].filter((parte): parte is string => Boolean(parte?.trim()));
  return { ok: true, componentes, texto: partes.join("\n\n") };
}

// --- Quem recebe ---------------------------------------------------------------

export type ContatoParaDisparo = {
  naoContatarEm: Date | null;
  telefone: string | null;
  whatsappAutorizadoEm: Date | null;
  whatsappSaiuEm: Date | null;
  telegramId?: string | null;
  telegramSaiuEm?: Date | null;
  /** O último envio a ele pelo mesmo canal, em outro disparo. */
  ultimoEnvioNoCanalEm: Date | null;
};

/**
 * Por que o contato fica de fora do disparo, ou null se ele recebe (§4.18). A
 * mesma regra vale na confirmação e na hora de cada envio: quem saiu depois de
 * confirmado também fica de fora.
 */
export function motivoParaPular(canal: TipoDeCanal, contato: ContatoParaDisparo, agora: Date, intervaloHoras: number): string | null {
  if (contato.naoContatarEm) return "Pediu para não ser contatado.";
  if (canal === "whatsapp") {
    if (!contato.telefone) return "Sem telefone.";
    if (contato.whatsappSaiuEm) return "Saiu do WhatsApp.";
    if (!contato.whatsappAutorizadoEm) return "Sem autorização para o WhatsApp.";
  } else {
    if (!contato.telegramId) return "Não entrou pelo bot do Telegram.";
    if (contato.telegramSaiuEm) return "Saiu do Telegram.";
  }
  if (contato.ultimoEnvioNoCanalEm && agora.getTime() - new Date(contato.ultimoEnvioNoCanalEm).getTime() < intervaloHoras * 3_600_000) {
    return `Recebeu outro disparo pelo ${NOME_DO_CANAL[canal]} há menos de ${intervaloHoras} h.`;
  }
  return null;
}

// --- Janela ----------------------------------------------------------------------

export type JanelaDosDisparos = { inicio: string; fim: string; fuso: string };

const local = (instante: Date, fuso: string) => Temporal.Instant.fromEpochMilliseconds(instante.getTime()).toZonedDateTimeISO(fuso);

/** Dentro da janela de envio (§4.18, D17): das 8h às 21h no horário de Brasília, todo dia. */
export function dentroDaJanela(agora: Date, janela: JanelaDosDisparos): boolean {
  const hora = local(agora, janela.fuso).toPlainTime();
  return Temporal.PlainTime.compare(hora, Temporal.PlainTime.from(janela.inicio)) >= 0 && Temporal.PlainTime.compare(hora, Temporal.PlainTime.from(janela.fim)) < 0;
}

/** Quando a janela abre de novo: agora, se já está aberta; senão, o próximo início. */
export function proximaAbertura(agora: Date, janela: JanelaDosDisparos): Date {
  if (dentroDaJanela(agora, janela)) return agora;
  const aqui = local(agora, janela.fuso);
  const inicio = Temporal.PlainTime.from(janela.inicio);
  const dia = Temporal.PlainTime.compare(aqui.toPlainTime(), inicio) < 0 ? aqui.toPlainDate() : aqui.toPlainDate().add({ days: 1 });
  return new Date(dia.toZonedDateTime({ timeZone: janela.fuso, plainTime: inicio }).epochMilliseconds);
}

// --- Erros da Meta -----------------------------------------------------------------

/**
 * Como a fila trata cada erro da Cloud API (docs/pesquisa/whatsapp-cloud-api.md):
 * - `contato`: falha só deste envio, sem nova tentativa;
 * - `saiu`: a pessoa parou o marketing: falha e o contato sai do WhatsApp;
 * - `ritmo`: espera e tenta de novo (até o teto de tentativas);
 * - `esperar`: falha agora, mas "Tentar de novo as falhas" pode dar certo depois;
 * - `template`: o problema é do template: o disparo pausa;
 * - `conta`: o problema é da conta (token, permissão, pagamento, restrição): o disparo pausa e o canal fica com erro.
 */
export type ClasseDoErro = "contato" | "saiu" | "ritmo" | "esperar" | "template" | "conta";

const ERROS_DA_META: Record<string, { classe: ClasseDoErro; motivo: string }> = {
  "131026": { classe: "contato", motivo: "O número não recebe mensagens do WhatsApp (sem conta, termos não aceitos ou app desatualizado)." },
  "131047": { classe: "contato", motivo: "Fora da janela de 24 h: só template pode sair." },
  "130403": { classe: "contato", motivo: "A empresa bloqueou este número no WhatsApp." },
  "131021": { classe: "contato", motivo: "O destinatário é o próprio número da empresa." },
  "131050": { classe: "saiu", motivo: "A pessoa parou as mensagens de marketing da empresa no WhatsApp." },
  "131049": { classe: "esperar", motivo: "O WhatsApp segurou para não lotar a caixa da pessoa. Tente de novo depois de 24 h." },
  "130429": { classe: "ritmo", motivo: "Limite de mensagens por segundo do número." },
  "131056": { classe: "ritmo", motivo: "Muitas mensagens para o mesmo número em pouco tempo." },
  "80007": { classe: "ritmo", motivo: "Limite de chamadas da conta do WhatsApp Business." },
  "4": { classe: "ritmo", motivo: "Limite de chamadas do app na Meta." },
  "131057": { classe: "ritmo", motivo: "A conta está em manutenção na Meta." },
  "131000": { classe: "ritmo", motivo: "Erro da Meta, tentando de novo." },
  "131016": { classe: "ritmo", motivo: "Serviço da Meta instável, tentando de novo." },
  "133004": { classe: "ritmo", motivo: "Serviço da Meta instável, tentando de novo." },
  "1": { classe: "ritmo", motivo: "Erro da Meta, tentando de novo." },
  "2": { classe: "ritmo", motivo: "Serviço da Meta instável, tentando de novo." },
  "132000": { classe: "template", motivo: "O número de variáveis não bate com o template." },
  "131008": { classe: "template", motivo: "Falta um parâmetro obrigatório do template." },
  "132012": { classe: "template", motivo: "Uma variável do template tem formato inválido." },
  "131009": { classe: "template", motivo: "Um valor enviado ao template é inválido." },
  "132018": { classe: "template", motivo: "A Meta recusou o template na validação." },
  "135000": { classe: "template", motivo: "A Meta recusou os parâmetros do template." },
  "100": { classe: "template", motivo: "A Meta recusou um parâmetro do envio." },
  "132001": { classe: "template", motivo: "O template não existe nesse idioma ou não está aprovado." },
  "132015": { classe: "template", motivo: "A Meta pausou o template por qualidade baixa. Retome depois que ele for liberado." },
  "132016": { classe: "template", motivo: "A Meta desativou o template de vez. Use outro." },
  "131063": { classe: "template", motivo: "O marketing está desligado na Cloud API desta conta." },
  "190": { classe: "conta", motivo: "O token do WhatsApp venceu ou foi revogado. Conecte de novo." },
  "0": { classe: "conta", motivo: "O token do WhatsApp não vale. Conecte de novo." },
  "10": { classe: "conta", motivo: "O token não tem permissão para esta conta do WhatsApp Business." },
  "200": { classe: "conta", motivo: "O token não tem permissão para esta conta do WhatsApp Business." },
  "3": { classe: "conta", motivo: "O app não tem acesso a este recurso da Meta." },
  "131005": { classe: "conta", motivo: "Acesso negado pela Meta." },
  "131042": { classe: "conta", motivo: "Problema de pagamento na conta do WhatsApp Business." },
  "131048": { classe: "conta", motivo: "A Meta restringiu os envios do número por bloqueios e denúncias." },
  "131064": { classe: "conta", motivo: "A Meta limitou a conta por violação na classificação de templates." },
  "368": { classe: "conta", motivo: "A conta foi restrita pela política da Meta." },
  "131031": { classe: "conta", motivo: "A conta do WhatsApp Business foi bloqueada." },
  "130497": { classe: "conta", motivo: "A conta não pode enviar para este país." },
  "131045": { classe: "conta", motivo: "O número não está registrado na Cloud API." },
  "133010": { classe: "conta", motivo: "O número não está registrado na Cloud API." },
};

/** Erro sem código conhecido tenta de novo poucas vezes: pode ser instabilidade. */
export function classificarErroDaMeta(codigo: number | string | null | undefined): { classe: ClasseDoErro; motivo: string } {
  return ERROS_DA_META[String(codigo ?? "")] ?? { classe: "ritmo", motivo: `Erro da Meta (${codigo ?? "sem código"}).` };
}

// --- Status do envio ---------------------------------------------------------------

const ORDEM: Partial<Record<StatusDoEnvio, number>> = { pendente: 0, enviando: 1, enviado: 2, entregue: 3, lido: 4 };
const DA_META: Record<string, StatusDoEnvio> = { sent: "enviado", delivered: "entregue", read: "lido", failed: "falhou" };

/**
 * O status novo do envio por um aviso do canal, ou null se o aviso não muda
 * nada. O status só anda para a frente: aviso repetido ou fora de ordem (a
 * Meta repete por até 7 dias e `read` pode vir sem `delivered`) não volta
 * estado. Falha só vale antes de entregue.
 */
export function proximoStatusDoEnvio(atual: StatusDoEnvio, aviso: string): StatusDoEnvio | null {
  const novo = DA_META[aviso];
  if (!novo || atual === "falhou" || atual === "pulado" || atual === "cancelado") return null;
  if (novo === "falhou") return atual === "enviando" || atual === "enviado" ? "falhou" : null;
  return (ORDEM[novo] ?? 0) > (ORDEM[atual] ?? 0) ? novo : null;
}

// --- Saída do canal ----------------------------------------------------------------

const PALAVRAS_DE_SAIDA = new Set([
  "sair",
  "parar",
  "pare",
  "stop",
  "cancelar",
  "descadastrar",
  "descadastro",
  "/sair",
  "/stop",
  // Rótulos de botão de saída de template (quick reply).
  "parar promocoes",
  "stop promotions",
  "sair da lista",
]);

/**
 * A mensagem pede para sair do canal (§4.19 e §4.20): uma palavra de saída
 * sozinha (sem diferença de caixa ou acento) ou um pedido claro para parar
 * (o detector da §7).
 */
export function pedeParaSair(texto: string): boolean {
  const limpo = semAcentos(texto).toLowerCase().replace(/[.!?¡¿,;:"'()\s]+/g, " ").trim();
  return PALAVRAS_DE_SAIDA.has(limpo) || detectarOptout(texto).claro;
}

// --- Limite da Meta --------------------------------------------------------------

const TIERS: Record<string, number> = { TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10_000, TIER_100K: 100_000 };

/**
 * Quantos destinatários únicos em 24 h o portfólio pode alcançar (§4.19), pelo
 * `whatsapp_business_manager_messaging_limit` do número. Ilimitado ou
 * desconhecido: null (a fila não segura; a Meta, se for o caso, recusa).
 */
export function limiteDoTier(tier: string | null | undefined): number | null {
  return TIERS[(tier ?? "").toUpperCase()] ?? null;
}

// --- Custo ---------------------------------------------------------------------------

export type PrecosDoWhatsapp = { precos: Record<string, number>; moeda: string; tabela_em: string };

/** A estimativa da Meta para N mensagens entregues da categoria do template (§4.19). Sem preço da categoria, null. */
export function estimativaDoCusto(quantas: number, categoria: string, tabela: PrecosDoWhatsapp): { valor: number; moeda: string } | null {
  const preco = tabela.precos[categoria.toLowerCase()];
  if (preco === undefined) return null;
  return { valor: Math.round(quantas * preco * 100) / 100, moeda: tabela.moeda };
}
