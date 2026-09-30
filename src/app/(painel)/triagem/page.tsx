import Link from "next/link";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { aprovarSelecionados, rejeitarSelecionados } from "./acoes";

type LinhaDaTriagem = {
  id: string;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  localizacao: string | null;
  url_publica: string;
  fonte: string;
  coletado_em: Date;
  bloqueio_motivo: string | null;
  alerta_triagem: string | null;
  campanha: string;
  perfil: string;
};

type Campanha = { id: string; nome: string; perfil: string; em_triagem: number };

const data = (valor: Date) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function TriagemPage({ searchParams }: PageProps<"/triagem">) {
  const operador = await exigirOperador();
  const params = await searchParams;
  const campanhaId = typeof params.campanha === "string" ? params.campanha : null;
  const mensagem = typeof params.msg === "string" ? params.msg : null;

  const { campanhas, leads } = await comOperador(obterDb(), operador.id, async (tx) => ({
    campanhas: await tx.query<Campanha>(`
      select c.id, c.nome, p.nome as perfil,
             (select count(*)::int from public.leads l where l.campanha_id = c.id and l.estado = 'triagem') as em_triagem
        from public.campanhas c join public.perfis p on p.id = c.perfil_id
       where c.status <> 'encerrada'
       order by p.nome, c.nome`),
    leads: await tx.query<LinhaDaTriagem>(
      `select l.id, pe.nome, pe.cargo, pe.empresa, pe.localizacao, pe.url_publica, pe.fonte, pe.coletado_em,
              l.bloqueio_motivo, l.alerta_triagem, c.nome as campanha, pf.nome as perfil
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.campanhas c on c.id = l.campanha_id
         join public.perfis pf on pf.id = l.perfil_id
        where l.estado = 'triagem' and ($1::uuid is null or l.campanha_id = $1::uuid)
        order by (l.bloqueio_motivo is not null), l.criado_em
        limit 300`,
      [campanhaId],
    ),
  }));

  return (
    <section className="max-w-6xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Triagem</h1>
        <Link href="/importar" className="text-sm underline underline-offset-2">
          Importar lista
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        A personalização real é a triagem humana da lista. Aprovar manda o lead para a fila da campanha.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/triagem"
          className={`rounded-full border px-3 py-1 ${campanhaId ? "border-neutral-300" : "border-neutral-900 bg-neutral-900 text-white"}`}
        >
          Todas
        </Link>
        {campanhas.map((c) => (
          <Link
            key={c.id}
            href={`/triagem?campanha=${c.id}`}
            className={`rounded-full border px-3 py-1 ${
              campanhaId === c.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
            }`}
          >
            {c.perfil} · {c.nome} ({c.em_triagem})
          </Link>
        ))}
      </nav>

      {mensagem && <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm">{mensagem}</p>}

      {leads.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nada em triagem aqui.</p>
      ) : (
        <form className="mt-4">
          {campanhaId && <input type="hidden" name="campanha" value={campanhaId} />}
          <div className="mb-3 flex gap-2">
            <button formAction={aprovarSelecionados} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
              Aprovar selecionados
            </button>
            <button formAction={rejeitarSelecionados} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
              Rejeitar selecionados
            </button>
          </div>
          <table className="w-full border-collapse bg-white text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="w-8 p-2" />
                <th className="p-2">Pessoa</th>
                <th className="p-2">Empresa</th>
                <th className="p-2">Campanha</th>
                <th className="p-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-neutral-100 align-top">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      name="leadIds"
                      value={lead.id}
                      disabled={Boolean(lead.bloqueio_motivo)}
                      aria-label={`Selecionar ${lead.nome}`}
                    />
                  </td>
                  <td className="p-2">
                    <details>
                      <summary className="cursor-pointer font-medium">{lead.nome}</summary>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-600">
                        <span>{lead.localizacao ?? "sem localização"}</span>
                        <span>
                          Fonte {lead.fonte}, coletado em {data(lead.coletado_em)}
                        </span>
                        <a href={lead.url_publica} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          Abrir no LinkedIn
                        </a>
                      </div>
                    </details>
                    <span className="text-xs text-neutral-500">{lead.cargo ?? "sem cargo"}</span>
                  </td>
                  <td className="p-2">{lead.empresa ?? "—"}</td>
                  <td className="p-2 text-xs text-neutral-600">
                    {lead.perfil} · {lead.campanha}
                  </td>
                  <td className="p-2 text-xs">
                    {lead.bloqueio_motivo && <p className="text-red-700">Bloqueado: {lead.bloqueio_motivo}</p>}
                    {lead.alerta_triagem && <p className="text-amber-700">{lead.alerta_triagem}</p>}
                    {!lead.bloqueio_motivo && !lead.alerta_triagem && <span className="text-neutral-400">ok</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      )}
    </section>
  );
}
