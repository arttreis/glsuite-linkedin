import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/saude", () => {
  it("responde ok sem depender de configuração", async () => {
    const resposta = GET();
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, servico: "guessless-sdr" });
  });
});
