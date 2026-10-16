import Link from "next/link";
import { Aviso } from "@/components/aviso";
import type { ResumoDaImportacao } from "@/server/importacao/importar";

export type RespostaDaImportacao = { ok: true; resumo: ResumoDaImportacao } | { ok: false; erro: string };

/** O que aconteceu com cada pessoa de uma importação (arquivo ou busca), com o caminho para a triagem. */
export function ResultadoDaImportacao({ resposta, campanhaId }: { resposta: RespostaDaImportacao; campanhaId: string }) {
  if (!resposta.ok) return <Aviso tom="erro">{resposta.erro}</Aviso>;
  const r = resposta.resumo;
  const numeros: [string, number][] = [
    ["Novos na triagem", r.novos],
    ["Bloqueados", r.bloqueados],
    ["Duplicados", r.duplicados],
    ["Com opt-out (não entraram)", r.optouts],
    ["Sem provider_id", r.semProviderId],
    ["Linhas inválidas", r.invalidas.length],
    ...(r.comAlerta > 0 ? ([["Com alerta de cooldown", r.comAlerta]] as [string, number][]) : []),
  ];
  return (
    <Aviso tom="ok">
      <p className="font-medium">Importação concluída.</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-3">
            <dt className="text-tinta-suave">{rotulo}</dt>
            <dd className="tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/triagem?campanha=${campanhaId}`} className="link mt-3 inline-block">
        Ir para a triagem
      </Link>
    </Aviso>
  );
}
