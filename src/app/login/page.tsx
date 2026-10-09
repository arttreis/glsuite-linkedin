import { Aviso } from "@/components/aviso";
import { Marca } from "@/components/marca";
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
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-72 w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-destaque/10 blur-3xl"
      />
      <div className="cartao relative w-full max-w-sm p-7">
        <Marca />
        <h1 className="mt-7 text-xl font-semibold tracking-tight">Entrar no painel</h1>
        <p className="mt-1.5 text-sm text-tinta-suave">Só para operadores cadastrados. O acesso é por um link enviado ao seu e-mail.</p>
        {erro && (
          <Aviso tom="erro" className="mt-5">
            {erro}
          </Aviso>
        )}
        <div className="mt-6">
          {params.erro === "acesso" ? (
            <form action="/auth/sair" method="post">
              <button type="submit" className="botao w-full">
                Sair e entrar com outro e-mail
              </button>
            </form>
          ) : (
            <FormularioLogin proximo={proximo} />
          )}
        </div>
      </div>
    </main>
  );
}
