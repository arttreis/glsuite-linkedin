import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { atualizarStatusDasContas, conectarLinkedIn, registrarWebhooksNaUnipile } from "./acoes";

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
  acessivel: boolean;
};

const PRACAS: Record<string, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

const AVISOS: Record<string, string> = {
  ok: "Conta conectada. O perfil segue pausado até alguém ativar.",
  falhou: "A conexão não foi concluída na Unipile. Tente de novo.",
};

export default async function PerfisPage({ searchParams }: PageProps<"/perfis">) {
  const operador = await exigirOperador();
  const params = await searchParams;
  const perfis = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<LinhaPerfil>(`
      select id, nome, praca, status, motivo_pausa, unipile_account_id is not null as conectado,
             unipile_status, tipo_conta, modo_resposta, public.pode_ver_perfil(id) as acessivel
        from public.perfis
       order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug), nome`),
  );
  const aviso = typeof params.conexao === "string" ? AVISOS[params.conexao] : undefined;

  return (
    <section className="max-w-4xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Perfis</h1>
        <form action={atualizarStatusDasContas}>
          <button type="submit" className="text-sm text-neutral-700 underline underline-offset-2">
            Atualizar status das contas
          </button>
        </form>
      </div>
      {aviso && <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">{aviso}</p>}
      {typeof params.webhooks === "string" && (
        <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">
          Webhooks conferidos na Unipile ({params.webhooks} criados agora).
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-3">
        {perfis.map((perfil) => (
          <li key={perfil.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  {perfil.nome}{" "}
                  <span className="text-sm font-normal text-neutral-500">· {PRACAS[perfil.praca]}</span>
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {perfil.conectado
                    ? `LinkedIn conectado (${perfil.unipile_status ?? "status desconhecido"}, conta ${perfil.tipo_conta})`
                    : "LinkedIn não conectado"}{" "}
                  · modo {perfil.modo_resposta}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    perfil.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {perfil.status}
                </span>
                {perfil.acessivel && (
                  <form action={conectarLinkedIn}>
                    <input type="hidden" name="perfilId" value={perfil.id} />
                    <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                      {perfil.conectado ? "Reconectar LinkedIn" : "Conectar LinkedIn"}
                    </button>
                  </form>
                )}
              </div>
            </div>
            {perfil.status === "pausado" && perfil.motivo_pausa && (
              <p className="mt-2 text-sm text-neutral-600">{perfil.motivo_pausa}</p>
            )}
          </li>
        ))}
      </ul>

      {operador.papel === "admin" && (
        <div className="mt-6 flex items-center gap-4 text-sm">
          <form action={registrarWebhooksNaUnipile}>
            <button type="submit" className="text-neutral-700 underline underline-offset-2">
              Registrar webhooks na Unipile
            </button>
          </form>
          <a href="/integracoes" className="text-neutral-700 underline underline-offset-2">
            Integrações (RD Station)
          </a>
        </div>
      )}
    </section>
  );
}
