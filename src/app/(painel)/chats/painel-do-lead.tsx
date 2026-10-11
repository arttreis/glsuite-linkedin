import { CalendarCheck, ExternalLink, Hand, RotateCcw, Star, Undo2, UserRound, X } from "lucide-react";
import { ROTULO_DO_ESTADO } from "@/domain/estados";
import { colunaDoEstado } from "@/domain/pipeline";
import type { ChatDoLead } from "@/server/chats/chats";
import { assumirParadoDoChat, devolverAoSdrDoChat, marcarConversa, registrarOptoutDaConversa, tentarDeNovoDoChat } from "./acoes";

/** Os dados do lead ao lado da conversa (§4.8) e o que a pessoa pode fazer com ela. */
export function PainelDoLead({ chat }: { chat: ChatDoLead }) {
  const { lead } = chat;
  const coluna = colunaDoEstado(lead.estado);
  const encerrado = lead.optout || lead.estado === "encerrado_nao";
  const linhas: [string, string | null][] = [
    ["Cargo", lead.cargo],
    ["Empresa", lead.empresa],
    ["Local", lead.localizacao],
    ["Campanha", lead.campanha],
    ["Etapa", coluna ? `${coluna.rotulo} (${ROTULO_DO_ESTADO[lead.estado].toLowerCase()})` : ROTULO_DO_ESTADO[lead.estado]],
    ["Nota", lead.nota === null ? null : `${lead.nota} de 100`],
    ["Conta", lead.conta],
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2.5 text-sm">
        {linhas
          .filter(([, valor]) => valor)
          .map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <dt className="text-tinta-fraca">{rotulo}</dt>
              <dd className="text-right">{valor}</dd>
            </div>
          ))}
      </dl>
      <a href={lead.url} target="_blank" rel="noreferrer" className="botao botao-pequeno w-full">
        <ExternalLink aria-hidden />
        Perfil no LinkedIn
      </a>

      {lead.parado && (
        <div className="flex flex-col gap-2 rounded-xl border border-atencao/40 bg-atencao/[0.06] p-3">
          <p className="text-[13px]">A sequência parou: {lead.parado}</p>
          <form action={tentarDeNovoDoChat}>
            <input type="hidden" name="leadId" value={lead.id} />
            <button type="submit" className="botao botao-pequeno w-full justify-start">
              <RotateCcw aria-hidden />
              Tentar de novo (você aprova antes)
            </button>
          </form>
          <form action={assumirParadoDoChat}>
            <input type="hidden" name="leadId" value={lead.id} />
            <button type="submit" className="botao botao-pequeno w-full justify-start">
              <UserRound aria-hidden />
              Assumir a conversa
            </button>
          </form>
        </div>
      )}

      {lead.estado === "escalado_humano" && (
        <form action={devolverAoSdrDoChat} className="flex flex-col gap-2 border-t border-linha pt-4">
          <input type="hidden" name="leadId" value={lead.id} />
          <p className="text-[13px] text-tinta-suave">A conversa está com você. O SDR não responde aqui até você devolver.</p>
          <button type="submit" className="botao botao-primario w-full">
            <Undo2 aria-hidden />
            Devolver ao SDR
          </button>
        </form>
      )}

      {!encerrado && (
        <div className="flex flex-col gap-2 border-t border-linha pt-4">
          <p className="text-[13px] font-medium text-tinta-suave">Mover no Pipeline</p>
          <form action={marcarConversa}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="para" value="qualificado" />
            <button className="botao botao-pequeno w-full justify-start">
              <Star aria-hidden />
              Qualificado
            </button>
          </form>
          <form action={marcarConversa} className="flex flex-col gap-2 rounded-xl border border-linha p-2.5">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="para" value="reuniao_marcada" />
            <label className="rotulo">
              Data da reunião
              <input type="datetime-local" name="reuniaoEm" className="campo campo-pequeno" />
            </label>
            <button className="botao botao-pequeno w-full justify-start">
              <CalendarCheck aria-hidden />
              Reunião marcada
            </button>
          </form>
          <form action={marcarConversa}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="para" value="encerrado_nao" />
            <button className="botao botao-pequeno w-full justify-start">
              <X aria-hidden />
              Disse não
            </button>
          </form>
          <form action={registrarOptoutDaConversa}>
            <input type="hidden" name="leadId" value={lead.id} />
            <button className="botao botao-perigo botao-pequeno w-full justify-start">
              <Hand aria-hidden />
              Pediu para parar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
