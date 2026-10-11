import type { ReactNode } from "react";
import type { PublicoSalvo } from "@/server/publicos/publicos";

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-tinta-fraca">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** O público em leitura: quem, empresa, por que precisa, ângulo, provas e quem não é. */
export function ResumoDoPublico({ p }: { p: PublicoSalvo }) {
  const { por_que: porQue, empresa } = p;
  return (
    <dl className="grid gap-2 text-sm">
      <Linha rotulo="Quem">
        {p.quem.cargos.join(", ")}
        {p.quem.senioridade && <span className="text-tinta-suave"> · {p.quem.senioridade}</span>}
      </Linha>
      <Linha rotulo="Empresa">{[empresa.setores.join(", "), empresa.porte, empresa.regiao].filter(Boolean).join(" · ")}</Linha>
      <Linha rotulo="Por que precisa">
        {porQue.dor}
        {porQue.gatilho && <span className="text-tinta-suave"> Hora certa: {porQue.gatilho}</span>}
        <span className="text-tinta-suave"> Resultado: {porQue.resultado}</span>
      </Linha>
      <Linha rotulo="Ângulo">{p.angulo}</Linha>
      <Linha rotulo="Provas">{p.provas.length > 0 ? p.provas.join(" · ") : <span className="text-tinta-fraca">nenhuma</span>}</Linha>
      {p.quem_nao_e && <Linha rotulo="Quem não é">{p.quem_nao_e}</Linha>}
    </dl>
  );
}
