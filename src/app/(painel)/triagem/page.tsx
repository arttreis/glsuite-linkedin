import { Check, CircleAlert, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
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
    <>
      <Cabecalho
        titulo="Triagem"
        descricao="A personalização real é a triagem humana da lista. Aprovar manda o lead para a fila da campanha."
      >
        <Link href="/importar" className="botao">
          <Upload aria-hidden />
          Importar lista
        </Link>
      </Cabecalho>
      <div className="max-w-6xl">
        <nav aria-label="Campanha" className="segmentos">
          <Link href="/triagem" className="segmento" aria-current={campanhaId ? undefined : "page"}>
            Todas
          </Link>
          {campanhas.map((c) => (
            <Link
              key={c.id}
              href={`/triagem?campanha=${c.id}`}
              className="segmento"
              aria-current={campanhaId === c.id ? "page" : undefined}
            >
              <span className="text-tinta-fraca">{c.perfil}</span>
              {c.nome}
              <span className="segmento-contagem">{c.em_triagem}</span>
            </Link>
          ))}
        </nav>

        {mensagem && <Aviso className="mt-5">{mensagem}</Aviso>}

        {leads.length === 0 ? (
          <div className="vazio mt-6">
            <p>Nada em triagem aqui. Importe uma lista para começar.</p>
            <Link href="/importar" className="botao">
              <Upload aria-hidden />
              Importar lista
            </Link>
          </div>
        ) : (
          <form className="mt-6">
            {campanhaId && <input type="hidden" name="campanha" value={campanhaId} />}
            <div className="mb-3 flex flex-wrap gap-2">
              <button formAction={aprovarSelecionados} className="botao botao-primario">
                <Check aria-hidden />
                Aprovar selecionados
              </button>
              <button formAction={rejeitarSelecionados} className="botao">
                Rejeitar selecionados
              </button>
            </div>
            <div className="tabela-moldura">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>Pessoa</th>
                    <th>Empresa</th>
                    <th>Campanha</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="leadIds"
                          value={lead.id}
                          disabled={Boolean(lead.bloqueio_motivo)}
                          aria-label={`Selecionar ${lead.nome}`}
                          className="mt-0.5 size-4"
                        />
                      </td>
                      <td>
                        <details>
                          <summary className="font-medium">{lead.nome}</summary>
                          <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-tinta-suave">
                            <span>{lead.localizacao ?? "sem localização"}</span>
                            <span>
                              Fonte {lead.fonte}, coletado em {data(lead.coletado_em)}
                            </span>
                            <a href={lead.url_publica} target="_blank" rel="noreferrer" className="link w-fit">
                              Abrir no LinkedIn
                            </a>
                          </div>
                        </details>
                        <span className="text-xs text-tinta-fraca">{lead.cargo ?? "sem cargo"}</span>
                      </td>
                      <td>{lead.empresa ?? "—"}</td>
                      <td className="text-xs text-tinta-suave">
                        {lead.perfil}, {lead.campanha}
                      </td>
                      <td className="text-xs">
                        {lead.bloqueio_motivo && (
                          <p className="flex items-start gap-1.5 text-erro">
                            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                            Bloqueado: {lead.bloqueio_motivo}
                          </p>
                        )}
                        {lead.alerta_triagem && (
                          <p className="flex items-start gap-1.5 text-atencao">
                            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                            {lead.alerta_triagem}
                          </p>
                        )}
                        {!lead.bloqueio_motivo && !lead.alerta_triagem && <span className="etiqueta etiqueta-ok">Ok</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
