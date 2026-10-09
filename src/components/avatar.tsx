/** Iniciais de uma pessoa ou de um perfil, para achar o nome no olho. */
export function Avatar({ nome, pequeno = false }: { nome: string; pequeno?: boolean }) {
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full border border-linha-forte bg-superficie-alta font-medium text-tinta-suave ${
        pequeno ? "size-7 text-[11px]" : "size-9 text-[13px]"
      }`}
    >
      {iniciais}
    </span>
  );
}
