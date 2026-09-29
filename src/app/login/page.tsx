import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { FormularioLogin } from "./formulario";

const MENSAGENS_DE_ERRO: Record<string, string> = {
  link: "O link expirou ou já foi usado. Peça outro.",
  acesso: "Seu usuário não está cadastrado como operador ativo. Fale com o Arthur.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const proximo = caminhoInternoSeguro(typeof params.proximo === "string" ? params.proximo : null);
  const erro = typeof params.erro === "string" ? MENSAGENS_DE_ERRO[params.erro] : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">SDR · GuessLess</h1>
        <p className="mb-5 mt-1 text-sm text-neutral-600">Acesso dos operadores.</p>
        {erro && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {erro}
          </p>
        )}
        {params.erro === "acesso" ? (
          <form action="/auth/sair" method="post">
            <button type="submit" className="text-sm text-neutral-700 underline underline-offset-2">
              Sair e entrar com outro e-mail
            </button>
          </form>
        ) : (
          <FormularioLogin proximo={proximo} />
        )}
      </div>
    </main>
  );
}
