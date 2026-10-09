"use client";

/** Marca ou desmarca todas as caixas habilitadas com o mesmo `name` no formulário. */
export function SelecionarTodos({ nome, rotulo }: { nome: string; rotulo: string }) {
  return (
    <input
      type="checkbox"
      aria-label={rotulo}
      title={rotulo}
      className="mt-0.5 size-4"
      onChange={(evento) => {
        const caixas = evento.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[name="${nome}"]:not(:disabled)`);
        caixas?.forEach((caixa) => {
          caixa.checked = evento.currentTarget.checked;
        });
      }}
    />
  );
}
