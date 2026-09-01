import type { ReactNode } from "react";

/**
 * Etiqueta y control, asociados.
 *
 * El `<label>` envuelve al control en vez de ir al lado con un `htmlFor`: así
 * quedan vinculados sin tener que inventar un id único por campo, que es lo que
 * termina olvidándose. Sin esa asociación, un lector de pantalla anuncia el
 * campo sin decir qué se le está pidiendo a la persona.
 */
export function Campo({
  etiqueta, ayuda, children,
}: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>{ayuda}</span>}
    </label>
  );
}
