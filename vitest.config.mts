import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` quebra fora do bundler do Next; nos testes vira módulo vazio.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    // Cada arquivo sobe um Postgres em WASM (PGlite); em paralelo isso leva segundos.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
