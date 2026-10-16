import { RotateCcw } from "lucide-react";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { Aviso } from "@/components/aviso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { ofertaDaOrganizacao } from "@/server/oferta/oferta";
import { exigirOperadorComModulo } from "@/server/supabase/servidor";
import { EditorDaAnalise } from "../../../onboarding/analysis/editor-da-analise";
import { confirmarAnaliseNasConfiguracoes, lerSiteDeNovo } from "../acoes";

// "Ler o site de novo" roda a leitura depois da resposta (after).
export const maxDuration = 300;

const quando = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Empresa (§4.12): a análise de negócio, produto e mercado, editável, e ler o site de novo. */
export default async function EmpresaPage({ searchParams }: PageProps<"/settings/company">) {
  const operador = await exigirOperadorComModulo("linkedin");
  const { msg } = await searchParams;
  const oferta = await comOperador(obterDb(), operador.id, (tx) => ofertaDaOrganizacao(tx, operador.organizacaoId, new Date()));
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
    </div>
  );
}
