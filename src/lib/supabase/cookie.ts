/**
 * Nome próprio para o cookie de sessão do Supabase. O SDR divide o projeto de
 * Auth com o GL Suite e mora num subdomínio dele (sdr.glsuite.io): com o nome
 * padrão (`sb-<ref>-auth-token`), o cookie do GL Suite em `.glsuite.io` chega
 * aqui junto e a sessão do SDR é lida errada ("Invalid Refresh Token").
 */
export const OPCOES_DO_COOKIE = { name: "sb-sdr-auth-token" } as const;
