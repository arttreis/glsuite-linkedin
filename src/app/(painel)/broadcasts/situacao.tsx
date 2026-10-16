import type { StatusDoDisparo } from "@/domain/disparos";
import type { Contagem } from "@/server/disparos/disparos";

const STATUS: Record<StatusDoDisparo, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: "Rascunho", tom: "" },
  agendado: { rotulo: "Agendado", tom: "etiqueta-ponto etiqueta-info" },
  enviando: { rotulo: "Saindo", tom: "etiqueta-ponto etiqueta-ok" },
  pausado: { rotulo: "Pausado", tom: "etiqueta-ponto etiqueta-atencao" },
  concluido: { rotulo: "Concluído", tom: "etiqueta-ponto" },
  cancelado: { rotulo: "Cancelado", tom: "opacity-70" },
};

export function EtiquetaDoDisparo({ status }: { status: StatusDoDisparo }) {
  return <span className={`etiqueta ${STATUS[status].tom}`}>{STATUS[status].rotulo}</span>;
}

/** Quantos já saíram (enviados, entregues ou lidos), quantos não vão sair (falhas e pulados) e quantos faltam. */
export function progresso(contagem: Contagem) {
  const sairam = contagem.enviado + contagem.entregue + contagem.lido;
  const naoVao = contagem.falhou + contagem.pulado + contagem.cancelado;
  const faltam = contagem.pendente + contagem.enviando;
  return { sairam, naoVao, faltam, total: sairam + naoVao + faltam };
}

/** "2 saíram · 1 lida · 1 respondeu", no singular quando é um só. */
export function resumoDoDisparo(contagem: Contagem): string {
  const { sairam } = progresso(contagem);
  return [
    `${sairam} ${sairam === 1 ? "saiu" : "saíram"}`,
    `${contagem.lido} ${contagem.lido === 1 ? "lida" : "lidas"}`,
    `${contagem.responderam} ${contagem.responderam === 1 ? "respondeu" : "responderam"}`,
  ].join(" · ");
}

/** A barra do disparo: o que já saiu sobre o que vai sair. */
export function BarraDoDisparo({ contagem }: { contagem: Contagem }) {
  const { sairam, faltam } = progresso(contagem);
  const vao = sairam + faltam;
  const parte = vao === 0 ? 0 : Math.round((sairam / vao) * 100);
  return (
    <div className="barra" role="progressbar" aria-valuenow={parte} aria-valuemin={0} aria-valuemax={100} aria-label="Quanto já saiu">
      <span style={{ width: `${parte}%` }} />
    </div>
  );
}
