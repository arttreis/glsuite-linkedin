import Link from "next/link";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";

type LinhaDaCampanha = {
  id: string;
  nome: string;
  perfil: string;
  angulo: string;
  status: string;
  em_triagem: number;
  na_regua: number;
  em_conversa: number;
};

export default async function CampanhasPage() {
  const operador = await exigirOperador();
  const campanhas = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<LinhaDaCampanha>(`
      select c.id, c.nome, p.nome as perfil, c.angulo, c.status,
             count(l.id) filter (where l.estado = 'triagem')::int as em_triagem,
             count(l.id) filter (where l.estado in ('na_fila', 'convite_enviado', 'aceito', 'em_sequencia'))::int as na_regua,
             count(l.id) filter (where l.estado in ('em_conversa', 'qualificado', 'reuniao_marcada', 'escalado_humano'))::int as em_conversa
        from public.campanhas c
        join public.perfis p on p.id = c.perfil_id
        left join public.leads l on l.campanha_id = c.id
       group by c.id, p.nome
       order by c.status = 'encerrada', p.nome, c.criado_em desc`),
  );

  return (
    <section className="max-w-5xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Campanhas</h1>
        <Link href="/campanhas/nova" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
          Nova campanha
        </Link>
      </div>
      {campanhas.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nenhuma campanha ainda.</p>
      ) : (
        <table className="mt-5 w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="p-2">Campanha</th>
              <th className="p-2">Ângulo</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Triagem</th>
              <th className="p-2 text-right">Na régua</th>
              <th className="p-2 text-right">Em conversa</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100">
                <td className="p-2">
                  <Link href={`/campanhas/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                    {c.nome}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-500">{c.perfil}</span>
                </td>
                <td className="p-2 text-neutral-600">{c.angulo}</td>
                <td className="p-2">{c.status}</td>
                <td className="p-2 text-right tabular-nums">{c.em_triagem}</td>
                <td className="p-2 text-right tabular-nums">{c.na_regua}</td>
                <td className="p-2 text-right tabular-nums">{c.em_conversa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
