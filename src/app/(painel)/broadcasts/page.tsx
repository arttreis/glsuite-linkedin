import { Plus } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { NOME_DO_CANAL } from "@/domain/disparos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { listarDisparos } from "@/server/disparos/disparos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { BarraDoDisparo, EtiquetaDoDisparo, progresso, resumoDoDisparo } from "./situacao";

const FUSO = "America/Sao_Paulo";
const quando = (valor: Date) => new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Disparos (§4.18): os da organização, os mais novos primeiro, com como cada um está indo. */
export default async function DisparosPage({ searchParams }: PageProps<"/broadcasts">) {
  const operador = await exigirOperadorComModulo(["whatsapp", "telegram"]);
  const { msg } = await searchParams;
  const disparos = await comOperador(obterDb(), operador.id, (tx) => listarDisparos(tx, operador.organizacaoId));

  return (
    <>
      <Cabecalho
        titulo="Disparos"
        descricao="Uma mensagem para um segmento inteiro, agora ou agendada. A fila manda no ritmo do canal, das 8h às 21h, mesmo com a tela fechada."
      >
        <Link href="/broadcasts/new" className="botao botao-primario">
          <Plus aria-hidden />
          Novo disparo
        </Link>
      </Cabecalho>
      <div className="flex max-w-5xl flex-col gap-4">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {disparos.length === 0 ? (
          <p className="vazio">Nenhum disparo ainda. Comece em &quot;Novo disparo&quot;.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Disparos">
            {disparos.map((disparo) => {
              const { naoVao, faltam } = progresso(disparo.contagem);
              return (
                <li key={disparo.id} className="cartao flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/broadcasts/${disparo.id}`} className="link text-[15px] font-semibold">
                        {disparo.nome}
                      </Link>
                      <p className="mt-0.5 text-xs text-tinta-fraca">
                        {NOME_DO_CANAL[disparo.canalTipo]} ·{" "}
                        {disparo.status === "rascunho" ? `criado em ${quando(disparo.criadoEm)}` : disparo.agendadoPara ? `para ${quando(disparo.agendadoPara)}` : ""}
                      </p>
                    </div>
                    <EtiquetaDoDisparo status={disparo.status} />
                  </div>
                  {disparo.status !== "rascunho" && (
                    <>
                      <BarraDoDisparo contagem={disparo.contagem} />
                      <p className="text-[13px] tabular-nums text-tinta-suave">
                        {resumoDoDisparo(disparo.contagem)}
                        {faltam > 0 && ` · ${faltam} na fila`}
                        {naoVao > 0 && ` · ${naoVao} ${naoVao === 1 ? "não vai sair" : "não vão sair"}`}
                      </p>
                    </>
                  )}
                  {disparo.motivoPausa && disparo.status === "pausado" && <p className="text-[13px] text-atencao">{disparo.motivoPausa}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
