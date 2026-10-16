"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { travasDaAtivacao } from "@/domain/ativacao";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { COOKIE_DA_MARCA, trocarDeMarca } from "@/server/marcas/marcas";
import { despausarPerfil, ErroDeAtivacao, pausarPerfil } from "@/server/perfis/pausa";
import { exigirOperador, exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

/** Qualquer operador pausa qualquer perfil, sem precisar de reunião (§4.4). */
export async function pausarPerfilDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const motivo = z.string().trim().min(3).max(300).safeParse(formData.get("motivo"));
  if (!motivo.success) redirect("/?msg=Escreva o motivo da pausa.");
  await pausarPerfil(obterDb(), {
    perfilId,
    motivo: `Pausado por ${operador.nome}: ${motivo.data}`,
    ator: operador.id,
    agora: new Date(),
  });
  revalidatePath("/");
}

/** Despausar é sempre manual e fica em `eventos` com o operador (§4.4). */
export async function despausarPerfilDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const [perfil] = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<{ acessivel: boolean; primeira: boolean; slug: string; nome: string; praca: string; modo_resposta: string }>(
      `select public.pode_ver_perfil(id) as acessivel, ativado_em is null as primeira, slug, nome, praca, modo_resposta
         from public.perfis where id = $1::uuid`,
      [perfilId],
    ),
  );
  if (!perfil?.acessivel) redirect("/?msg=Você não opera este perfil.");
  if (perfil.primeira) {
    const confirmadas = new Set(formData.getAll("travas"));
    const travas = travasDaAtivacao({ ...perfil, modoResposta: perfil.modo_resposta });
    if (travas.some((trava) => !confirmadas.has(trava.id))) {
      redirect(`/?msg=${encodeURIComponent(`Confirme todos os itens do checklist de ${perfil.nome} antes de ativar.`)}`);
    }
  }
  try {
    await despausarPerfil(obterDb(), { perfilId, operadorId: operador.id, agora: new Date() });
  } catch (erro) {
    if (erro instanceof ErroDeAtivacao) redirect(`/?msg=${encodeURIComponent(erro.message)}`);
    throw erro;
  }
  revalidatePath("/", "layout");
}

/** O cookie da janela (§4.30): legível no navegador, para o seletor conferir a marca ao montar. */
async function gravarMarcaDaJanela(marcaId: string) {
  (await cookies()).set(COOKIE_DA_MARCA, marcaId, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 400,
  });
}

/**
 * Troca de marca pelo seletor (§4.30). Não passa pela guarda de janela: é ela
 * que resolve a janela que ficou para trás. Quem chama recarrega a página.
 */
export async function trocarDeMarcaDoPainel(marcaId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const operador = await exigirOperador();
  const id = z.uuid().safeParse(marcaId);
  if (!id.success) return { ok: false, erro: "Você não tem acesso a essa marca." };
  const resultado = await trocarDeMarca(obterDb(), { operadorId: operador.id, marcaId: id.data, agora: new Date() });
  if (!resultado.ok) return resultado;
  await gravarMarcaDaJanela(resultado.marca.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * O seletor montou numa janela cujo cookie não é a marca da página (outra aba
 * trocou, ou a janela é de antes das marcas): regrava o cookie com a marca que
 * a página mostra, se ela ainda é a do banco.
 */
export async function sincronizarMarcaDaJanela(marcaId: string): Promise<{ ok: boolean }> {
  const operador = await exigirOperador();
  if (!operador.marcaId || operador.marcaId !== marcaId) return { ok: false };
  await gravarMarcaDaJanela(operador.marcaId);
  return { ok: true };
}
