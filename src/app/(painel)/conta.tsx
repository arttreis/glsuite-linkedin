import { ArrowRight, Circle, CircleCheck, Pause, Play, UserRound } from "lucide-react";
import Link from "next/link";
import { Alvo, type AnelDoAlvo } from "@/components/alvo";
import { Avatar } from "@/components/avatar";
import { Barra } from "@/components/barra";
import { EtiquetaDoPerfil } from "@/components/etiquetas";
import { resumoDaRampa } from "@/domain/ativacao";
import type { EtapaDaRampa } from "@/domain/rampa";
import type { SaudeDoPerfil } from "@/server/painel/saude";
import { despausarPerfilDoPainel, pausarPerfilDoPainel } from "./acoes";

export const MODO_DE_RESPOSTA: Record<SaudeDoPerfil["modoResposta"], string> = {
  automatico: "O SDR responde sozinho",
  aprovacao: "Você aprova cada resposta",
};

/** Uso do dia contra o teto da conta; a barra fica âmbar quando o teto é atingido. */
function Medida({ rotulo, valor, limite }: { rotulo: string; valor: number; limite?: number | null }) {
  const temLimite = limite !== undefined && limite !== null;
  const cheio = temLimite && valor >= limite;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-tinta-fraca">{rotulo}</span>
      <span className={`text-lg leading-none tabular-nums ${cheio ? "text-atencao" : ""}`}>
        {valor}
        {temLimite && <span className="text-sm text-tinta-fraca"> / {limite}</span>}
      </span>
      {temLimite && limite > 0 && (
        <span className="mt-0.5">
          <Barra valor={valor} limite={limite} />
        </span>
      )}
    </div>
  );
}

/** Antes da primeira ativação: o que falta, quem resolve e o que acontece ao ativar. */
function ChecklistDeAtivacao({ conta, rampa, teto }: { conta: SaudeDoPerfil; rampa: EtapaDaRampa[]; teto: number }) {
  return (
    <form action={despausarPerfilDoPainel} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="perfilId" value={conta.id} />
      <ol className="flex flex-col gap-3 text-sm">
        <li className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {conta.contaPronta ? (
            <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
          ) : (
            <Circle className="size-4 shrink-0 text-tinta-fraca" aria-hidden />
          )}
          <span className={`flex-1 ${conta.contaPronta ? "text-tinta-suave" : ""}`}>
            {conta.contaPronta
              ? "LinkedIn vinculado"
              : conta.conectado
                ? `Reconectar o LinkedIn (a Unipile informa ${conta.unipileStatus})`
                : "Vincular o LinkedIn"}
          </span>
          {!conta.contaPronta && (
            <Link href={`/perfis#perfil-${conta.id}`} className="botao botao-pequeno">
              Vincular
              <ArrowRight aria-hidden />
            </Link>
          )}
        </li>
        {conta.travas.map((trava) => (
          <li key={trava.id}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" name="travas" value={trava.id} required className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{trava.texto}</span>
              <span className="text-xs text-tinta-fraca">Responsável: {trava.dono}</span>
            </label>
          </li>
        ))}
      </ol>
      <p className="recuo text-[13px]">
        Ao ativar começa a semana 1 da rampa: {resumoDaRampa(rampa, "convites_dia")} convites por dia
        {rampa.every((etapa) => etapa.dms_dia === 0)
          ? ", mensagens escritas à mão"
          : `, ${resumoDaRampa(rampa, "dms_dia")} mensagens por dia`}
        , no máximo {teto} convites por semana.
      </p>
      <div className="flex justify-end">
        <button type="submit" className="botao botao-primario" disabled={!conta.contaPronta}>
          <Play aria-hidden />
          Ativar a conta
        </button>
      </div>
    </form>
  );
}

