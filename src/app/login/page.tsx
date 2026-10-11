import { Aviso } from "@/components/aviso";
import { Marca } from "@/components/marca";
import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { FormularioLogin } from "./formulario";

const MENSAGENS_DE_ERRO: Record<string, string> = {
  link: "O link expirou ou já foi usado. Peça outro.",
  acesso: "Este e-mail não tem acesso ao Kakou. Fale com o Arthur.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const proximo = caminhoInternoSeguro(typeof params.proximo === "string" ? params.proximo : null);
  const erro = typeof params.erro === "string" ? MENSAGENS_DE_ERRO[params.erro] : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <div>
          <Marca />
          <p className="titulo-vitrine mt-10 lg:mt-14">
            Prospecção e abordagem
            <br />
            no LinkedIn
          </p>
          <p className="mt-5 max-w-md text-tinta-suave">Um decisor por vez, dentro dos limites de cada perfil.</p>
        </div>
        <div className="cartao w-full p-7">
          <h1 className="text-xl font-semibold tracking-tight">Entrar no painel</h1>
          <p className="mt-1.5 text-sm text-tinta-suave">
            Para quem já usa o Kakou e para e-mails liberados. O acesso é por um link enviado ao seu e-mail.
          </p>
          {erro && (
            <Aviso tom="erro" className="mt-5">
              {erro}
            </Aviso>
          )}
          <div className="mt-6">
            {params.erro === "acesso" ? (
              <form action="/auth/logout" method="post">
                <button type="submit" className="botao w-full">
                  Sair e entrar com outro e-mail
                </button>
              </form>
            ) : (
              <FormularioLogin proximo={proximo} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
