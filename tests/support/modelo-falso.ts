import type { Classificacao, ConviteT1, Decisao, ModeloDeLinguagem, Resposta, Uso } from "@/server/agente/modelo";

const USO: Uso = { entrada: 1000, saida: 100, cacheLeitura: 0, cacheEscrita: 0 };

/** Modelo de linguagem roteirizado para os testes do agente. */
export class ModeloFalso implements ModeloDeLinguagem {
  classificacoes: Classificacao[] = [];
  decisoes: Decisao[] = [];
  convites: ConviteT1[] = [];
  chamadas: { etapa: "classificar" | "rascunhar" | "escreverConvite"; sistema: string; entrada: string }[] = [];
  falhas: Error[] = [];

  classificacaoPadrao: Classificacao = {
    categoria: "interesse",
    confianca: 0.9,
    sinais: { preco: false, reclamacao: false, idioma: "pt" },
  };

  decisaoPadrao: Decisao = {
    acao: "responder",
    mensagem: "Legal! Em lojas como a sua, o que mais pesa é a margem por canal. Quer que eu te mostre como olhamos isso?",
    motivo: "a pessoa demonstrou interesse",
    estagio_sugerido: "03",
    confianca: 0.9,
  };

  async classificar(p: { sistema: string; entrada: string }): Promise<Resposta<Classificacao>> {
    this.chamadas.push({ etapa: "classificar", ...p });
    const falha = this.falhas.shift();
    if (falha) throw falha;
    return { saida: this.classificacoes.shift() ?? this.classificacaoPadrao, uso: USO, modelo: "falso-classificacao" };
  }

  conviteParaTeste: ConviteT1 = {
    ganchos: ["post recente sobre margem por canal", "cargo novo na Acme"],
    gancho: "post recente sobre margem por canal",
    nota: "Oi Pessoa, vi seu post sobre margem por canal na Acme. Gostei do ponto sobre frete. Bora conectar?",
    motivo: "o post fala do mesmo problema do ângulo",
    confianca: 0.85,
  };

  async escreverConvite(p: { sistema: string; entrada: string }): Promise<Resposta<ConviteT1>> {
    this.chamadas.push({ etapa: "escreverConvite", ...p });
    const falha = this.falhas.shift();
    if (falha) throw falha;
    return { saida: this.convites.shift() ?? this.conviteParaTeste, uso: USO, modelo: "falso-convite" };
  }

  async rascunhar(p: { sistema: string; entrada: string }): Promise<Resposta<Decisao>> {
    this.chamadas.push({ etapa: "rascunhar", ...p });
    return { saida: this.decisoes.shift() ?? this.decisaoPadrao, uso: USO, modelo: "falso-rascunho" };
  }
}
