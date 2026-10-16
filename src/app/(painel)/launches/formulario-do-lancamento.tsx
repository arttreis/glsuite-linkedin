"use client";

import { Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Aviso } from "@/components/aviso";
import { MAX_AULAS, MAX_NOME_DA_AULA, MAX_NOME_DO_LANCAMENTO, MAX_PRODUTO_DO_LANCAMENTO } from "@/domain/lancamentos";
import { criarLancamentoDoPainel, salvarLancamentoDoPainel } from "./acoes";

/** O que o formulário edita, com as datas como o `datetime-local` mostra (horário de Brasília). */
export type DadosDoFormulario = {
  nome: string;
  produto: string;
  captacaoEm: string;
  aulas: { nome: string; quando: string; link: string }[];
  carrinhoAbreEm: string;
  carrinhoFechaEm: string;
};

const VAZIO: DadosDoFormulario = { nome: "", produto: "", captacaoEm: "", aulas: [], carrinhoAbreEm: "", carrinhoFechaEm: "" };

type LinhaDaAula = DadosDoFormulario["aulas"][number] & { chave: number };

function CampoDeData({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (valor: string) => void }) {
  return (
    <label className="rotulo">
      {rotulo}
      <input type="datetime-local" value={valor} onChange={(e) => aoMudar(e.target.value)} className="campo campo-pequeno" />
    </label>
  );
}

/**
 * O formulário do lançamento (§4.21): nome, produto e as datas. Serve ao novo
 * (`id` null) e ao editar. As datas são no horário de Brasília. Nada salva até
 * o botão; o servidor confere as datas e diz o motivo do que recusar.
 */
export function FormularioDoLancamento({ id, inicial }: { id: string | null; inicial?: DadosDoFormulario }) {
  const router = useRouter();
  const dados = inicial ?? VAZIO;
  const proxima = useRef(dados.aulas.length);
  const [nome, setNome] = useState(dados.nome);
  const [produto, setProduto] = useState(dados.produto);
  const [captacaoEm, setCaptacaoEm] = useState(dados.captacaoEm);
  const [aulas, setAulas] = useState<LinhaDaAula[]>(dados.aulas.map((aula, chave) => ({ ...aula, chave })));
  const [carrinhoAbreEm, setCarrinhoAbreEm] = useState(dados.carrinhoAbreEm);
  const [carrinhoFechaEm, setCarrinhoFechaEm] = useState(dados.carrinhoFechaEm);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const mudarAula = (chave: number, mudanca: Partial<LinhaDaAula>) => setAulas((atuais) => atuais.map((aula) => (aula.chave === chave ? { ...aula, ...mudanca } : aula)));
  const adicionarAula = () => {
    const chave = proxima.current++;
    setAulas((atuais) => [...atuais, { chave, nome: `Aula ${atuais.length + 1}`, quando: "", link: "" }]);
  };

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    iniciar(async () => {
      setErro(null);
      const entrada: DadosDoFormulario = {
        nome,
        produto,
        captacaoEm,
        aulas: aulas.map(({ nome, quando, link }) => ({ nome, quando, link })),
        carrinhoAbreEm,
        carrinhoFechaEm,
      };
      const resultado = id ? await salvarLancamentoDoPainel(id, entrada) : await criarLancamentoDoPainel(entrada);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const destino = id ?? ("id" in resultado ? resultado.id : null);
      router.push(`/launches/${destino}?msg=${encodeURIComponent(id ? "Lançamento salvo." : "Lançamento criado. Ele nasce montando: ninguém entra até você pôr no ar.")}`);
    });
  };

  return (
    <form onSubmit={enviar} noValidate className="flex max-w-3xl flex-col gap-5">
      <section className="cartao flex flex-col gap-4 p-5">
        <label className="rotulo">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME_DO_LANCAMENTO} placeholder="Ex.: Lançamento Outubro" className="campo" aria-describedby="ajuda-nome" />
          <span id="ajuda-nome" className="text-xs font-normal text-tinta-fraca">
            Vira a tag de quem entra no lançamento. Até {MAX_NOME_DO_LANCAMENTO} caracteres.
            {id && " Mudar o nome não renomeia a tag que já existe."}
          </span>
        </label>
        <label className="rotulo">
          Produto
          <input value={produto} onChange={(e) => setProduto(e.target.value)} maxLength={MAX_PRODUTO_DO_LANCAMENTO} placeholder="O que vai ser vendido no carrinho" className="campo" />
        </label>
      </section>

      <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-datas">
        <div>
          <h2 id="titulo-datas" className="text-[15px] font-semibold">
            Datas
          </h2>
          <p className="mt-1 text-[13px] text-tinta-suave">Horário de Brasília. A fase do lançamento sai daqui: captação, aulas, carrinho e fim.</p>
        </div>
        <div className="max-w-xs">
          <CampoDeData rotulo="Captação começa" valor={captacaoEm} aoMudar={setCaptacaoEm} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[13px] font-medium">Aulas</legend>
          {aulas.length === 0 && <p className="text-[13px] text-tinta-suave">Sem aulas. Lançamento sem aula vai da captação direto ao carrinho.</p>}
          {aulas.map((aula, indice) => (
            <div key={aula.chave} className="flex flex-wrap items-end gap-2 rounded-xl bg-superficie-alta p-3">
              <label className="rotulo min-w-0 flex-1 basis-40">
                Nome da aula {indice + 1}
                <input value={aula.nome} onChange={(e) => mudarAula(aula.chave, { nome: e.target.value })} maxLength={MAX_NOME_DA_AULA} className="campo campo-pequeno" />
              </label>
              <label className="rotulo basis-52">
                Quando
                <input type="datetime-local" value={aula.quando} onChange={(e) => mudarAula(aula.chave, { quando: e.target.value })} className="campo campo-pequeno" />
              </label>
              <label className="rotulo min-w-0 flex-1 basis-56">
                Link (opcional)
                <input
                  type="url"
                  value={aula.link}
                  onChange={(e) => mudarAula(aula.chave, { link: e.target.value })}
                  placeholder="https://"
                  className="campo campo-pequeno"
                />
              </label>
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => setAulas((atuais) => atuais.filter((a) => a.chave !== aula.chave))}
                aria-label={`Tirar a aula ${indice + 1}`}
              >
                <X aria-hidden />
                Tirar
              </button>
            </div>
          ))}
          {aulas.length < MAX_AULAS && (
            <button type="button" className="botao botao-pequeno w-fit" onClick={adicionarAula}>
              <Plus aria-hidden />
              Adicionar aula
            </button>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-xl">
          <CampoDeData rotulo="Carrinho abre" valor={carrinhoAbreEm} aoMudar={setCarrinhoAbreEm} />
          <CampoDeData rotulo="Carrinho fecha" valor={carrinhoFechaEm} aoMudar={setCarrinhoFechaEm} />
        </div>
      </section>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <button type="submit" className="botao botao-primario w-fit" disabled={salvando}>
        <Save aria-hidden />
        {salvando ? "Salvando…" : id ? "Salvar" : "Criar lançamento"}
      </button>
    </form>
  );
}
