import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { exigirOperador } from "@/server/supabase/servidor";

function Cartao({ href, titulo, texto }: { href: string; titulo: string; texto: string }) {
  return (
    <li>
      <Link href={href} className="cartao flex items-center justify-between gap-4 p-5 transition-colors hover:border-linha-forte">
        <span className="min-w-0">
          <span className="block font-medium">{titulo}</span>
          <span className="mt-1 block text-sm text-tinta-suave">{texto}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-tinta-fraca" aria-hidden />
      </Link>
    </li>
  );
}

export default async function ConfiguracoesPage() {
  const operador = await exigirOperador();

  return (
    <>
      <Cabecalho titulo="Configurações" descricao="A organização, as contas do LinkedIn e as integrações." />
      <ul className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <Cartao
          href="/settings/organization"
          titulo="Organização"
          texto={`${operador.organizacaoNome}: nome e membros.`}
        />
        <Cartao href="/perfis" titulo="Contas do LinkedIn" texto="Conectar, ver o status e a forma de resposta de cada conta." />
        {operador.papel === "admin" && (
          <Cartao href="/integracoes" titulo="Integrações" texto="RD Station CRM. Só leads do Brasil vão para o RD." />
        )}
      </ul>
    </>
  );
}
