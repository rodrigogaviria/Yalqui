import { api } from "../../lib/api";

export type MiUnidad = Awaited<ReturnType<typeof api.inquilino.miUnidad.query>>[number];
export type PagoDeUnidad = MiUnidad["pagos"][number];

export const nombreUnidad = (u: { direccion: string; complemento: string | null }) =>
  `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`;

export const PASTILLA_PAGO: Record<PagoDeUnidad["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "En revisión", clase: "pausado" },
  confirmado: { texto: "Confirmado", clase: "arrendado" },
  rechazado: { texto: "Rechazado", clase: "mora" },
};

/** El día del mes en que se espera el pago, recortado al último día de meses cortos. */
export function fechaPrevista(u: MiUnidad, hoy = new Date()) {
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(u.diaPago, ultimo));
}

/**
 * Cómo va este mes: un pago confirmado lo deja al día; uno subido y sin
 * confirmar queda en revisión; sin ninguno, cuenta la gracia de la unidad.
 */
export function estadoDelMes(u: MiUnidad, hoy = new Date()) {
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const delMes = u.pagos.filter((p) => p.periodo === periodo);
  if (delMes.some((p) => p.estado === "confirmado")) return { clave: "pagado", texto: "Al día", tono: "bien" as const };
  if (delMes.some((p) => p.estado === "pendiente")) return { clave: "revision", texto: "En revisión", tono: "ojo" as const };
  const limite = fechaPrevista(u, hoy);
  limite.setDate(limite.getDate() + u.diasGracia);
  limite.setHours(23, 59, 59);
  return hoy > limite
    ? { clave: "vencido", texto: "Vencido", tono: "mal" as const }
    : { clave: "porPagar", texto: "Por pagar", tono: "ojo" as const };
}

export async function verComprobante(archivoId: number) {
  const { url } = await api.archivos.urlDescarga.query({ archivoId });
  window.open(url, "_blank", "noopener");
}

export const fechaCorta = (f: string | Date) =>
  new Date(f).toLocaleDateString("es-CO", { timeZone: "UTC" });
