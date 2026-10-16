import { proximaData, quandoNoLancamento, ROTULO_DO_STATUS, type DatasDoLancamento, type StatusDoLancamento } from "@/domain/lancamentos";

const TOM: Record<StatusDoLancamento, string> = {
  montando: "etiqueta-ponto",
  no_ar: "etiqueta-ponto etiqueta-ok",
  encerrado: "opacity-70",
};

/** O estado do lançamento, sempre com texto (§4.21): pausado é no ar com pausa, e aparece junto. */
export function EtiquetasDoLancamento({ status, pausado }: { status: StatusDoLancamento; pausado: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`etiqueta ${TOM[status]}`}>{ROTULO_DO_STATUS[status]}</span>
      {status === "no_ar" && pausado && <span className="etiqueta etiqueta-ponto etiqueta-atencao">Pausado</span>}
    </span>
  );
}

/** "Próximo: Aula: O método, qui 22/10 às 20h", ou null quando todas as datas passaram. */
export function textoDoProximo(datas: DatasDoLancamento, agora: Date): string | null {
  const proxima = proximaData(datas, agora);
  return proxima ? `Próximo: ${proxima.rotulo}, ${quandoNoLancamento(proxima.em)}` : null;
}
