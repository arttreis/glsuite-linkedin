import Link from "next/link";
import { redirect } from "next/navigation";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { obterClienteRd } from "@/server/dependencias";
import { exigirOperador } from "@/server/supabase/servidor";
import { salvarConfiguracaoRd } from "./acoes";

async function descobrirNoRd() {
  const rd = obterClienteRd();
  if (!rd) return { erro: "RD_STATION_TOKEN não configurado." };
  try {
    const [funis, campos, usuarios, fontes] = await Promise.all([
      rd.listarFunis(),
      rd.listarCamposDeNegociacao(),
      rd.listarUsuarios(),
      rd.listarFontes(),
    ]);
    return { funis, campos, usuarios, fontes };
  } catch (erro) {
    return { erro: (erro as Error).message };
  }
}

export default async function IntegracoesPage({ searchParams }: PageProps<"/integracoes">) {
  const operador = await exigirOperador();
  if (operador.papel !== "admin") redirect("/");
  const { msg, descobrir } = await searchParams;
  const db = obterDb();

  const config = await lerConfiguracao(db, "rd_station");
  const contagem = await db.query<{ status: string; total: number }>(
    "select status, count(*)::int as total from public.rd_eventos group by status order by status",
  );
  const erros = await db.query<{ etapa: string; erro: string; tentativas: number; empresa: string | null }>(
    `select e.etapa, e.erro, e.tentativas, pe.empresa
       from public.rd_eventos e join public.leads l on l.id = e.lead_id join public.pessoas pe on pe.id = l.pessoa_id
      where e.status = 'erro' order by e.criado_em desc limit 10`,
  );
  const descoberta = descobrir === "1" ? await descobrirNoRd() : null;

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold">Integrações</h1>
      {typeof msg === "string" && <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">{msg}</p>}

      <h2 className="mt-6 font-medium">RD Station CRM (§4.9, só praça Doméstico)</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {config.ativo ? "Sincronização ligada." : "Sincronização desligada: os eventos acumulam na fila até ligar."}{" "}
        {obterClienteRd() ? "Token configurado." : "Falta RD_STATION_TOKEN."} Fila:{" "}
        {contagem.length === 0 ? "vazia" : contagem.map((c) => `${c.total} ${c.status}`).join(" · ")}.
      </p>
      {erros.length > 0 && (
        <ul className="mt-2 text-sm text-red-700">
          {erros.map((e, i) => (
            <li key={i}>
              {e.empresa ?? "sem empresa"} · etapa {e.etapa} · {e.tentativas} tentativas: {e.erro}
            </li>
          ))}
        </ul>
      )}

      <form action={salvarConfiguracaoRd} className="mt-4 flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="configuracao">
          Mapeamento de ids (etapas 01 a 05, campos personalizados, usuários por slug do perfil ou e-mail)
        </label>
        <textarea
          id="configuracao"
          name="configuracao"
          rows={18}
          defaultValue={JSON.stringify(config, null, 2)}
          className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
        />
        <div className="flex gap-3">
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
            Salvar
          </button>
          <Link href="/integracoes?descobrir=1" className="self-center text-sm underline underline-offset-2">
            Descobrir ids no RD
          </Link>
        </div>
      </form>

      {descoberta && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          {"erro" in descoberta ? (
            <p className="text-red-700">{descoberta.erro}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-medium">Funis e etapas</h3>
                {descoberta.funis.map((f) => (
                  <p key={f.id} className="font-mono text-xs">
                    {f.nome} ({f.id}): {f.etapas.map((e) => `${e.ordem}. ${e.nome} (${e.id})`).join(" · ")}
                  </p>
                ))}
              </div>
              <div>
                <h3 className="font-medium">Campos de negociação</h3>
                {descoberta.campos.map((c) => (
                  <p key={c.id} className="font-mono text-xs">
                    {c.rotulo} ({c.id}, {c.tipo}){c.opcoes.length ? `: ${c.opcoes.join(", ")}` : ""}
                  </p>
                ))}
              </div>
              <div>
                <h3 className="font-medium">Usuários</h3>
                {descoberta.usuarios.map((u) => (
                  <p key={u.id} className="font-mono text-xs">
                    {u.nome} &lt;{u.email}&gt; ({u.id})
                  </p>
                ))}
              </div>
              <div>
                <h3 className="font-medium">Fontes</h3>
                <p className="font-mono text-xs">{descoberta.fontes.map((f) => `${f.nome} (${f.id})`).join(" · ")}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