/** Uma conta do LinkedIn: status, o uso de hoje contra o teto e o botão de pausar. */
function Conta({ conta }: { conta: SaudeDoPerfil }) {
  const d = conta.detalhes;
  const nuncaAtivada = conta.primeiraAtivacao && conta.status === "pausado";

  return (
    <li id={`conta-${conta.id}`} className="scroll-mt-6 border-t border-linha pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={conta.nome} />
          <div className="min-w-0">
            <p className="font-medium">{conta.nome}</p>
            <p className="text-xs text-tinta-suave">
              {d?.semana ? `Semana ${d.semana} da rampa · ` : ""}
              {MODO_DE_RESPOSTA[conta.modoResposta]}
            </p>
          </div>
        </div>
        <EtiquetaDoPerfil status={conta.status} nuncaAtivado={nuncaAtivada} />
      </div>

      {!conta.acessivel ? (
        <p className="mt-3 text-[13px] text-tinta-suave">Só quem opera esta conta vê os números dela.</p>
      ) : nuncaAtivada ? (
        d && <ChecklistDeAtivacao conta={conta} rampa={d.rampa} teto={d.teto} />
      ) : (
        <>
          {conta.status === "pausado" && conta.motivoPausa && (
            <p className="recuo mt-4 flex items-start gap-2">
              <Pause className="mt-0.5 size-3.5 shrink-0 text-atencao" aria-hidden />
              {conta.motivoPausa}
            </p>
          )}
          {d && (
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
              <Medida rotulo="Convites hoje" valor={d.convitesHoje} limite={d.limites?.convitesDia} />
              <Medida rotulo="Mensagens hoje" valor={d.dmsHoje} limite={d.limites?.dmsDia} />
              <Medida rotulo="Convites na semana" valor={d.convites7Dias} limite={d.teto} />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-tinta-fraca">Aceite em 3 dias úteis</span>
                {d.aceite.taxa === null ? (
                  <span className="text-sm leading-none text-tinta-suave">sem amostra</span>
                ) : (
                  <span className="text-lg leading-none tabular-nums">
                    {Math.round(d.aceite.taxa * 100)}%
                    <span className="text-sm text-tinta-fraca">
                      {" "}
                      ({d.aceite.aceitos}/{d.aceite.amostra})
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
          {conta.status === "ativo" ? (
            <form action={pausarPerfilDoPainel} className="mt-4 flex flex-wrap gap-2">
              <input type="hidden" name="perfilId" value={conta.id} />
              <input
                name="motivo"
                required
                minLength={3}
                placeholder="Motivo da pausa"
                aria-label={`Motivo da pausa de ${conta.nome}`}
                className="campo min-w-0 flex-1 basis-48"
              />
              <button type="submit" className="botao">
                <Pause aria-hidden />
                Pausar
              </button>
            </form>
          ) : (
            d && (
              <form action={despausarPerfilDoPainel} className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <input type="hidden" name="perfilId" value={conta.id} />
                <p className="min-w-0 flex-1 basis-56 text-[13px] text-tinta-suave">
                  {conta.contaPronta ? (
                    "Resolva o motivo acima antes de retomar. As guardas recomeçam a contar daqui."
                  ) : (
                    <>
                      Reconecte o LinkedIn em{" "}
                      <Link href={`/perfis#perfil-${conta.id}`} className="underline underline-offset-2">
                        Configurações
                      </Link>{" "}
                      para retomar.
                    </>
                  )}
                </p>
                <button type="submit" className="botao botao-primario" disabled={!conta.contaPronta}>
                  <Play aria-hidden />
                  Retomar
                </button>
              </form>
            )
          )}
        </>
      )}
    </li>
  );
}

/**
 * O elemento marcante do Dashboard (§4.9): as contas do LinkedIn com o teto
 * de hoje. O alvo tem um anel por conta, com os convites de hoje contra o
 * limite do dia.
 */
export function ContasDoLinkedin({ contas }: { contas: SaudeDoPerfil[] }) {
  if (contas.length === 0) {
    return (
      <section className="cartao cartao-vitrine p-6" aria-labelledby="titulo-contas">
        <h2 id="titulo-contas" className="flex items-center gap-2 text-[15px] font-semibold">
          <UserRound className="size-4 text-destaque" aria-hidden />
          LinkedIn
        </h2>
        <p className="mt-3 text-sm text-tinta-suave">Nenhuma conta vinculada. Sem conta, o SDR não prospecta.</p>
        <Link href="/perfis" className="botao botao-primario mt-5">
          Vincular o LinkedIn
          <ArrowRight aria-hidden />
        </Link>
      </section>
    );
  }

  const aneis: AnelDoAlvo[] = contas.map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    valor: conta.detalhes?.convitesHoje ?? 0,
    limite: conta.status === "ativo" ? (conta.detalhes?.limites?.convitesDia ?? 0) : 0,
    rotulo: conta.status === "ativo" ? "ativa" : conta.primeiraAtivacao ? "não ativada" : "pausada",
  }));

  return (
    <section className="cartao cartao-vitrine grid gap-8 p-6 lg:grid-cols-[auto_minmax(0,1fr)]" aria-labelledby="titulo-contas">
      <div>
        <h2 id="titulo-contas" className="mb-5 flex items-center gap-2 text-[15px] font-semibold">
          <UserRound className="size-4 text-destaque" aria-hidden />
          {contas.length === 1 ? "Sua conta do LinkedIn" : "Contas do LinkedIn"}
        </h2>
        <Alvo aneis={aneis} />
      </div>
      <ul className="flex flex-col gap-5">
        {contas.map((conta) => (
          <Conta key={conta.id} conta={conta} />
        ))}
      </ul>
    </section>
  );
}
