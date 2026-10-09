import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type Tom = "neutro" | "ok" | "atencao" | "erro";

const ICONES = { neutro: Info, ok: CircleCheck, atencao: TriangleAlert, erro: CircleAlert } as const;

/** Mensagem de retorno de uma ação ou de um bloqueio. Erro é anunciado na hora pelo leitor de tela. */
export function Aviso({ tom = "neutro", className = "", children }: { tom?: Tom; className?: string; children: ReactNode }) {
  const Icone = ICONES[tom];
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={`aviso ${tom === "neutro" ? "" : `aviso-${tom}`} ${className}`}>
      <Icone aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
