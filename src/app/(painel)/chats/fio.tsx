import type { ItemDoFio } from "@/server/chats/chats";

const FUSO = "America/Sao_Paulo";
const hora = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const MARCA = { sdr: "SDR", voce: "Você", lead: null } as const;

/**
 * O fio da conversa (§4.8): a pessoa à esquerda, a conta à direita marcada
 * como SDR ou Você, e os marcos no meio.
 */
export function Fio({ itens }: { itens: ItemDoFio[] }) {
  return (
    <>
      {itens.map((item) => {
        if (item.tipo === "marco") {
          return (
            <li key={item.id} className="flex justify-center">
              <span
                className={`max-w-[90%] rounded-full border px-3 py-1 text-center text-xs ${
                  item.destaque ? "border-atencao/40 bg-atencao/10 text-atencao" : "border-linha text-tinta-fraca"
                }`}
              >
                {item.texto} · {hora(item.em)}
              </span>
            </li>
          );
        }
        const nossa = item.quem !== "lead";
        const marca = MARCA[item.quem];
        return (
          <li
            key={item.id}
            className={`max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm ${
              nossa
                ? `ml-auto rounded-tr-md ${item.quem === "sdr" ? "border-destaque/25 bg-destaque/[0.06]" : "border-linha-forte bg-superficie-alta"}`
                : "mr-auto rounded-tl-md border-linha bg-superficie"
            }`}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{item.texto}</p>
            <p className="mt-1.5 text-[11px] text-tinta-fraca">
              {marca && <span className={`mr-1.5 font-medium ${item.quem === "sdr" ? "text-destaque" : "text-tinta-suave"}`}>{marca}</span>}
              {hora(item.em)}
            </p>
          </li>
        );
      })}
    </>
  );
}
