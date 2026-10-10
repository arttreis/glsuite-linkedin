import { afterEach } from "vitest";
import { fecharBancosDeTeste } from "./banco";

// Todo clone do PGlite aberto num teste fecha no fim dele (ver `criarBancoDeTeste`).
afterEach(fecharBancosDeTeste);
