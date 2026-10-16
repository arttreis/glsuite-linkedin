import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { equipeDaOrganizacao } from "@/server/organizacao/equipe";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { definirContasDoPainel, mudarPapelDoPainel, salvarNomeDaOrganizacao } from "../acoes";

const PAPEIS = { admin: "Admin", operador: "Operador" } as const;

/** Equipe (§4.12): membros, papel e as contas que cada um opera. Só o admin muda. */
export default async function EquipePage({ searchParams }: PageProps<"/settings/team">) {
  const operador = await exigirOperadorNoApp();
  const { msg } = await searchParams;
  const { membros, contas } = await comOperador(obterDb(), operador.id, (tx) => equipeDaOrganizacao(tx));
  const admin = operador.papel === "admin";
  // As contas que cada um opera são do LinkedIn: sem o módulo, a equipe é só papel (§4.14).
  const comLinkedin = operador.modulos.includes("linkedin");
  const nomeDaConta = new Map(contas.map((conta) => [conta.id, conta.nome]));

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}

      <section className="cartao p-5">
        {admin ? (
          <form action={salvarNomeDaOrganizacao} className="flex flex-wrap items-end gap-2">
            <label className="rotulo">
              Nome da organização
              <input name="nome" defaultValue={operador.organizacaoNome} required minLength={2} maxLength={80} className="campo w-72" />
            </label>
            <button type="submit" className="botao botao-primario">
              Salvar
            </button>
          </form>
        ) : (
          <>
            <p className="text-xs text-tinta-fraca">Nome da organização</p>
            <p className="font-medium">{operador.organizacaoNome}</p>
          </>
        )}
      </section>

      <section aria-labelledby="titulo-membros">
        <h2 id="titulo-membros" className="text-[15px] font-semibold">
          Membros
        </h2>
        <p className="mt-1 text-[13px] text-tinta-suave">
          {comLinkedin
            ? `Admin vê e opera todas as contas. Operador, só as marcadas. ${admin ? "" : "Só um admin muda papel e contas."}`
            : `Admin muda papéis e conecta os canais. Operador usa o que o plano tem. ${admin ? "" : "Só um admin muda papel."}`}
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {membros.map((membro) => (
            <li key={membro.id} className={`cartao p-5 ${membro.ativo ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {membro.nome}
                    {membro.id === operador.id && <span className="ml-2 text-xs font-normal text-tinta-fraca">você</span>}
                    {!membro.ativo && <span className="ml-2 text-xs font-normal text-tinta-fraca">inativo</span>}
                  </p>
                  <p className="text-xs text-tinta-suave">{membro.email}</p>
                </div>
                {admin && membro.ativo ? (
                  <form action={mudarPapelDoPainel} className="flex items-center gap-2">
                    <input type="hidden" name="membroId" value={membro.id} />
                    <select name="papel" defaultValue={membro.papel} aria-label={`Papel de ${membro.nome}`} className="campo campo-pequeno w-auto">
                      <option value="operador">Operador</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="submit" className="botao botao-pequeno">
                      Trocar
                    </button>
                  </form>
                ) : (
                  <span className="etiqueta">{PAPEIS[membro.papel]}</span>
                )}
              </div>
              {comLinkedin &&
                membro.papel === "operador" &&
                (admin && membro.ativo && contas.length > 0 ? (
                  <form action={definirContasDoPainel} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-linha pt-4">
                    <input type="hidden" name="membroId" value={membro.id} />
                    <span className="text-[13px] text-tinta-suave">Opera:</span>
                    {contas.map((conta) => (
                      <label key={conta.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="perfilIds" value={conta.id} defaultChecked={membro.perfilIds.includes(conta.id)} className="size-4" />
                        {conta.nome}
                      </label>
                    ))}
                    <button type="submit" className="botao botao-pequeno ml-auto">
                      Salvar contas
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-[13px] text-tinta-suave">
                    Opera: {membro.perfilIds.length > 0 ? membro.perfilIds.map((id) => nomeDaConta.get(id) ?? "conta").join(", ") : "nenhuma conta"}
                  </p>
                ))}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-tinta-fraca">Para adicionar alguém à equipe, fale com o suporte do Kakou.</p>
      </section>
    </div>
  );
}
