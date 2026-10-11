import { Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { lerConfiguracao } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { obterClienteRd } from "@/server/dependencias";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
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
  const operador = await exigirOperadorNoApp();
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
  const temToken = Boolean(obterClienteRd());

  return (
    <>
      <Cabecalho titulo="Integrações" descricao="RD Station CRM, funil Comercial · Serviço. Só entram leads dos perfis do Brasil." />
      <div className="flex max-w-4xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}

        <section className="cartao p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">RD Station CRM</h2>
            <span className={`etiqueta etiqueta-ponto ${config.ativo ? "etiqueta-ok" : ""}`}>
              {config.ativo ? "Sincronização ligada" : "Sincronização desligada"}
            </span>
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-tinta-fraca">Token</dt>
              <dd className="mt-1">{temToken ? "Configurado" : "Falta RD_STATION_TOKEN"}</dd>
            </div>
            <div>
              <dt className="text-xs text-tinta-fraca">Fila de eventos</dt>
              <dd className="mt-1">{contagem.length === 0 ? "vazia" : contagem.map((c) => `${c.total} ${c.status}`).join(", ")}</dd>
            </div>
          </dl>
          {!config.ativo && (
            <p className="mt-4 text-[13px] text-tinta-suave">Os eventos acumulam na fila até a sincronização ser ligada.</p>
          )}
          {erros.length > 0 && (
            <Aviso tom="erro" className="mt-4">
              <ul className="flex flex-col gap-1">
                {erros.map((e, i) => (
                  <li key={i}>
                    {e.empresa ?? "sem empresa"}, etapa {e.etapa}, {e.tentativas} tentativas: {e.erro}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
        </section>

        <form action={salvarConfiguracaoRd} className="cartao flex flex-col gap-3 p-5">
          <label className="text-[15px] font-semibold" htmlFor="configuracao">
            Mapeamento de ids
          </label>
          <p className="text-[13px] text-tinta-suave">
            Etapas 01 a 05, campos personalizados e usuários por slug do perfil ou e-mail. Marque &quot;ativo&quot;: true para ligar.
          </p>
          <textarea
            id="configuracao"
            name="configuracao"
            rows={18}
            defaultValue={JSON.stringify(config, null, 2)}
            spellCheck={false}
            className="campo w-full font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="botao botao-primario">
              Salvar
            </button>
            <Link href="/integracoes?descobrir=1" className="botao">
              <Search aria-hidden />
              Descobrir ids no RD
            </Link>
          </div>
        </form>

        {descoberta && (
          <section className="cartao p-5 text-sm">
            {"erro" in descoberta ? (
              <Aviso tom="erro">{descoberta.erro}</Aviso>
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="font-medium">Funis e etapas</h3>
                  {descoberta.funis.map((f) => (
                    <p key={f.id} className="mt-1 font-mono text-xs text-tinta-suave">
                      {f.nome} ({f.id}): {f.etapas.map((e) => `${e.ordem}. ${e.nome} (${e.id})`).join(", ")}
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="font-medium">Campos de negociação</h3>
                  {descoberta.campos.map((c) => (
                    <p key={c.id} className="mt-1 font-mono text-xs text-tinta-suave">
                      {c.rotulo} ({c.id}, {c.tipo}){c.opcoes.length ? `: ${c.opcoes.join(", ")}` : ""}
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="font-medium">Usuários</h3>
                  {descoberta.usuarios.map((u) => (
                    <p key={u.id} className="mt-1 font-mono text-xs text-tinta-suave">
                      {u.nome} &lt;{u.email}&gt; ({u.id})
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="font-medium">Fontes</h3>
                  <p className="mt-1 font-mono text-xs text-tinta-suave">
                    {descoberta.fontes.map((f) => `${f.nome} (${f.id})`).join(", ")}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
