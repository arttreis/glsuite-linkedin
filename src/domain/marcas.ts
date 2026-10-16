/**
 * Guarda a marca que a janela mostra (§4.30). A troca é do operador e fica no
 * banco; o cookie diz em qual marca o navegador estava quando a página abriu,
 * e a ação do servidor recusa quando ele diverge da marca do banco (outro
 * dispositivo trocou). Fica aqui, sem dependência de servidor, porque o
 * seletor lê o cookie no navegador.
 */
export const COOKIE_DA_MARCA = "kakou_marca";

/** O canal em que uma aba avisa as outras do mesmo navegador que trocou de marca. */
export const CANAL_DA_MARCA = "kakou-marca";
