import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { NOME_DO_MODULO } from "@/domain/modulos";
import { obterDb } from "@/server/db";
import { obterUnipile } from "@/server/dependencias";
import { organizacoesNaPlataforma, type ContaDaCasaNaPlataforma, type SituacaoDoModulo } from "@/server/modulos/modulos";
import { contasSemPerfil, destinosDaLigacao, type ContaSemPerfil, type DestinoDaLigacao } from "@/server/perfis/conexao";
import { exigirAdminDaPlataforma } from "@/server/plataforma";
import { mensagemDaRecusa } from "@/server/unipile/erros";
import { alterarModuloDaPlataforma, ligarContaDaUnipile, reconectarContaDaCasa } from "./acoes";

const FUSO = "America/Sao_Paulo";
const data = (valor: Date) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const dataEHora = (valor: Date) =>
  `${data(valor)} ${new Date(valor).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })}`;

const CONEXAO: Record<string, { tom: "ok" | "erro"; texto: string }> = {
  ok: { tom: "ok", texto: "LinkedIn vinculado." },
  falhou: { tom: "erro", texto: "A conexão não foi concluída na Unipile. Tente de novo." },
};

/** A conta da casa da organização (§4.4): status na Unipile, desde quando, e o botão que reconecta. */
function ContaDaCasa({ conta }: { conta: ContaDaCasaNaPlataforma | null }) {
  if (!conta) return <p className="text-[13px] text-tinta-suave">Sem conta da casa.</p>;
  const saudavel = conta.conectada && (conta.unipileStatus === null || STATUS_SAUDAVEIS.has(conta.unipileStatus));
  const desde = conta.unipileStatusEm ? ` desde ${dataEHora(conta.unipileStatusEm)}` : "";
  const situacao = !conta.conectada
    ? "LinkedIn não vinculado"
    : saudavel
      ? `${conta.unipileStatus ?? "OK"}${desde}`
      : `A Unipile informa ${conta.unipileStatus}${desde}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-superficie-alta px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">Conta da casa: {conta.nome}</p>
        <span className={`etiqueta etiqueta-ponto ${saudavel ? "etiqueta-ok" : conta.conectada ? "etiqueta-erro" : ""}`}>{situacao}</span>
      </div>
      <form action={reconectarContaDaCasa}>
        <input type="hidden" name="perfilId" value={conta.id} />
        <button type="submit" className={`botao botao-pequeno ${saudavel ? "" : "botao-primario"}`}>
          {conta.conectada ? "Reconectar a conta da casa" : "Vincular a conta da casa"}
        </button>
      </form>
    </div>
  );
}

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

/**
 * Contas do LinkedIn conectadas direto no dashboard da Unipile, que nenhum
 * perfil tem (§4.14). Cada uma liga num perfil livre ou numa conta nova da
 * organização escolhida. O workspace da Unipile é de todas as organizações:
 * a lista só existe aqui.
 */
function ContasSemPerfil({ contas, destinos }: { contas: ContaSemPerfil[] | string; destinos: DestinoDaLigacao[] }) {
  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="contas-sem-perfil">
      <h2 id="contas-sem-perfil" className="text-[15px] font-semibold">
        Contas na Unipile sem perfil
      </h2>
      {typeof contas === "string" ? (
        <Aviso tom="erro">{contas}</Aviso>
      ) : contas.length === 0 ? (
        <p className="text-[13px] text-tinta-suave">Toda conta do LinkedIn na Unipile já está ligada a um perfil.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contas.map((conta) => {
            const nome = conta.nome ?? "Conta sem nome";
            return (
              <li key={conta.id} className="flex flex-col gap-2 rounded-xl bg-superficie-alta px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{nome}</p>
                  <span className={`etiqueta etiqueta-ponto ${STATUS_SAUDAVEIS.has(conta.status) ? "etiqueta-ok" : "etiqueta-erro"}`}>
                    {conta.status}
                    {conta.criadaEm ? ` · criada em ${data(conta.criadaEm)}` : ""}
                  </span>
                </div>
                <form action={ligarContaDaUnipile} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="accountId" value={conta.id} />
                  <input type="hidden" name="nomeDaConta" value={nome} />
                  <select
                    name="destino"
                    required
                    defaultValue=""
                    aria-label={`Perfil que recebe a conta de ${nome}`}
                    className="campo campo-pequeno min-w-0 flex-1 basis-56"
                  >
                    <option value="" disabled>
                      Escolha a organização e o perfil
                    </option>
                    {destinos.map((destino) => (
                      <optgroup key={destino.organizacaoId} label={destino.organizacaoNome}>
                        {destino.perfis.map((perfil) => (
                          <option key={perfil.id} value={`perfil:${perfil.id}`}>
                            {perfil.nome}
                            {perfil.casa ? " (conta da casa)" : ""}
                            {perfil.contaApagada ? " (conta apagada na Unipile)" : ""}
                          </option>
                        ))}
                        <option value={`nova:${destino.organizacaoId}`}>Conta nova em {destino.organizacaoNome}</option>
                      </optgroup>
                    ))}
                  </select>
                  <button type="submit" className="botao botao-pequeno botao-primario">
                    Ligar a este perfil
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-tinta-fraca">Ligar não ativa o perfil: ele segue pausado até alguém da organização ativar.</p>
    </section>
  );
}

/** Plataforma (§4.14): as organizações do Kakou, os módulos de cada uma e as contas soltas na Unipile. Só para `PLATAFORMA_ADMINS`. */
export default async function PlataformaPage({ searchParams }: PageProps<"/platform">) {
  await exigirAdminDaPlataforma();
  const { msg, conexao } = await searchParams;
  const organizacoes = await organizacoesNaPlataforma(obterDb());
  const destinos = await destinosDaLigacao(obterDb());
  // Unipile fora ou chave recusada vira aviso na seção, não página de erro.
  const contas = await contasSemPerfil({ db: obterDb(), unipile: obterUnipile() }).catch((erro: unknown) => mensagemDaRecusa(erro));
  const aviso = typeof conexao === "string" ? CONEXAO[conexao] : undefined;

  return (
    <>
      <Cabecalho
        titulo="Plataforma"
        descricao="As organizações do Kakou, a conta da casa e os módulos de cada uma. Ligar ou desligar vale na hora, para todos da organização, e fica na trilha com o motivo."
      />
      <div className="flex max-w-5xl flex-col gap-5">
        {typeof msg === "string" && <Aviso>{msg}</Aviso>}
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <ContasSemPerfil contas={contas} destinos={destinos} />
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
            <ContaDaCasa conta={organizacao.contaDaCasa} />
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
