import { FileJson, Link2, Plug, RefreshCw, Webhook } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDoPerfil } from "@/components/etiquetas";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import {
  atualizarStatusDasContas,
  conectarLinkedIn,
  registrarResultadoDoEval,
  registrarWebhooksNaUnipile,
  trocarModoDoPerfil,
} from "./acoes";

type LinhaPerfil = {
  id: string;
  nome: string;
  praca: string;
  status: "ativo" | "pausado";
  motivo_pausa: string | null;
  conectado: boolean;
  unipile_status: string | null;
  tipo_conta: string;
  modo_resposta: string;
  nunca_ativado: boolean;
  acessivel: boolean;
};

const PRACAS: Record<string, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

const MODOS = [
  { valor: "automatico", rotulo: "O SDR responde sozinho" },
  { valor: "aprovacao", rotulo: "Aprovo cada resposta" },
] as const;

const AVISOS: Record<string, { tom: "ok" | "erro"; texto: string }> = {
  ok: { tom: "ok", texto: "Conta conectada. O perfil segue pausado até alguém ativar." },
  falhou: { tom: "erro", texto: "A conexão não foi concluída na Unipile. Tente de novo." },
};

export default async function PerfisPage({ searchParams }: PageProps<"/perfis">) {
  const operador = await exigirOperador();
  const params = await searchParams;
  const perfis = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<LinhaPerfil>(`
      select id, nome, praca, status, motivo_pausa, unipile_account_id is not null as conectado,
             unipile_status, tipo_conta, modo_resposta, ativado_em is null as nunca_ativado,
             public.pode_ver_perfil(id) as acessivel
        from public.perfis
       order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug), nome`),
  );
  const bloqueios = typeof params.bloqueio === "string" ? [params.bloqueio] : (params.bloqueio ?? []);
  const aviso = typeof params.conexao === "string" ? AVISOS[params.conexao] : undefined;

  return (
    <>
      <Cabecalho titulo="Perfis" descricao="Conexão com o LinkedIn e modo de resposta de cada perfil da casa.">
        <form action={atualizarStatusDasContas}>
          <button type="submit" className="botao">
            <RefreshCw aria-hidden />
            Atualizar status das contas
          </button>
        </form>
      </Cabecalho>
      <div className="flex max-w-4xl flex-col gap-4">
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        {bloqueios.length > 0 && (
          <Aviso tom="atencao">
            <p className="font-medium">Não foi possível:</p>
            <ul className="mt-1 list-disc pl-5">
              {bloqueios.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          </Aviso>
        )}
        {typeof params.eval === "string" && <Aviso tom="ok">Eval registrado ({params.eval}).</Aviso>}
        {typeof params.webhooks === "string" && (
          <Aviso tom="ok">Webhooks conferidos na Unipile ({params.webhooks} criados agora).</Aviso>
        )}

        <ul className="flex flex-col gap-4">
          {perfis.map((perfil) => (
            <li key={perfil.id} id={`perfil-${perfil.id}`} className="cartao scroll-mt-6 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nome={perfil.nome} />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {perfil.nome} <span className="ml-1 text-sm font-normal text-tinta-fraca">{PRACAS[perfil.praca]}</span>
                    </p>
                    <p className="text-xs text-tinta-suave">
                      {perfil.conectado
                        ? `LinkedIn conectado (${perfil.unipile_status ?? "status desconhecido"}, conta ${perfil.tipo_conta})`
                        : "LinkedIn não conectado"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <EtiquetaDoPerfil status={perfil.status} nuncaAtivado={perfil.nunca_ativado} />
                  {perfil.acessivel && (
                    <form action={conectarLinkedIn}>
                      <input type="hidden" name="perfilId" value={perfil.id} />
                      <button type="submit" className="botao botao-pequeno">
                        <Link2 aria-hidden />
                        {perfil.conectado ? "Reconectar LinkedIn" : "Conectar LinkedIn"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
              {perfil.status === "pausado" && !perfil.nunca_ativado && perfil.motivo_pausa && (
                <p className="recuo mt-4">{perfil.motivo_pausa}</p>
              )}
              {perfil.acessivel && (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-linha pt-4">
                  <form action={trocarModoDoPerfil} className="flex items-center gap-2">
                    <input type="hidden" name="perfilId" value={perfil.id} />
                    <label htmlFor={`modo-${perfil.id}`} className="text-[13px] text-tinta-suave">
                      Modo de resposta
                    </label>
                    <select
                      id={`modo-${perfil.id}`}
                      name="modo"
                      defaultValue={perfil.modo_resposta}
                      className="campo campo-pequeno"
                    >
                      {MODOS.filter((modo) => modo.valor !== "automatico" || perfil.praca !== "espanha").map((modo) => (
                        <option key={modo.valor} value={modo.valor}>
                          {modo.rotulo}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="botao botao-pequeno">
                      Trocar
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>

        {operador.papel === "admin" && (
          <section className="cartao mt-2 p-5">
            <h2 className="text-[15px] font-semibold">Administração</h2>
            <p className="mt-1 text-[13px] text-tinta-suave">Vale para todos os perfis.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={registrarWebhooksNaUnipile}>
                <button type="submit" className="botao">
                  <Webhook aria-hidden />
                  Registrar webhooks na Unipile
                </button>
              </form>
              <Link href="/integracoes" className="botao">
                <Plug aria-hidden />
                Integrações (RD Station)
              </Link>
            </div>
            <form action={registrarResultadoDoEval} className="mt-5 flex flex-col gap-2 border-t border-linha pt-5">
              <label htmlFor="relatorio" className="text-sm font-medium">
                Resultado do eval
              </label>
              <p className="text-[13px] text-tinta-suave">
                Suba o relatorio.json da rodada para comparar versões de prompt. Não trava mais o modo automático.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <input id="relatorio" name="relatorio" type="file" accept="application/json,.json" className="campo-arquivo" />
                <button type="submit" className="botao botao-pequeno">
                  <FileJson aria-hidden />
                  Registrar eval
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
