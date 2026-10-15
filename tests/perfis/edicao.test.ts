import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import { editarConta } from "@/server/perfis/edicao";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, idDoPerfil } from "../support/fixtures";

const AGORA = new Date("2026-10-14T15:00:00Z");

describe("editar nome e horário da conta do LinkedIn (SDR-57)", () => {
  let banco: BancoDeTeste;
  let perfilId: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    perfilId = await idDoPerfil(banco.db, "juliano");
  });

  const editar = (operadorId: string, campos: { nome?: string; inicio?: string; fim?: string } = {}) =>
    comOperador(banco.db, operadorId, (tx) =>
      editarConta(tx, { perfilId, nome: "Juliano Souza", inicio: "08:30", fim: "17:00", ...campos, operadorId, agora: AGORA }),
    );

  const conta = async () => {
    const [linha] = await banco.db.query<{ nome: string; janela: unknown }>("select nome, janela from public.perfis where id = $1::uuid", [perfilId]);
    return linha!;
  };

  it("o admin troca o nome e a janela, sem perder o intervalo entre ações, e fica na trilha", async () => {
    const admin = await criarOperador(banco.db, { papel: "admin" });
    expect(await editar(admin)).toEqual({ ok: true });

    expect(await conta()).toEqual({ nome: "Juliano Souza", janela: { inicio: "08:30", fim: "17:00", jitter_min: [3, 12] } });
    const [evento] = await banco.db.query<{ payload: unknown; ator: string }>(
      "select payload, ator from public.eventos where tipo = 'perfil_editado' and entidade_id = $1",
      [perfilId],
    );
    expect(evento).toMatchObject({ ator: admin, payload: { para: { nome: "Juliano Souza", inicio: "08:30", fim: "17:00" } } });
  });

  it("quem vinculou a conta edita; quem só opera não", async () => {
    const dono = await criarOperador(banco.db, { perfis: ["juliano"] });
    await banco.db.query("update public.perfis set operador_id = $2::uuid where id = $1::uuid", [perfilId, dono]);
    expect(await editar(dono, { nome: "Juliano" })).toEqual({ ok: true });

    const colega = await criarOperador(banco.db, { perfis: ["juliano"] });
    expect(await editar(colega, { nome: "Outro" })).toEqual({ ok: false, erro: "Só o admin ou quem vinculou a conta edita." });
    expect((await conta()).nome).toBe("Juliano");
  });

  it("recusa nome curto, horário fora do formato e janela menor que 1 hora", async () => {
    const admin = await criarOperador(banco.db, { papel: "admin" });
    const antes = await conta();

    expect(await editar(admin, { nome: " J " })).toEqual({ ok: false, erro: "O nome precisa ter de 2 a 80 caracteres." });
    expect(await editar(admin, { inicio: "9h" })).toEqual({ ok: false, erro: "Use horários no formato 09:00." });
    expect(await editar(admin, { inicio: "18:00", fim: "09:00" })).toEqual({
      ok: false,
      erro: "O fim precisa ser pelo menos 1 hora depois do início.",
    });
    expect(await editar(admin, { inicio: "09:00", fim: "09:45" })).toMatchObject({ ok: false });
    expect(await conta()).toEqual(antes);
  });
});
