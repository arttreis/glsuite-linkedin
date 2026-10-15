"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/aviso";
import { MAX_NOME_DA_LISTA } from "@/domain/lista-de-empresas";
import { adicionarEmpresasDoPainel, criarListaDoPainel } from "../acoes-das-listas";
import { emPartes, EntradaDeEmpresas, type EmpresasLidas } from "./entrada-de-empresas";

/** Criar uma lista: nome e as empresas. Lista grande vai em partes; ao terminar, abre a lista para procurar no LinkedIn. */
export function NovaLista() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [lidas, setLidas] = useState<EmpresasLidas>({ nomes: [], repetidas: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const criar = () =>
    iniciar(async () => {
      setErro(null);
      const [primeira = [], ...resto] = emPartes(lidas.nomes);
      const criada = await criarListaDoPainel({ nome, nomes: primeira });
      if (!criada.ok) {
        setErro(criada.erro);
        return;
      }
      let enviadas = primeira.length;
      for (const parte of resto) {
        setProgresso(`Guardando as empresas: ${enviadas} de ${lidas.nomes.length}…`);
        const adicionadas = await adicionarEmpresasDoPainel({ listaId: criada.id, nomes: parte });
        if (!adicionadas.ok) {
          setErro(`A lista foi criada com ${enviadas} empresas, mas o resto não entrou: ${adicionadas.erro} Abra a lista e adicione o que faltou.`);
          break;
        }
        enviadas += parte.length;
      }
      router.push(`/campaigns/company-lists/${criada.id}`);
    });

  return (
    <div className="flex flex-col gap-4">
      <label className="rotulo max-w-md">
        Nome da lista
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={MAX_NOME_DA_LISTA}
          placeholder="Ex.: Administradoras judiciais"
          className="campo"
          disabled={pendente}
        />
      </label>
      <EntradaDeEmpresas aoMudar={setLidas} desabilitado={pendente} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {pendente && progresso && <p className="text-xs text-tinta-fraca">{progresso}</p>}
      <div>
        <button type="button" className="botao botao-primario" onClick={criar} disabled={pendente || !nome.trim() || lidas.nomes.length === 0}>
          <Plus aria-hidden />
          {pendente ? "Criando…" : "Criar lista"}
        </button>
      </div>
      <p className="text-xs text-tinta-fraca">Depois de criar, o Kakou procura cada empresa no LinkedIn para a busca achar quem trabalha nela.</p>
    </div>
  );
}
