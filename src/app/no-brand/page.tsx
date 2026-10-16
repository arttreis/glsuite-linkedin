import { redirect } from "next/navigation";
import { Marca } from "@/components/marca";
import { exigirOperador } from "@/server/supabase/servidor";

/** Operador sem acesso a nenhuma marca (§4.30): só um admin da organização dá o acesso. */
export default async function SemMarcaPage() {
  const operador = await exigirOperador();
  if (operador.marcas.length > 0) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="cartao w-full max-w-md p-7">
        <Marca />
        <h1 className="mt-6 text-xl font-semibold tracking-tight">
          Você ainda não tem acesso a nenhuma marca. Peça a um admin da {operador.organizacaoNome}.
        </h1>
        <form action="/auth/logout" method="post" className="mt-6">
          <button type="submit" className="botao w-full">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
