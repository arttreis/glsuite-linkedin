import { redirect } from "next/navigation";
import { Cabecalho } from "@/components/cabecalho";
import type { Publico } from "@/domain/publico";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { exigirOperador } from "@/server/supabase/servidor";
import { EditorDoPublico } from "../editor";

const EM_BRANCO: Publico = {
  nome: "",
  quem: { cargos: [""], senioridade: "" },
  empresa: { setores: [""], porte: "", regiao: "" },
  por_que: { dor: "", gatilho: "", resultado: "" },
  angulo: "",
  provas: [],
  quem_nao_e: "",
  praca: "domestico",
};

export default async function NovoPublicoPage() {
  const operador = await exigirOperador();
  const dossie = await comOperador(obterDb(), operador.id, (tx) => dossieConfirmado(tx, operador.organizacaoId));
  if (!dossie) redirect(`/publicos?msg=${encodeURIComponent("Confirme o dossiê da oferta antes de criar públicos.")}`);

  return (
    <>
      <Cabecalho
        titulo="Novo público"
        descricao="Quem compra e por quê. Público criado à mão já nasce escolhido."
        voltar={{ href: "/publicos", rotulo: "Públicos" }}
      />
      <div className="max-w-3xl">
        <EditorDoPublico id={null} inicial={EM_BRANCO} status="novo" provasDoDossie={dossie.provas.map((p) => p.texto)} />
      </div>
    </>
  );
}
