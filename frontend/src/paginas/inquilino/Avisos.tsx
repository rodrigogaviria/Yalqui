import { api } from "../../lib/api";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";

/** Lo que tu arrendador te avisó: mantenimientos, cortes, cambios. */
export function Avisos() {
  const { datos, error } = usePantalla(() => api.inquilino.avisos.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado titulo="Radar" nota="Lo que tu arrendador ya te comunicó: mantenimientos, cortes y cambios." />
      {datos.length === 0 && (
        <Vacio titulo="Todo tranquilo por ahora">Cuando tu arrendador te comunique algo, aparece acá.</Vacio>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {datos.map((a) => (
          <article key={a.id} className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15.5, fontWeight: 600, margin: 0 }}>{a.titulo}</h2>
              {a.enviadoAt && (
                <span style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>
                  {new Date(a.enviadoAt).toLocaleDateString("es-CO")}
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-line" }}>{a.cuerpo}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
