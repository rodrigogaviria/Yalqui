import { api } from "../../lib/api";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";

/** Lo que tu arrendador ya te comunicó, con lo que todavía no leíste a la vista. */
export function Avisos() {
  const { datos, error, ocupado, accion } = usePantalla(() => api.inquilino.avisos.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const sinLeer = datos.filter((a) => !a.leido).length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Novedades ⚡️"
        nota={sinLeer > 0
          ? `Tenés ${sinLeer} sin leer.`
          : "Lo que tu arrendador ya te comunicó: mantenimientos, cortes y cambios."}
      />
      {datos.length === 0 && (
        <Vacio titulo="Todo tranquilo por ahora">Cuando tu arrendador te comunique algo, aparece acá.</Vacio>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {datos.map((a) => (
          <article key={a.id} className="tarjeta" style={{
            padding: "16px 18px", display: "grid", gap: 8,
            borderLeft: `4px solid ${a.leido ? "var(--linea)" : "var(--violeta)"}`,
            background: a.leido ? "var(--papel)" : "var(--violeta-tenue)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15.5, fontWeight: a.leido ? 500 : 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                {!a.leido && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: "var(--violeta)" }} />}
                {a.titulo}
                {!a.leido && <span className="pastilla publicado" style={{ fontSize: 11 }}>Nuevo</span>}
              </h2>
              {a.enviadoAt && (
                <span style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>
                  {new Date(a.enviadoAt).toLocaleDateString("es-CO")}
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-line" }}>{a.cuerpo}</p>
            <div>
              <button className="boton fantasma" style={{ height: 32, fontSize: 13, padding: "0 12px" }}
                disabled={ocupado === a.id}
                onClick={() => void accion(a.id,
                  () => api.inquilino.marcarAviso.mutate({ comunicadoId: a.id, leido: !a.leido }),
                  a.leido ? "Marcado como no leído." : "Marcado como leído.")}>
                {ocupado === a.id ? "…" : a.leido ? "Marcar como no leído" : "Marcar como leído"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
