import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { FormularioLogin } from "./formulario";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const proximo = caminhoInternoSeguro(typeof params.proximo === "string" ? params.proximo : null);
  const linkInvalido = params.erro === "link";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">SDR · GuessLess</h1>
        <p className="mb-5 mt-1 text-sm text-neutral-600">Acesso dos operadores.</p>
        {linkInvalido && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            O link expirou ou já foi usado. Peça outro.
          </p>
        )}
        <FormularioLogin proximo={proximo} />
      </div>
    </main>
  );
}
