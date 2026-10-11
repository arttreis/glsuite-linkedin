import { MessagesSquare } from "lucide-react";
import { Aviso } from "@/components/aviso";
import { lerFiltro, listarChats } from "@/server/chats/chats";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { ListaDeChats } from "./lista";
import { MolduraDoChat } from "./moldura";

export default async function ChatsPage({ searchParams }: PageProps<"/chats">) {
  const operador = await exigirOperadorNoApp();
  const { filter, msg } = await searchParams;
  const filtro = lerFiltro(filter);
  const itens = await comOperador(obterDb(), operador.id, (tx) => listarChats(tx, { filtro }));

  return (
    <MolduraDoChat aberta={false} lista={<ListaDeChats itens={itens} filtro={filtro} aberto={null} agora={new Date()} />}>
      <div className="cartao flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <MessagesSquare className="size-8 text-tinta-fraca" aria-hidden />
        {typeof msg === "string" ? (
          <Aviso>{msg}</Aviso>
        ) : (
          <p className="max-w-sm text-sm text-tinta-suave">
            Escolha uma conversa. O SDR responde sozinho; quando ele chamar você, a conversa aparece em &quot;Precisa de
            você&quot;.
          </p>
        )}
      </div>
    </MolduraDoChat>
  );
}
