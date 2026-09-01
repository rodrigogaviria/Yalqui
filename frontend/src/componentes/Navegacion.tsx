import { Marca } from "./Marca";
import { IconoMenu } from "./Iconos";
import type { Perspectiva } from "../lib/menu";

export const ANCHO_MENU = 234;

/**
 * El menú lateral: lo que este rol puede hacer, y nada más.
 *
 * Las opciones sin construir se muestran apagadas en vez de ocultarse. Ocultarlas
 * dejaría un menú de dos ítems que no se parece a lo que la aplicación va a ser;
 * dejarlas activas prometería pantallas que no existen. Apagadas dicen la verdad.
 */
export function Navegacion({
  perspectiva, perspectivas, vista, subVista, email,
  alElegir, alCambiarPerspectiva, alSalir, abierto, alCerrar,
}: {
  perspectiva: Perspectiva;
  perspectivas: Perspectiva[];
  vista: string;
  subVista: string | undefined;
  email: string;
  alElegir: (clave: string, sub?: string) => void;
  alCambiarPerspectiva: (rol: string) => void;
  alSalir: () => void;
  /** En pantalla angosta el menú se desliza sobre el contenido. */
  abierto: boolean;
  alCerrar: () => void;
}) {
  return (
    <>
      {abierto && (
        <div
          onClick={alCerrar}
          aria-hidden="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(23,18,43,.35)", zIndex: 19,
          }}
          className="velo-menu"
        />
      )}

      <nav
        aria-label="Menú principal"
        className="menu-lateral"
        data-abierto={abierto ? "si" : "no"}
        style={{
          width: ANCHO_MENU, flexShrink: 0, background: "var(--papel)",
          borderRight: "1px solid var(--linea)", display: "flex", flexDirection: "column",
          padding: "20px 14px 14px", gap: 16, position: "sticky", top: 0, height: "100dvh",
        }}
      >
        <div style={{ padding: "0 8px" }}>
          <Marca tamano={24} />
        </div>

        <div style={{ padding: "0 8px" }}>
          {perspectivas.length > 1 ? (
            <label className="campo" style={{ gap: 4 }}>
              <span className="campo-etiqueta" style={{ fontSize: 11, letterSpacing: ".6px", textTransform: "uppercase" }}>
                Entrando como
              </span>
              <select
                value={perspectiva.rol}
                onChange={(e) => alCambiarPerspectiva(e.target.value)}
                style={{ fontSize: 13.5, height: 36 }}
              >
                {perspectivas.map((p) => (
                  <option key={p.rol} value={p.rol}>{p.titulo}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <div style={{
                display: "inline-block", fontSize: 10.5, letterSpacing: ".7px",
                textTransform: "uppercase", fontWeight: 700, color: "#fff",
                background: "var(--violeta)", borderRadius: 5, padding: "4px 9px",
              }}>
                {perspectiva.titulo}
              </div>
            </>
          )}
          <div style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 7 }}>
            Alcance: {perspectiva.alcance.toLowerCase()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {perspectiva.opciones.map((o) => {
            const activa = o.clave === vista;
            return (
              <div key={o.clave}>
              <button
                onClick={() => { alElegir(o.clave, o.sub?.[0]?.clave); if (!o.sub) alCerrar(); }}
                disabled={o.pendiente}
                aria-current={activa ? "page" : undefined}
                title={o.pendiente ? "Todavía sin construir" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 11px", borderRadius: 8, border: "none", textAlign: "left",
                  fontSize: 13.5, fontFamily: "inherit",
                  fontWeight: activa ? 600 : 500,
                  cursor: o.pendiente ? "default" : "pointer",
                  background: activa ? "var(--violeta-tenue)" : "transparent",
                  color: activa ? "var(--violeta-hondo)" : o.pendiente ? "var(--tinta-3)" : "var(--tinta-2)",
                  opacity: o.pendiente ? 0.6 : 1,
                }}
              >
                <IconoMenu nombre={o.icono} />
                <span style={{ flex: 1, minWidth: 0 }}>{o.titulo}</span>
                {o.pendiente && (
                  <span style={{
                    fontSize: 10, letterSpacing: ".4px", textTransform: "uppercase",
                    color: "var(--tinta-3)", border: "1px solid var(--linea)",
                    borderRadius: 4, padding: "1px 4px", fontWeight: 700,
                  }}>
                    pronto
                  </span>
                )}
              </button>

              {/* Las secciones se despliegan en vertical bajo su opción, y solo
                  cuando está activa: mostrarlas siempre daría un menú de
                  dieciocho renglones donde la mitad no aplica. */}
              {activa && o.sub && (
                <div
                  role="group"
                  aria-label={o.titulo}
                  style={{
                    display: "flex", flexDirection: "column", gap: 1,
                    margin: "3px 0 6px 19px", paddingLeft: 9,
                    borderLeft: "1px solid var(--linea)",
                  }}
                >
                  {o.sub.map((s) => {
                    const subActiva = s.clave === subVista;
                    return (
                      <button
                        key={s.clave}
                        onClick={() => { alElegir(o.clave, s.clave); alCerrar(); }}
                        aria-current={subActiva ? "page" : undefined}
                        style={{
                          textAlign: "left", border: "none", background: subActiva ? "var(--violeta-tenue)" : "transparent",
                          borderRadius: 7, padding: "7px 10px", cursor: "pointer",
                          fontFamily: "inherit", fontSize: 12.8,
                          fontWeight: subActiva ? 600 : 500,
                          color: subActiva ? "var(--violeta-hondo)" : "var(--tinta-2)",
                        }}
                      >
                        {s.titulo}
                      </button>
                    );
                  })}
                </div>
              )}
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: "auto", borderTop: "1px solid var(--linea)", paddingTop: 12,
          display: "grid", gap: 8,
        }}>
          <div style={{
            fontSize: 12.5, color: "var(--tinta-2)", padding: "0 8px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={email}>
            {email}
          </div>
          <button className="boton fantasma" style={{ height: 36, fontSize: 13.5 }} onClick={alSalir}>
            Salir
          </button>
        </div>
      </nav>
    </>
  );
}
