import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { obterPublico } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";
import { EditorDoPublico } from "../editor";

export default async function PublicoPage({ params }: PageProps<"/publicos/[id]">) {
  const operador = await exigirOperador();
  const { id } = await params;
  const { publico, dossie } = await comOperador(obterDb(), operador.id, async (tx) => ({
    publico: await obterPublico(tx, id),
    dossie: await dossieConfirmado(tx, operador.organizacaoId),
  }));
  if (!publico) notFound();
  if (publico.status === "arquivado") redirect(`/publicos?msg=${encodeURIComponent("Use de novo o público antes de editar.")}`);
  if (!dossie) redirect(`/publicos?msg=${encodeURIComponent("Confirme o dossiê da oferta antes de editar públicos.")}`);

  const status = publico.status === "sugerido" ? "sugerido" : "ativo";
  const { nome, quem, empresa, por_que, angulo, provas, quem_nao_e, praca, desatualizado } = publico;
  const inicial = { nome, quem, empresa, por_que, angulo, provas, quem_nao_e, praca };

  return (
    <>
      <Cabecalho
        titulo={publico.nome}
        descricao={status === "sugerido" ? "Sugestão da IA. Ajuste o que precisar e escolha." : "Público escolhido. Mudanças valem para as próximas campanhas."}
        voltar={{ href: "/publicos", rotulo: "Públicos" }}
      />
      <div className="max-w-3xl">
        {desatualizado && (
          <Aviso tom="atencao" className="mb-5">
            O dossiê foi confirmado de novo depois deste público. Revise e salve para tirar o aviso.
          </Aviso>
        )}
        <EditorDoPublico id={publico.id} inicial={inicial} status={status} provasDoDossie={dossie.provas.map((p) => p.texto)} />
      </div>
    </>
  );
}
