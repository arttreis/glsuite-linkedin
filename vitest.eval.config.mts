import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

/**
 * Eval de conversas (SDR-16): `pnpm eval`. Chama a API da Anthropic de verdade,
 * por isso fica fora do `pnpm test`. (mergeConfig concatenaria o `include`.)
 */
export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 60 * 60_000,
  },
});
