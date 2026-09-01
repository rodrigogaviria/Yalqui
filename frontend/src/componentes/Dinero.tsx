/** Pesos colombianos, sin decimales: nadie escribe centavos en un canon. */
const formato = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function pesos(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(n) ? formato.format(n) : "—";
}

export function Dinero({ valor, className }: { valor: string | number | null | undefined; className?: string }) {
  return <span className={`num ${className ?? ""}`}>{pesos(valor)}</span>;
}
