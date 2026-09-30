import { notFound } from "next/navigation";
import type { Sequencia } from "@/domain/sequencia";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { alterarStatusDaCampanha } from "../acoes";
import { dadosDoEditor } from "../dados";
import { EditorDeCampanha } from "../editor";

type Campanha = {
  id: string;
  perfil_id: string;
  nome: string;
  angulo: string;
  nicho: string | null;
  modo_copy: "template" | "personalizada";
  max_leads: number | null;
  sequencia: Sequencia;
  status: "rascunho" | "ativa" | "pausada" | "encerrada";
  pos_t4: string;
};

const PROXIMOS_STATUS: Record<Campanha["status"], { status: string; rotulo: string }[]> = {
  rascunho: [{ status: "ativa", rotulo: "Ativar" }],
  ativa: [
    { status: "pausada", rotulo: "Pausar" },
    { status: "encerrada", rotulo: "Encerrar" },
  ],
  pausada: [
    { status: "ativa", rotulo: "Reativar" },
    { status: "encerrada", rotulo: "Encerrar" },
  ],
  encerrada: [],
};

export default async function CampanhaPage({ params, searchParams }: PageProps<"/campanhas/[id]">) {
  const operador = await exigirOperador();
  const { id } = await params;
  const { salva } = await searchParams;
  const [campanha] = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<Campanha>(
      `select id, perfil_id, nome, angulo, nicho, modo_copy, max_leads, sequencia, status, pos_t4
         from public.campanhas where id = $1::uuid`,
      [id],
    ),
  );
  if (!campanha) notFound();
  const { perfis, angulos, exemplo } = await dadosDoEditor(operador.id);

  return (
    <section className="max-w-4xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{campanha.nome}</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium">{campanha.status}</span>
          {PROXIMOS_STATUS[campanha.status].map((proximo) => (
            <form key={proximo.status} action={alterarStatusDaCampanha}>
              <input type="hidden" name="campanhaId" value={campanha.id} />
              <input type="hidden" name="status" value={proximo.status} />
              <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">
                {proximo.rotulo}
              </button>
            </form>
          ))}
        </div>
      </div>
      <p className="mb-5 text-xs text-neutral-500">
        Sem resposta até o T4: {campanha.pos_t4 === "conexao" ? "fica como conexão" : "pausa de 60 dias e volta com ângulo diferente"}.
      </p>
      {salva && <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm">Campanha salva.</p>}
      <EditorDeCampanha
        perfis={perfis}
        angulos={angulos}
        exemplo={exemplo}
        inicial={{
          id: campanha.id,
          perfilId: campanha.perfil_id,
          nome: campanha.nome,
          angulo: campanha.angulo,
          nicho: campanha.nicho,
          modoCopy: campanha.modo_copy,
          maxLeads: campanha.max_leads,
          sequencia: campanha.sequencia,
        }}
      />
    </section>
  );
}
