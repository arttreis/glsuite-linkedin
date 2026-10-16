import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { CANAIS_DE_DISPARO } from "@/domain/canais";
import { NOME_DO_CANAL, type ConteudoDoTelegram, type ConteudoDoWhatsapp } from "@/domain/disparos";
import { obterCanal, type DadosDoWhatsapp } from "@/server/canais/canais";
import { listarSegmentos } from "@/server/contatos/segmentos";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterDisparo } from "@/server/disparos/disparos";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { NovoDisparo, type CanalParaEscolher } from "../novo-disparo";

/** Novo disparo, ou mudar um rascunho (`?draft=`), §4.18. */
export default async function NovoDisparoPage({ searchParams }: PageProps<"/broadcasts/new">) {
  const operador = await exigirOperadorComModulo(["whatsapp", "telegram"]);
  const { draft } = await searchParams;
  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const canais: CanalParaEscolher[] = [];
    if (operador.modulos.includes("whatsapp")) {
      const canal = await obterCanal(tx, { organizacaoId: operador.organizacaoId, tipo: "whatsapp" });
      if (canal && canal.status !== "desconectado") canais.push({ tipo: "whatsapp", nome: NOME_DO_CANAL.whatsapp, templates: (canal.dados as DadosDoWhatsapp).templates ?? [] });
    }
    if (operador.modulos.includes("telegram")) {
      const canal = await obterCanal(tx, { organizacaoId: operador.organizacaoId, tipo: "telegram" });
      if (canal && canal.status !== "desconectado") canais.push({ tipo: "telegram", nome: NOME_DO_CANAL.telegram, templates: [] });
    }
    const rascunho =
      typeof draft === "string" && /^[0-9a-f-]{36}$/i.test(draft) ? await obterDisparo(tx, { id: draft, organizacaoId: operador.organizacaoId }) : null;
    return { canais, segmentos: await listarSegmentos(tx, operador.organizacaoId), rascunho: rascunho?.status === "rascunho" ? rascunho : null };
  });

  return (
    <>
      <Cabecalho
        titulo={dados.rascunho ? `Mudar: ${dados.rascunho.nome}` : "Novo disparo"}
        descricao="Uma mensagem para um segmento inteiro. Escolha para quem e o que vai; antes de sair, o Kakou mostra quem recebe, quem fica de fora e por quê."
        voltar={{ href: "/broadcasts", rotulo: "Disparos" }}
      />
      <div className="max-w-6xl">
        {dados.canais.length === 0 ? (
          <div className="vazio">
            <p>Para disparar, conecte antes o canal da empresa.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {CANAIS_DE_DISPARO.filter((tipo) => operador.modulos.includes(tipo)).map((tipo) => (
                <Link key={tipo} href={`/settings/${tipo}`} className="botao botao-primario">
                  Conectar o {NOME_DO_CANAL[tipo]}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <NovoDisparo
            canais={dados.canais}
            segmentos={dados.segmentos.map(({ id, nome, contatos }) => ({ id, nome, contatos }))}
            rascunho={
              dados.rascunho
                ? {
                    id: dados.rascunho.id,
                    nome: dados.rascunho.nome,
                    canal: dados.rascunho.canalTipo,
                    segmentoId: dados.rascunho.segmentoId,
                    templateId: dados.rascunho.conteudo.tipo === "whatsapp" ? (dados.rascunho.conteudo as ConteudoDoWhatsapp).template.id : null,
                    variaveis: dados.rascunho.conteudo.tipo === "whatsapp" ? (dados.rascunho.conteudo as ConteudoDoWhatsapp).variaveis : {},
                    texto: dados.rascunho.conteudo.tipo === "telegram" ? (dados.rascunho.conteudo as ConteudoDoTelegram).texto : null,
                    botao: dados.rascunho.conteudo.tipo === "telegram" ? (dados.rascunho.conteudo as ConteudoDoTelegram).botao : null,
                  }
                : null
            }
          />
        )}
      </div>
    </>
  );
}
