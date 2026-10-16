import { Link2, Plus, Trash2, Unplug } from "lucide-react";
import { Aviso } from "@/components/aviso";
import { boasVindasPadrao } from "@/domain/disparos";
import { obterCanal } from "@/server/canais/canais";
import { linkDoBot, listarLinksDeEntrada, type DadosDoTelegram } from "@/server/canais/telegram";
import { listarTags } from "@/server/contatos/tags";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { apagarLinkDoPainel, conectarTelegramDoPainel, criarLinkDoPainel, desconectarTelegramDoPainel, salvarBoasVindasDoPainel } from "./acoes";

/** Configurações > Telegram (§4.20): o bot, o link de entrada, os links com tag e as boas-vindas. */
export default async function TelegramPage({ searchParams }: PageProps<"/settings/telegram">) {
  const operador = await exigirOperadorComModulo("telegram");
  const { msg, other } = await searchParams;
  const admin = operador.papel === "admin";
  const { canal, links, tags, entraram } = await comOperador(obterDb(), operador.id, async (tx) => {
    const canal = await obterCanal(tx, { organizacaoId: operador.organizacaoId, tipo: "telegram" });
    const conectado = canal && canal.status !== "desconectado" ? canal : null;
    const [contagem] = conectado
      ? await tx.query<{ n: number }>("select count(*)::int as n from public.contatos where telegram_canal_id = $1::uuid and telegram_saiu_em is null", [conectado.id])
      : [{ n: 0 }];
    return {
      canal: conectado,
      links: conectado ? await listarLinksDeEntrada(tx, conectado.id) : [],
      tags: await listarTags(tx, operador.organizacaoId),
      entraram: contagem!.n,
    };
  });
  const [boasVindas] = canal
    ? await obterDb().query<{ boas_vindas: string | null }>("select boas_vindas from public.canais where id = $1::uuid", [canal.id])
    : [];
  const dados = canal?.dados as DadosDoTelegram | undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {typeof msg === "string" && <Aviso tom={typeof other === "string" ? "atencao" : "neutro"}>{msg}</Aviso>}

      {canal && dados ? (
        <>
          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-bot">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="titulo-bot" className="text-[15px] font-semibold">
                  {canal.nome}
                </h2>
                <p className="mt-0.5 text-[13px] text-tinta-suave">
                  {entraram === 1 ? "1 pessoa pode receber disparo por ele" : `${entraram.toLocaleString("pt-BR")} pessoas podem receber disparo por ele`}.
                </p>
              </div>
              {canal.status === "erro" ? (
                <span className="etiqueta etiqueta-ponto etiqueta-erro">Com erro</span>
              ) : (
                <span className="etiqueta etiqueta-ponto etiqueta-ok">Conectado</span>
              )}
            </div>
            {canal.erro && <Aviso tom="erro">{canal.erro}</Aviso>}
            <div>
              <p className="text-xs text-tinta-fraca">Link do bot (para pôr no site, no e-mail, no Instagram)</p>
              <p className="mt-0.5 break-all font-mono text-sm">{linkDoBot(dados.usuario)}</p>
            </div>
            <p className="text-xs text-tinta-fraca">
              Bot só fala com quem falou com ele primeiro: a lista do Telegram é feita de quem abre o link e toca em Começar. Lembre de cadastrar no
              @BotFather a política de privacidade do bot.
            </p>
          </section>

          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-links">
            <h2 id="titulo-links" className="text-[15px] font-semibold">
              Links com tag
            </h2>
            <p className="-mt-1 text-[13px] text-tinta-suave">Quem entra por um destes links ganha a tag dele: dá para saber de onde a pessoa veio e separar.</p>
            {links.length > 0 && (
              <ul className="flex flex-col gap-2">
                {links.map((link) => (
                  <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-superficie-alta px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {link.nome} <span className="text-xs font-normal text-tinta-fraca">· tag {link.tagNome ?? "(apagada)"}</span>
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-tinta-suave">{linkDoBot(dados.usuario, link.codigo)}</p>
                    </div>
                    <form action={apagarLinkDoPainel}>
                      <input type="hidden" name="linkId" value={link.id} />
                      <button type="submit" className="botao botao-pequeno" aria-label={`Apagar o link ${link.nome}`}>
                        <Trash2 aria-hidden />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {tags.length === 0 ? (
              <p className="text-[13px] text-tinta-suave">Crie uma tag em Contatos &gt; Tags para fazer um link com ela.</p>
            ) : (
              <form action={criarLinkDoPainel} className="flex flex-wrap items-end gap-2">
                <label className="rotulo min-w-0 flex-1 basis-48">
                  Nome do link (só a equipe vê)
                  <input name="nome" required maxLength={80} placeholder="Ex.: Evento de outubro" className="campo campo-pequeno" />
                </label>
                <label className="rotulo">
                  Tag
                  <select name="tagId" className="campo campo-pequeno w-auto">
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="botao botao-pequeno">
                  <Plus aria-hidden />
                  Criar link
                </button>
              </form>
            )}
          </section>

          <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-boas-vindas">
            <h2 id="titulo-boas-vindas" className="text-[15px] font-semibold">
              Boas-vindas
            </h2>
            <form action={salvarBoasVindasDoPainel} className="flex flex-col gap-2">
              <textarea
                name="boasVindas"
                rows={3}
                maxLength={1000}
                defaultValue={boasVindas?.boas_vindas ?? boasVindasPadrao(operador.organizacaoNome)}
                aria-label="Mensagem de boas-vindas"
                className="campo"
              />
              <p className="text-xs text-tinta-fraca">Vai para quem entra pelo bot. Use {"{{first_name}}"} para o primeiro nome. Diga como sair (/sair).</p>
              <button type="submit" className="botao botao-pequeno w-fit">
                Salvar
              </button>
            </form>
          </section>

          {admin && (
            <details className="cartao p-5">
              <summary className="text-[13px] text-tinta-suave hover:text-tinta">Desconectar o bot</summary>
              <form action={desconectarTelegramDoPainel} className="mt-3 flex flex-col gap-2">
                <p className="text-[13px] text-tinta-suave">
                  O token sai do Kakou e o webhook é desligado. Os disparos agendados ou saindo pausam. Os contatos ficam, mas só um bot novo com o
                  mesmo token volta a falar com eles: num bot diferente, ninguém deu /start.
                </p>
                <button type="submit" className="botao botao-perigo botao-pequeno w-fit">
                  <Unplug aria-hidden />
                  Desconectar
                </button>
              </form>
            </details>
          )}
        </>
      ) : (
        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-conectar-bot">
          <h2 id="titulo-conectar-bot" className="flex items-center gap-2 text-[15px] font-semibold">
            <Link2 className="size-4" aria-hidden />
            Conectar o bot da empresa
          </h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-tinta-suave">
            <li>No Telegram, abra o @BotFather e mande /newbot (ou use um bot que a empresa já tem).</li>
            <li>Escolha o nome e o @ do bot. O @BotFather mostra o token: copie.</li>
            <li>Cole o token aqui. O Kakou passa a receber quem entra pelo bot.</li>
          </ol>
          {admin ? (
            <form action={conectarTelegramDoPainel} className="flex flex-col gap-3">
              <label className="rotulo">
                Token do bot
                <input name="token" type="password" required autoComplete="off" placeholder="123456789:AA…" className="campo" />
              </label>
              {typeof other === "string" && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="tomarDoOutro" value="sim" className="mt-0.5 size-4" />
                  <span>
                    Pode desligar o outro sistema ({other}) e passar os avisos deste bot para o Kakou.
                  </span>
                </label>
              )}
              <div>
                <button type="submit" className="botao botao-primario">
                  Conectar
                </button>
              </div>
            </form>
          ) : (
            <p className="text-[13px] text-tinta-suave">Só um admin da organização conecta o bot.</p>
          )}
        </section>
      )}
    </div>
  );
}
