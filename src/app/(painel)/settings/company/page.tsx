import { RotateCcw } from "lucide-react";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { situacaoDosConcorrentes } from "@/server/concorrentes/concorrentes";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { ofertaDaOrganizacao } from "@/server/oferta/oferta";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { EditorDaAnalise } from "../../../onboarding/analysis/editor-da-analise";
import { EditorDeConcorrentes } from "../../../onboarding/competitors/editor-de-concorrentes";
import { confirmarAnaliseNasConfiguracoes, confirmarConcorrentesNasConfiguracoes, lerSiteDeNovo } from "../acoes";

// "Ler o site de novo" roda a leitura depois da resposta (after); "Analisar" um concorrente lê dentro da action.
export const maxDuration = 300;

const quando = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Empresa (§4.12): a análise de negócio, produto e mercado, editável, ler o site de novo e os concorrentes. */
export default async function EmpresaPage({ searchParams }: PageProps<"/settings/company">) {
  const operador = await exigirOperadorNoApp();
  const { msg } = await searchParams;
  const [oferta, concorrentes] = await comOperador(obterDb(), operador.id, (tx) =>
    Promise.all([ofertaDaOrganizacao(tx, operador.organizacaoId, new Date()), situacaoDosConcorrentes(tx, operador.organizacaoId)]),
  );
  const lendo = oferta.leitura.status === "lendo";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {typeof msg === "string" && <Aviso>{msg}</Aviso>}
      <form action={lerSiteDeNovo} className="cartao flex flex-wrap items-end gap-3 p-5">
        <label className="rotulo min-w-0 flex-1 basis-72">
          Site
          <input name="url" type="url" defaultValue={oferta.url ?? ""} required className="campo" disabled={lendo} />
        </label>
        <button type="submit" className="botao" disabled={lendo}>
          <RotateCcw aria-hidden />
          {lendo ? "Lendo o site..." : "Ler o site de novo"}
        </button>
        <p className="w-full text-xs text-tinta-fraca">
          {oferta.confirmado ? `Análise confirmada em ${quando(oferta.confirmado.em)}${oferta.confirmado.por ? ` por ${oferta.confirmado.por}` : ""}. ` : ""}
          Uma leitura nova vira rascunho: só vale depois de você confirmar.
        </p>
      </form>

      {lendo && (
        <Aviso>
          Lendo o site: {oferta.leitura.progresso.paginas.length} páginas abertas até agora. A análise de baixo continua valendo enquanto isso.
          <AtualizarSozinho segundos={5} />
        </Aviso>
      )}
      {(oferta.leitura.status === "erro" || oferta.leitura.status === "parada") && (
        <Aviso tom="atencao">
          A leitura nova não deu certo ({oferta.leitura.status === "parada" ? "parou no meio" : oferta.leitura.erro}). A análise de antes continua valendo.
        </Aviso>
      )}
      {oferta.rascunhoPendente && !lendo && (
        <Aviso tom="atencao">Há mudanças nesta análise que ainda não valem: confirme no fim da página.</Aviso>
      )}

      {oferta.dossie ? (
        <EditorDaAnalise
          key={oferta.geradoEm?.toISOString() ?? "sem-leitura"}
          inicial={oferta.dossie}
          confirmarAnalise={confirmarAnaliseNasConfiguracoes}
          rotuloDeConfirmar="Confirmar a análise"
        />
      ) : (
        <p className="vazio">Ainda não há análise. Informe o site acima e leia.</p>
      )}

      {oferta.confirmado && (
        <div id="concorrentes" className="mt-6">
          <h2 className="text-lg font-medium">Contra quem você disputa o cliente</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            {concorrentes.confirmados
              ? `Lista gravada em ${quando(concorrentes.confirmados.em)}${concorrentes.confirmados.por ? ` por ${concorrentes.confirmados.por}` : ""}. `
              : ""}
            Mudar a lista vale para as próximas sugestões de públicos e abordagens. O SDR que já existe não muda sozinho.
          </p>
          <EditorDeConcorrentes
            inicial={concorrentes.lista}
            analisesIniciais={concorrentes.analises}
            restantesIniciais={concorrentes.restantes}
            leituraLigada={concorrentes.leituraLigada}
            daAnalise={concorrentes.daAnalise}
            confirmar={confirmarConcorrentesNasConfiguracoes}
            rotuloDeConfirmar="Salvar os concorrentes"
            semConcorrente={false}
          />
        </div>
      )}
    </div>
  );
}
