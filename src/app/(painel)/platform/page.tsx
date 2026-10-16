import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { NOME_DO_MODULO } from "@/domain/modulos";
import { obterDb } from "@/server/db";
import { organizacoesNaPlataforma, type SituacaoDoModulo } from "@/server/modulos/modulos";
import { exigirAdminDaPlataforma } from "@/server/plataforma";
import { alterarModuloDaPlataforma } from "./acoes";

const FUSO = "America/Sao_Paulo";
const data = (valor: Date) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

/** Um módulo de uma organização: como está, a última mudança e o botão que troca. */
function LinhaDoModulo({ organizacao, situacao }: { organizacao: { id: string; nome: string }; situacao: SituacaoDoModulo }) {
  const nome = NOME_DO_MODULO[situacao.modulo];
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-superficie-alta px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{nome}</p>
        {situacao.ativo ? (
          <span className="etiqueta etiqueta-ponto etiqueta-ok">Ligado{situacao.desde ? ` desde ${data(situacao.desde)}` : ""}</span>
        ) : (
          <span className="etiqueta etiqueta-ponto">Desligado</span>
        )}
      </div>
      {situacao.motivo && (
        <p className="text-[13px] text-tinta-suave">
          {situacao.motivo}
          {situacao.alteradoPor && situacao.alteradoEm ? ` · ${situacao.alteradoPor}, ${data(situacao.alteradoEm)}` : ""}
        </p>
      )}
      <form action={alterarModuloDaPlataforma} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="organizacaoId" value={organizacao.id} />
        <input type="hidden" name="organizacaoNome" value={organizacao.nome} />
        <input type="hidden" name="modulo" value={situacao.modulo} />
        <input type="hidden" name="ativo" value={situacao.ativo ? "false" : "true"} />
        <input
          name="motivo"
          required
          maxLength={300}
          placeholder={situacao.ativo ? "Por que desligar (vai para a trilha)" : "Por que ligar (vai para a trilha)"}
          aria-label={`Motivo para ${situacao.ativo ? "desligar" : "ligar"} ${nome}`}
          className="campo campo-pequeno min-w-0 flex-1 basis-56"
        />
        <button type="submit" className={`botao botao-pequeno ${situacao.ativo ? "botao-perigo" : ""}`}>
          {situacao.ativo ? "Desligar" : "Ligar"}
        </button>
      </form>
      {situacao.ativo && situacao.modulo === "linkedin" && (
        <p className="text-xs text-tinta-fraca">Desligar pausa as contas do LinkedIn ativas. Religar não despausa: a organização retoma.</p>
      )}
    </li>
  );
}

/** Plataforma (§4.14): as organizações do Kakou e os módulos de cada uma. Só para `PLATAFORMA_ADMINS`. */
export default async function PlataformaPage({ searchParams }: PageProps<"/platform">) {
  await exigirAdminDaPlataforma();
  const { msg } = await searchParams;
  const organizacoes = await organizacoesNaPlataforma(obterDb());

  return (
    <>
      <Cabecalho
        titulo="Plataforma"
        descricao="As organizações do Kakou e os módulos de cada uma. Ligar ou desligar vale na hora, para todos da organização, e fica na trilha com o motivo."
      />
      <div className="flex max-w-5xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {organizacoes.length === 0 && <p className="vazio">Nenhuma organização ainda.</p>}
        {organizacoes.map((organizacao) => (
          <section key={organizacao.id} className="cartao flex flex-col gap-4 p-5" aria-labelledby={`org-${organizacao.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`org-${organizacao.id}`} className="text-[15px] font-semibold">
                {organizacao.nome}
              </h2>
              <p className="text-xs text-tinta-fraca">
                criada em {data(organizacao.criadoEm)} ·{" "}
                {organizacao.primeiroAcessoEm ? `primeiro acesso feito em ${data(organizacao.primeiroAcessoEm)}` : "sem o primeiro acesso"}
              </p>
            </div>
            <p className="text-[13px] text-tinta-suave">
              {organizacao.admins.length > 0 ? `Admin: ${organizacao.admins.join(", ")}` : "Sem admin ativo"} ·{" "}
              {organizacao.operadores === 1 ? "1 pessoa na equipe" : `${organizacao.operadores} pessoas na equipe`} ·{" "}
              {organizacao.contasDoLinkedin === 1 ? "1 conta do LinkedIn" : `${organizacao.contasDoLinkedin} contas do LinkedIn`}
            </p>
            <ul className="flex flex-col gap-2">
              {organizacao.modulos.map((situacao) => (
                <LinhaDoModulo key={situacao.modulo} organizacao={organizacao} situacao={situacao} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
