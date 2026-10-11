import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDaCampanha } from "@/components/etiquetas";
import type { StatusDaCampanha } from "@/server/campanhas/campanhas";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";

type LinhaDaCampanha = {
  id: string;
  nome: string;
  perfil: string;
  angulo: string;
  status: StatusDaCampanha;
  em_triagem: number;
  na_regua: number;
  em_conversa: number;
};

const PLANILHAS = [
  { praca: "domestico", rotulo: "Brasil" },
  { praca: "canada", rotulo: "Canadá" },
  { praca: "espanha", rotulo: "Espanha" },
];

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
    <>
      <Cabecalho titulo="Campanhas" descricao="Cada campanha tem a própria sequência, mas o teto de envios é do perfil.">
        <Link href="/campaigns/new" className="botao botao-primario">
          <Plus aria-hidden />
          Nova campanha
        </Link>
      </Cabecalho>
      <div className="max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] text-tinta-suave">Planilha-espelho (CSV)</span>
          {PLANILHAS.map((planilha) => (
            <a key={planilha.praca} href={`/api/exportar/planilha?praca=${planilha.praca}`} className="botao botao-pequeno">
              <Download aria-hidden />
              {planilha.rotulo}
            </a>
          ))}
        </div>

        {campanhas.length === 0 ? (
          <div className="vazio">
            <p>Nenhuma campanha ainda. A campanha define o ângulo, o convite e as mensagens que cada pessoa aprovada recebe.</p>
            <Link href="/campaigns/new" className="botao botao-primario">
              <Plus aria-hidden />
              Nova campanha
            </Link>
          </div>
        ) : (
          <div className="tabela-moldura">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Ângulo</th>
                  <th>Status</th>
                  <th className="numero">Triagem</th>
                  <th className="numero">Na sequência</th>
                  <th className="numero">Em conversa</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/campaigns/${c.id}`} className="link font-medium">
                        {c.nome}
                      </Link>
                      <p className="mt-0.5 text-xs text-tinta-fraca">{c.perfil}</p>
                    </td>
                    <td className="text-tinta-suave">{c.angulo}</td>
                    <td>
                      <EtiquetaDaCampanha status={c.status} />
                    </td>
                    <td className="numero">{c.em_triagem}</td>
                    <td className="numero">{c.na_regua}</td>
                    <td className="numero">{c.em_conversa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
