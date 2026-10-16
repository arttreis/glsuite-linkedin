import type { TemplateDoWhatsapp } from "@/domain/disparos";
import { ErroDaMeta, type ClienteWhatsapp, type EnvioDeTemplate, type NumeroDoWhatsapp } from "@/server/whatsapp/cliente";

/** Um template aprovado de marketing com o primeiro nome e a empresa no corpo. */
export const TEMPLATE_OFERTA: TemplateDoWhatsapp = {
  id: "tpl-oferta",
  nome: "oferta_outubro",
  idioma: "pt_BR",
  categoria: "MARKETING",
  status: "APPROVED",
  formato: "positional",
  componentes: [{ type: "BODY", text: "Oi {{1}}, a {{2}} tem novidade. Responda SAIR para não receber mais." }],
};

/**
 * A Cloud API de mentira: guarda as chamadas e responde o que o teste pedir.
 * `erroNoEnvio` decide, por destino, o erro de cada envio (o resto dá certo).
 */
export class WhatsappFalso implements ClienteWhatsapp {
  numero: NumeroDoWhatsapp = { id: "200100", numero: "+55 11 4000-0000", nomeVerificado: "GuessLess", qualidade: "GREEN", limite: "TIER_2K" };
  templates: TemplateDoWhatsapp[] = [TEMPLATE_OFERTA, { ...TEMPLATE_OFERTA, id: "tpl-pendente", nome: "rascunho", status: "PENDING" }];
  erroNaConferencia: ErroDaMeta | null = null;
  erroNaInscricao: ErroDaMeta | null = null;
  erroNoEnvio = new Map<string, ErroDaMeta>();
  /** Cada destino devolve este wa_id (ex.: o número sem o 9). */
  waIdDoDestino = new Map<string, string>();
  envios: EnvioDeTemplate[] = [];
  inscricoes: { wabaId: string; urlDoWebhook: string; tokenDeVerificacao: string }[] = [];
  private proximo = 1;

  async conferirNumero() {
    if (this.erroNaConferencia) throw this.erroNaConferencia;
    return this.numero;
  }

  async inscreverApp(p: { wabaId: string; token: string; urlDoWebhook: string; tokenDeVerificacao: string }) {
    if (this.erroNaInscricao) throw this.erroNaInscricao;
    this.inscricoes.push({ wabaId: p.wabaId, urlDoWebhook: p.urlDoWebhook, tokenDeVerificacao: p.tokenDeVerificacao });
  }

  async listarTemplates() {
    if (this.erroNaConferencia) throw this.erroNaConferencia;
    return this.templates;
  }

  async enviarTemplate(p: EnvioDeTemplate) {
    this.envios.push(p);
    const erro = this.erroNoEnvio.get(p.para);
    if (erro) throw erro;
    const wamid = `wamid.${this.proximo++}`;
    return { wamid, waId: this.waIdDoDestino.get(p.para) ?? p.para.replace("+", ""), status: "accepted" };
  }
}

export const erroDaMeta = (codigo: string, status = 400) => new ErroDaMeta({ status, codigo, mensagem: `erro ${codigo}` });
