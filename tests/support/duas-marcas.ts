import type { Db } from "@/server/db/tipos";
import { criarOperador, criarOrganizacao, criarPerfilNaOrganizacao } from "./fixtures";

export type DuasMarcas = {
  organizacaoId: string;
  /** A marca 1 da organização, renomeada para "Alfa". */
  marcaA: string;
  /** A segunda marca, "Beta". */
  marcaB: string;
  /** Admin da organização: vê as duas marcas (D30), está na A. */
  admin: string;
  /** Operador com acesso só à marca A, e nela. */
  operadorA: string;
  /** Um perfil da organização, operado pelo operador da A e ligado à A (`marcas_dos_perfis`). */
  perfilId: string;
};

/**
 * Uma organização com duas marcas (§4.30), para os testes de vazamento do
 * Marco F: cada ticket que põe `marca_id` numa tabela confere que o operador da
 * A não vê nada da B.
 */
export async function criarDuasMarcas(db: Db, opcoes: { slug?: string } = {}): Promise<DuasMarcas> {
  const organizacaoId = await criarOrganizacao(db, { slug: opcoes.slug, nome: "Agência" });
  const [marcaA] = await db.query<{ id: string }>(
    "update public.marcas set nome = 'Alfa' where organizacao_id = $1::uuid returning id",
    [organizacaoId],
  );
  const [marcaB] = await db.query<{ id: string }>(
    "insert into public.marcas (organizacao_id, nome, cor, analise_e_sdr_em) values ($1::uuid, 'Beta', 'azul', now()) returning id",
    [organizacaoId],
  );
  const perfilId = await criarPerfilNaOrganizacao(db, { organizacaoId, slug: `perfil-${organizacaoId.slice(0, 8)}` });
  // Com duas marcas, a trigger não escolhe: o acesso e a marca atual vão aqui.
  const admin = await criarOperador(db, { nome: "Admin da Agência", papel: "admin", organizacaoId });
  const operadorA = await criarOperador(db, { nome: "Operador da Alfa", organizacaoId, perfilIds: [perfilId] });
  await db.query("insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [operadorA, marcaA!.id]);
  await db.query("update public.operadores set marca_atual_id = $2::uuid where id = any($1::uuid[])", [[admin, operadorA], marcaA!.id]);
  // Sem operador e com duas marcas, a trigger perfis_na_marca não escolhe: a conta vai para a A aqui.
  await db.query("insert into public.marcas_dos_perfis (perfil_id, marca_id) values ($1::uuid, $2::uuid)", [perfilId, marcaA!.id]);
  return { organizacaoId, marcaA: marcaA!.id, marcaB: marcaB!.id, admin, operadorA, perfilId };
}
