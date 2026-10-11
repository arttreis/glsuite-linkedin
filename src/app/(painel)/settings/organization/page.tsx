import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { membrosDaOrganizacao } from "@/server/organizacao/organizacao";
import { exigirOperador } from "@/server/supabase/servidor";
import { salvarNomeDaOrganizacao } from "./acoes";

const PAPEIS = { admin: "Administrador", operador: "Operador" } as const;

export default async function OrganizacaoPage({ searchParams }: PageProps<"/settings/organization">) {
  const operador = await exigirOperador();
  const { msg } = await searchParams;
  const membros = await comOperador(obterDb(), operador.id, (tx) => membrosDaOrganizacao(tx));
  const admin = operador.papel === "admin";

  return (
    <>
      <Cabecalho
        titulo="Organização"
        descricao="Tudo no Kakou pertence a uma organização: contas do LinkedIn, membros e prospecção."
        voltar={{ href: "/settings", rotulo: "Configurações" }}
      />
      <div className="max-w-3xl">
        {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}

        <div className="cartao p-5">
          {admin ? (
            <form action={salvarNomeDaOrganizacao} className="flex flex-wrap items-end gap-2">
              <label className="rotulo">
                Nome da organização
                <input
                  name="nome"
                  defaultValue={operador.organizacaoNome}
                  required
                  minLength={2}
                  maxLength={80}
                  className="campo w-72"
                />
              </label>
              <button type="submit" className="botao botao-primario">
                Salvar
              </button>
            </form>
          ) : (
            <>
              <p className="text-xs text-tinta-fraca">Nome da organização</p>
              <p className="font-medium">{operador.organizacaoNome}</p>
              <p className="mt-2 text-xs text-tinta-fraca">Só um admin da organização muda o nome.</p>
            </>
          )}
        </div>

        <h2 className="mb-3 mt-8 font-medium">Membros</h2>
        <div className="tabela-moldura">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Contas que opera</th>
              </tr>
            </thead>
            <tbody>
              {membros.map((membro) => (
                <tr key={membro.id} className={membro.ativo ? "" : "text-tinta-fraca"}>
                  <td>
                    {membro.nome}
                    {!membro.ativo && " (inativo)"}
                  </td>
                  <td>{membro.email}</td>
                  <td>{PAPEIS[membro.papel]}</td>
                  <td>{membro.papel === "admin" ? "Todas" : membro.perfis.length > 0 ? membro.perfis.join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-tinta-fraca">Para adicionar alguém, fale com o suporte do Kakou.</p>
      </div>
    </>
  );
}
