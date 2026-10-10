/** Uso contra um limite: trilho tracejado e preenchimento menta; âmbar quando o limite é atingido. */
export function Barra({ valor, limite }: { valor: number; limite: number }) {
  const cheio = valor >= limite;
  return (
    <span className={`barra ${cheio ? "barra-cheia" : ""}`} aria-hidden>
      <span style={{ width: `${Math.min(100, (valor / limite) * 100)}%` }} />
    </span>
  );
}
