"use client";

import { useRouter } from "next/navigation";

type Opcao = { id: string; nome: string };

/** Filtro por campanha e por conta (§4.10): troca a URL na hora. */
export function FiltrosDoPipeline({
  campanhas,
  contas,
  campanha,
  conta,
}: {
  campanhas: Opcao[];
  contas: Opcao[];
  campanha: string | null;
  conta: string | null;
}) {
  const router = useRouter();
  const ir = (mudanca: { campaign?: string; account?: string }) => {
    const params = new URLSearchParams();
    const atual = { campaign: campanha ?? "", account: conta ?? "", ...mudanca };
    if (atual.campaign) params.set("campaign", atual.campaign);
    if (atual.account) params.set("account", atual.account);
    const busca = params.toString();
    router.push(busca ? `/pipeline?${busca}` : "/pipeline");
  };

  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label="Campanha"
        className="campo campo-pequeno w-auto"
        value={campanha ?? ""}
        onChange={(e) => ir({ campaign: e.target.value })}
      >
        <option value="">Todas as campanhas</option>
        {campanhas.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.nome}
          </option>
        ))}
      </select>
      {contas.length > 1 && (
        <select
          aria-label="Conta"
          className="campo campo-pequeno w-auto"
          value={conta ?? ""}
          onChange={(e) => ir({ account: e.target.value })}
        >
          <option value="">Todas as contas</option>
          {contas.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
