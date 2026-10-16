import { CircleCheck, ExternalLink } from "lucide-react";
import { Aviso } from "@/components/aviso";
import { BASE, CATALOGO_DE_MODULOS, ehModulo, NOME_DO_MODULO } from "@/domain/modulos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { situacaoDosModulos, usoDoMes } from "@/server/modulos/modulos";
import { urlDoComercial } from "@/server/plataforma";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";

const FUSO = "America/Sao_Paulo";
const data = (valor: Date) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "numeric", month: "long", year: "numeric" });
const numero = (valor: number) => valor.toLocaleString("pt-BR");

/** O que contratar leva a falar com a GuessLess; sem `COMERCIAL_URL`, a tela diz com quem falar. */
function QueroContratar({ url, modulo }: { url: string | null; modulo: string }) {
  if (!url) return <p className="text-[13px] text-tinta-suave">Para contratar, fale com quem atende a sua conta na GuessLess.</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="botao botao-pequeno w-fit" aria-label={`Quero contratar: ${modulo}`}>
      Quero contratar
      <ExternalLink aria-hidden />
    </a>
  );
}

/** Configurações > Plano (§4.14): os módulos, o que cada um faz, os contratados e o uso do mês. */
export default async function PlanoPage({ searchParams }: PageProps<"/settings/plan">) {
  const operador = await exigirOperadorNoApp();
  const { module: pedido } = await searchParams;
  const agora = new Date();
  const situacao = await comOperador(obterDb(), operador.id, (tx) => situacaoDosModulos(tx, operador.organizacaoId));
  const uso = await usoDoMes(obterDb(), { organizacaoId: operador.organizacaoId, agora });
  const comercial = urlDoComercial();
  const mes = agora.toLocaleDateString("pt-BR", { timeZone: FUSO, month: "long" });
  const faltando = ehModulo(pedido) && !operador.modulos.includes(pedido) ? pedido : null;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {faltando && (
        <Aviso tom="atencao">
          O módulo {NOME_DO_MODULO[faltando]} não está no plano da sua organização. Veja o que ele faz aqui embaixo.
        </Aviso>
      )}

      <section className="cartao p-5" aria-labelledby="titulo-base">
        <h2 id="titulo-base" className="text-[15px] font-semibold">
          Incluído em todo plano
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {BASE.map((item) => (
            <li key={item} className="etiqueta">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <ul className="flex flex-col gap-3" aria-label="Módulos">
        {CATALOGO_DE_MODULOS.map((modulo) => {
          const linha = situacao.find((s) => s.modulo === modulo.id)!;
          return (
            <li
              key={modulo.id}
              id={`modulo-${modulo.id}`}
              className={`cartao flex flex-col gap-3 p-5 ${faltando === modulo.id ? "border-atencao/60" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <h2 className="text-[15px] font-semibold">{modulo.nome}</h2>
                  <p className="mt-1 text-sm text-tinta-suave">{modulo.resumo}</p>
                </div>
                {linha.ativo ? (
                  <span className="etiqueta etiqueta-ok">
                    <CircleCheck aria-hidden />
                    Contratado{linha.desde ? ` desde ${data(linha.desde)}` : ""}
                  </span>
                ) : (
                  <span className="etiqueta">Fora do plano</span>
                )}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tinta-suave">
                {modulo.inclui.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              {linha.ativo && modulo.id === "linkedin" && (
                <dl className="grid grid-cols-1 gap-3 border-t border-linha pt-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-tinta-fraca">Contas do LinkedIn vinculadas</dt>
                    <dd className="mt-0.5 tabular-nums">{numero(uso.contasDoLinkedin)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-tinta-fraca">Convites em {mes}</dt>
                    <dd className="mt-0.5 tabular-nums">{numero(uso.convites)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-tinta-fraca">Mensagens em {mes}</dt>
                    <dd className="mt-0.5 tabular-nums">{numero(uso.mensagensDoLinkedin)}</dd>
                  </div>
                </dl>
              )}
              {!linha.ativo && <QueroContratar url={comercial} modulo={modulo.nome} />}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-tinta-fraca">
        Módulo desligado guarda os dados: quando volta, está tudo como estava. Quem liga e desliga é a GuessLess.
      </p>
    </div>
  );
}
