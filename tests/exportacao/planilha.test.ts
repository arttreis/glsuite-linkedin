import { beforeEach, describe, expect, it } from "vitest";
import { gerarPlanilhaEspelho } from "@/server/exportacao/planilha";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarCampanha, criarLead, criarPessoa } from "../support/fixtures";

describe("planilha-espelho", () => {
  let banco: BancoDeTeste;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
  });

  it("exporta com as colunas do épico, sem quem pediu opt-out", async () => {
    const campanha = await criarCampanha(banco.db, { perfil: "arthur", nome: "Varejo; moda" });
    const ana = await criarPessoa(banco.db, { dono: "arthur", nome: "Ana Lima", empresa: "Loja Sul" });
    await banco.db.query("update public.pessoas set cargo = 'CEO' where id = $1::uuid", [ana]);
    await criarLead(banco.db, { pessoaId: ana, campanhaId: campanha, estado: "convite_enviado" });
    const saiu = await criarPessoa(banco.db, { dono: "arthur", nome: "Opt Out", optoutEm: "2026-09-30T12:00:00Z" });
    await criarLead(banco.db, { pessoaId: saiu, campanhaId: campanha, estado: "optout" });

    const csv = await gerarPlanilhaEspelho(banco.db, "domestico");
    expect(csv.startsWith("﻿")).toBe(true);
    const [cabecalho, ...linhas] = csv.slice(1).trim().split("\r\n");
    expect(cabecalho).toBe("empresa;pessoa e cargo;campanha;ângulo;praça;originador;URL;fonte;data da coleta;estado;próximo passo");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/^Loja Sul;Ana Lima \(CEO\);"Varejo; moda";Margem invisível;Brasil;Arthur;https:\/\/www\.linkedin\.com\/in\/ACo\w+;csv;20\/09\/2026;convite_enviado;$/);
  });
});
