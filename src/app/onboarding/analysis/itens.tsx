"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

/** Um campo do formulário de um item: texto, texto longo ou escolha. */
export type CampoDoItem<T> = {
  chave: keyof T & string;
  rotulo: string;
  max?: number;
  obrigatorio?: boolean;
  multilinha?: boolean;
  opcoes?: Record<string, string>;
  placeholder?: string;
  /** Campo opcional que vira null quando fica vazio (ex.: fonte da prova). */
  vazioViraNull?: boolean;
};

function Formulario<T extends Record<string, unknown>>({
  inicial,
  campos,
  aoSalvar,
  aoCancelar,
  rotuloDoSalvar,
}: {
  inicial: T;
  campos: CampoDoItem<T>[];
  aoSalvar: (item: T) => void;
  aoCancelar: () => void;
  rotuloDoSalvar: string;
}) {
  const [item, setItem] = useState<T>(inicial);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    const limpo = { ...item };
    for (const campo of campos) {
      const valor = limpo[campo.chave];
      if (typeof valor !== "string") continue;
      const texto = valor.trim();
      if (campo.obrigatorio && texto.length === 0) {
        setErro(`Preencha ${campo.rotulo.toLowerCase()}.`);
        return;
      }
      (limpo as Record<string, unknown>)[campo.chave] = texto.length === 0 && campo.vazioViraNull ? null : texto;
    }
    aoSalvar(limpo);
  };

  return (
    <form
      onSubmit={enviar}
      onKeyDown={(evento) => evento.key === "Escape" && aoCancelar()}
      className="recuo flex flex-col gap-3"
    >
      {campos.map((campo, indice) => {
        const valor = item[campo.chave];
        const comum = {
          value: typeof valor === "string" ? valor : "",
          maxLength: campo.max,
          placeholder: campo.placeholder,
          autoFocus: indice === 0,
          className: "campo",
        };
        const mudar = (texto: string) => {
          setErro(null);
          setItem((atual) => ({ ...atual, [campo.chave]: texto }));
        };
        return (
          <label key={campo.chave} className="rotulo">
            {campo.rotulo}
            {campo.opcoes ? (
              <select {...comum} onChange={(e) => mudar(e.target.value)}>
                {Object.entries(campo.opcoes).map(([chave, rotulo]) => (
                  <option key={chave} value={chave}>
                    {rotulo}
                  </option>
                ))}
              </select>
            ) : campo.multilinha ? (
              <textarea {...comum} rows={2} onChange={(e) => mudar(e.target.value)} />
            ) : (
              <input {...comum} onChange={(e) => mudar(e.target.value)} />
            )}
          </label>
        );
      })}
      {erro && <p className="text-sm text-erro">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" className="botao botao-primario botao-pequeno">
          <Check aria-hidden />
          {rotuloDoSalvar}
        </button>
        <button type="button" className="botao botao-pequeno" onClick={aoCancelar}>
          <X aria-hidden />
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotoesDoItem({
  nome,
  aoEditar,
  aoRemover,
  podeRemover,
  desabilitado,
}: {
  nome: string;
  aoEditar: () => void;
  aoRemover?: () => void;
  podeRemover: boolean;
  desabilitado: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <button
        type="button"
        className="botao botao-pequeno px-2"
        aria-label={`Corrigir ${nome}`}
        title="Corrigir"
        onClick={aoEditar}
        disabled={desabilitado}
      >
        <Pencil aria-hidden />
      </button>
      {aoRemover && (
        <button
          type="button"
          className="botao botao-pequeno px-2"
          aria-label={`Tirar ${nome}`}
          title={podeRemover ? "Tirar" : "Precisa ficar pelo menos um"}
          onClick={aoRemover}
          disabled={desabilitado || !podeRemover}
        >
          <Trash2 aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Lista da análise em que cada item se corrige ali mesmo (§4.2): o item vira
 * formulário, "OK" grava. Adicionar abre um formulário vazio no fim.
 */
export function ListaEditavel<T extends Record<string, unknown>>({
  nome,
  itens,
  campos,
  ver,
  novo,
  maximo,
  minimo = 0,
  aoMudar,
  desabilitado = false,
  vazio,
}: {
  nome: string;
  itens: T[];
  campos: CampoDoItem<T>[];
  ver: (item: T) => ReactNode;
  novo: () => T;
  maximo: number;
  minimo?: number;
  aoMudar: (itens: T[]) => void;
  desabilitado?: boolean;
  vazio?: ReactNode;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const adicionando = editando === itens.length;

  const salvar = (indice: number, item: T) => {
    setEditando(null);
    aoMudar(indice === itens.length ? [...itens, item] : itens.map((atual, i) => (i === indice ? item : atual)));
  };

  return (
    <div>
      {itens.length === 0 && !adicionando && vazio && <p className="text-sm text-tinta-fraca">{vazio}</p>}
      <ul className="divide-y divide-linha">
        {itens.map((item, indice) => (
          <li key={indice} className="group py-2.5 first:pt-0">
            {editando === indice ? (
              <Formulario
                inicial={item}
                campos={campos}
                rotuloDoSalvar="OK"
                aoSalvar={(novoItem) => salvar(indice, novoItem)}
                aoCancelar={() => setEditando(null)}
              />
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">{ver(item)}</div>
                <BotoesDoItem
                  nome={`${nome} ${indice + 1}`}
                  aoEditar={() => setEditando(indice)}
                  aoRemover={() => aoMudar(itens.filter((_, i) => i !== indice))}
                  podeRemover={itens.length > minimo}
                  desabilitado={desabilitado || editando !== null}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {adicionando ? (
        <div className="mt-2">
          <Formulario
            inicial={novo()}
            campos={campos}
            rotuloDoSalvar="Adicionar"
            aoSalvar={(novoItem) => salvar(itens.length, novoItem)}
            aoCancelar={() => setEditando(null)}
          />
        </div>
      ) : (
        itens.length < maximo && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta disabled:opacity-50"
            onClick={() => setEditando(itens.length)}
            disabled={desabilitado || editando !== null}
          >
            <Plus className="size-4" aria-hidden />
            Adicionar {nome}
          </button>
        )
      )}
    </div>
  );
}

type Texto = { texto: string };

/** Lista de frases curtas (diferenciais, dores, gatilhos) sobre a mesma edição item a item. */
export function ListaDeFrases({
  nome,
  itens,
  maximo,
  max = 200,
  aoMudar,
  desabilitado,
  vazio,
}: {
  nome: string;
  itens: string[];
  maximo: number;
  max?: number;
  aoMudar: (itens: string[]) => void;
  desabilitado?: boolean;
  vazio?: ReactNode;
}) {
  return (
    <ListaEditavel<Texto>
      nome={nome}
      itens={itens.map((texto) => ({ texto }))}
      campos={[{ chave: "texto", rotulo: nome.charAt(0).toUpperCase() + nome.slice(1), max, obrigatorio: true }]}
      ver={(item) => <p>{item.texto}</p>}
      novo={() => ({ texto: "" })}
      maximo={maximo}
      aoMudar={(lista) => aoMudar(lista.map((item) => item.texto))}
      desabilitado={desabilitado}
      vazio={vazio}
    />
  );
}

/** Um texto só (nome, resumo, tom de voz) que se corrige ali mesmo. */
export function TextoEditavel({
  nome,
  valor,
  max,
  multilinha,
  ver,
  aoMudar,
  desabilitado = false,
}: {
  nome: string;
  valor: string;
  max: number;
  multilinha?: boolean;
  ver?: (valor: string) => ReactNode;
  aoMudar: (valor: string) => void;
  desabilitado?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <Formulario<Texto>
        inicial={{ texto: valor }}
        campos={[{ chave: "texto", rotulo: nome.charAt(0).toUpperCase() + nome.slice(1), max, multilinha, obrigatorio: true }]}
        rotuloDoSalvar="OK"
        aoSalvar={(item) => {
          setEditando(false);
          aoMudar(item.texto);
        }}
        aoCancelar={() => setEditando(false)}
      />
    );
  }
  return (
    <div className="group flex items-start gap-3">
      <div className="min-w-0 flex-1">{ver ? ver(valor) : <p>{valor}</p>}</div>
      <BotoesDoItem nome={nome} aoEditar={() => setEditando(true)} podeRemover={false} desabilitado={desabilitado} />
    </div>
  );
}
