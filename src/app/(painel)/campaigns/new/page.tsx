import { ArrowRight, Plus } from "lucide-react";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import type { Publico } from "@/domain/publico";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { listarPublicos } from "@/server/publicos/publicos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { EditorDoPublico } from "../editor-do-publico";
import { BotaoSugerir } from "./botao-sugerir";
import { criarCampanhaDoPainel } from "../acoes";

const EM_BRANCO: Publico = {
  nome: "",
  quem: { cargos: [""], senioridade: "" },
  empresa: { setores: [""], porte: "", regiao: "" },
  por_que: { dor: "", gatilho: "", resultado: "" },
  angulo: "",
  provas: [],
  quem_nao_e: "",
};

/**
 * Campanha nova (§4.11): repete os passos de leads e abordagem do primeiro
 * acesso, agora pela conta da pessoa. Escolhe o público e a conta; a busca, a
 * abordagem e a permissão vêm nas abas da campanha.
 */
export default async function NovaCampanhaPage({ searchParams }: PageProps<"/campaigns/new">) {
  const operador = await exigirOperadorComModulo("linkedin");
  const { msg } = await searchParams;
  const { publicos, contas, dossie } = await comOperador(obterDb(), operador.id, async (tx) => ({
    publicos: (await listarPublicos(tx, operador.organizacaoId)).filter((p) => p.status !== "arquivado"),
    contas: await tx.query<{ id: string; nome: string; status: string }>(
      "select id, nome, status from public.perfis where not casa and arquivado_em is null and public.pode_ver_perfil(id) order by nome",
    ),
    dossie: await dossieConfirmado(tx, operador.organizacaoId),
  }));
  const sugeridos = publicos.filter((p) => p.status === "sugerido");

  return (
    <>
      <Cabecalho
        titulo="Nova campanha"
        descricao="Para quem e por qual conta. Depois você traz os leads, revisa a abordagem e dá a permissão. Nada sai antes disso."
        voltar={{ href: "/campaigns", rotulo: "Campanhas" }}
      >
        <BotaoSugerir principal={publicos.length === 0} desabilitado={!dossie} jaTemSugestoes={sugeridos.length > 0} />
      </Cabecalho>
      <div className="flex max-w-3xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {!dossie && <Aviso tom="atencao">Confirme a análise do site em Configurações antes: o público e a abordagem saem dela.</Aviso>}
        {contas.length === 0 && <Aviso tom="atencao">Você não opera nenhuma conta do LinkedIn. Vincule uma em Configurações.</Aviso>}

        {publicos.length > 0 && contas.length > 0 && (
          <form action={criarCampanhaDoPainel} className="flex flex-col gap-5">
            <fieldset className="cartao p-5">
              <legend className="px-1 text-[15px] font-semibold">Para quem</legend>
              <ul className="mt-2 flex flex-col gap-2">
                {publicos.map((p, indice) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linha p-3 has-[:checked]:border-destaque/50 has-[:checked]:bg-destaque/[0.05]">
                      <input type="radio" name="publicoId" value={p.id} defaultChecked={indice === 0} required className="mt-1" />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {p.nome}
                          {p.status === "sugerido" && <span className="etiqueta">sugestão da IA</span>}
                          {p.aderencia && (
                            <span className="etiqueta" title={p.aderencia.motivo}>
                              aderência {p.aderencia.nota}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-tinta-suave">
                          {p.quem.cargos.filter(Boolean).join(", ")}
                          {p.empresa.regiao ? ` · ${p.empresa.regiao}` : ""}
                        </span>
                        {p.por_que.dor && <span className="mt-1 block text-[13px] text-tinta-fraca">Por que: {p.por_que.dor}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <fieldset className="cartao p-5">
              <legend className="px-1 text-[15px] font-semibold">Por qual conta do LinkedIn</legend>
              <select name="perfilId" required className="campo mt-2" defaultValue={contas[0]?.id}>
                {contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.nome}
                    {conta.status !== "ativo" ? " (pausada)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[13px] text-tinta-suave">A busca de leads roda por ela, e o teto do dia é dela, somando as campanhas.</p>
            </fieldset>

            <div className="flex justify-end">
              <button type="submit" className="botao botao-primario">
                Criar a campanha
                <ArrowRight aria-hidden />
              </button>
            </div>
          </form>
        )}

        {dossie && (
          <details className="cartao p-5" open={publicos.length === 0}>
            <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
              <Plus className="size-4 text-tinta-suave" aria-hidden />
              Criar um público do zero
            </summary>
            <div className="mt-4">
              <EditorDoPublico
                id={null}
                inicial={EM_BRANCO}
                status="novo"
                provasDoDossie={dossie.provas.map((prova) => prova.texto)}
                destino="/campaigns/new"
              />
            </div>
          </details>
        )}
      </div>
    </>
  );
}
