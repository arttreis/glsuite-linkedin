import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDaCampanha } from "@/components/etiquetas";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { fluxoDaCampanha } from "@/server/fluxo/fluxos";
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
  status: "rascunho" | "ativa" | "pausada" | "encerrada";
  publico_id: string | null;
  publico_nome: string | null;
  publico_provas: string[] | null;
};

const PROXIMOS_STATUS: Record<Campanha["status"], { status: string; rotulo: string; estilo: string }[]> = {
  rascunho: [{ status: "ativa", rotulo: "Ativar", estilo: "botao-primario" }],
  ativa: [
    { status: "pausada", rotulo: "Pausar", estilo: "" },
    { status: "encerrada", rotulo: "Encerrar", estilo: "botao-perigo" },
  ],
  pausada: [
    { status: "ativa", rotulo: "Reativar", estilo: "botao-primario" },
    { status: "encerrada", rotulo: "Encerrar", estilo: "botao-perigo" },
  ],
  encerrada: [],
};

export default async function CampanhaPage({ params, searchParams }: PageProps<"/campanhas/[id]">) {
  const operador = await exigirOperador();
  const { id } = await params;
  const { salva, msg, gerado } = await searchParams;
  const { campanha, fluxo } = await comOperador(obterDb(), operador.id, async (tx) => {
    const [campanha] = await tx.query<Campanha>(
      `select c.id, c.perfil_id, c.nome, c.angulo, c.nicho, c.modo_copy, c.max_leads, c.status,
              c.publico_id, pu.nome as publico_nome, pu.provas as publico_provas
         from public.campanhas c left join public.publicos pu on pu.id = c.publico_id
        where c.id = $1::uuid`,
      [id],
    );
    return { campanha, fluxo: campanha ? await fluxoDaCampanha(tx, id) : null };
  });
  if (!campanha || !fluxo) notFound();
  // Erro de ativação volta pela URL (acoes.ts).
  const erroDeStatus = typeof msg === "string" ? msg : undefined;
  const { perfis, angulos, exemplo } = await dadosDoEditor(operador.id);

  return (
    <>
      <Cabecalho
        titulo={campanha.nome}
        descricao="Edite os dados e o fluxo da campanha. Cada bloco Fim decide o que acontece com quem não responde."
        voltar={
          campanha.publico_id
            ? { href: `/publicos/${campanha.publico_id}?aba=abordagem`, rotulo: campanha.publico_nome ?? "Público" }
            : { href: "/campanhas", rotulo: "Campanhas" }
        }
      >
        <EtiquetaDaCampanha status={campanha.status} />
        {PROXIMOS_STATUS[campanha.status].map((proximo) => (
          <form key={proximo.status} action={alterarStatusDaCampanha}>
            <input type="hidden" name="campanhaId" value={campanha.id} />
            <input type="hidden" name="status" value={proximo.status} />
            <button type="submit" className={`botao ${proximo.estilo}`}>
              {proximo.rotulo}
            </button>
          </form>
        ))}
      </Cabecalho>
      <div className="max-w-6xl">
        {erroDeStatus && (
          <Aviso tom="erro" className="mb-5">
            {erroDeStatus}
          </Aviso>
        )}
        {gerado === "ok" && !erroDeStatus && (
          <Aviso tom="ok" className="mb-5">
            A IA escreveu as mensagens para o público e elas passaram no validador. Revise, ajuste o que quiser e ative.
          </Aviso>
        )}
        {gerado === "marcado" && !erroDeStatus && (
          <Aviso tom="atencao" className="mb-5">
            A IA escreveu as mensagens, mas algumas ficaram marcadas pelo validador ou citam número fora das provas do público.
            Corrija os blocos marcados antes de ativar.
          </Aviso>
        )}
        {salva && !erroDeStatus && (
          <Aviso tom="ok" className="mb-5">
            Campanha salva.
          </Aviso>
        )}
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
            fluxo,
            publico: campanha.publico_id
              ? { id: campanha.publico_id, nome: campanha.publico_nome ?? "", provas: campanha.publico_provas ?? [] }
              : null,
          }}
        />
      </div>
    </>
  );
}
