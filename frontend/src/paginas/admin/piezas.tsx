import type { ReactNode } from "react";

/** Una tabla de administración: densa, con cabecera fija de estilo. */
export function Tabla({ columnas, children }: { columnas: string[]; children: ReactNode }) {
  return (
    // La tabla scrollea dentro de su caja en vez de estirar la página: en un
    // teléfono, doce columnas de configuración no caben de otra manera.
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {/* La clave va por posición: hay tablas con más de una columna sin
                título (la de acciones), y el texto no las distingue. */}
            {columnas.map((c, i) => (
              <th key={i} style={{
                textAlign: "left", padding: "9px 12px", fontSize: 12.5, fontWeight: 600,
                color: "var(--tinta-2)", borderBottom: "1px solid var(--linea)", whiteSpace: "nowrap",
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Celda({ children, ancho, alinear = "left" }: {
  children: ReactNode; ancho?: number; alinear?: "left" | "right" | "center";
}) {
  return (
    <td style={{
      padding: "10px 12px", borderBottom: "1px solid var(--linea)",
      textAlign: alinear, ...(ancho !== undefined ? { width: ancho } : {}),
    }}>{children}</td>
  );
}

/** Interruptor de activo/inactivo. Un catálogo se apaga, no se borra. */
export function Interruptor({ activo, onChange, ocupado = false }: {
  activo: boolean; onChange: (v: boolean) => void; ocupado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={activo ? "Activo, tocar para desactivar" : "Inactivo, tocar para activar"}
      disabled={ocupado}
      onClick={() => onChange(!activo)}
      style={{
        width: 42, height: 24, borderRadius: 12, position: "relative", cursor: ocupado ? "wait" : "pointer",
        background: activo ? "var(--violeta)" : "var(--linea)",
        border: "none", padding: 0, transition: "background .15s", opacity: ocupado ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: activo ? 21 : 3, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left .15s",
      }} />
    </button>
  );
}

export function Seccion({ titulo, nota, children, accion }: {
  titulo: string; nota?: string; children: ReactNode; accion?: ReactNode;
}) {
  return (
    <section className="tarjeta" style={{ padding: "18px 20px 8px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{titulo}</h2>
          {nota && <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)", maxWidth: 620 }}>{nota}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}
