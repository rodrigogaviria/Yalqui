import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

/**
 * Lo primero que ve el propietario.
 *
 * Responde tres preguntas y no más: cuánto me deben, qué tengo que atender hoy
 * y cómo va el portafolio. Un tablero con veinte números no se lee — se mira
 * una vez y después se saltea.
 */
export function Dashboard({ alIr }: { alIr: (clave: string) => void }) {
  const { datos, error } = usePantalla(() => api.dashboard.propietario.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  if (datos.sinUnidades) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <Encabezado titulo="Dashboard" />
        <Vacio titulo="Todavía no tenés unidades">
          Registrá la primera desde el portafolio. En el plan Básico no pagás nada:
          podés publicar, precalificar y firmar el contrato.
        </Vacio>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Dashboard"
        nota={`${datos.unidades.total} ${datos.unidades.total === 1 ? "unidad" : "unidades"} · ${datos.unidades.arrendadas} arrendada${datos.unidades.arrendadas === 1 ? "" : "s"}`}
      />

      {datos.alertas.length > 0 && (
        <section className="tarjeta" style={{ padding: "16px 19px", display: "grid", gap: 9 }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 600, margin: 0 }}>Para hoy</h2>
          {datos.alertas.map((a, i) => (
            <button
              key={i}
              onClick={() => alIr(a.clave)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                width: "100%", textAlign: "left", background: "var(--papel-2)", border: "1px solid var(--linea)",
                borderRadius: 9, padding: "11px 13px", cursor: "pointer",
                fontFamily: "inherit", fontSize: 14, color: "var(--tinta)",
              }}
            >
              <span>{a.texto}</span>
              <span aria-hidden="true" style={{ color: "var(--violeta)" }}>→</span>
            </button>
          ))}
        </section>
      )}

      <Cifras>
        <Cifra titulo="Canon del mes" valor={pesos(datos.dinero.canonMes)}
          pie="Solo lo arrendado: lo publicado no produce todavía" />
        <Cifra titulo="Por cobrar" valor={pesos(datos.dinero.porCobrar)}
          tono={datos.dinero.porCobrar > 0 ? "ojo" : "normal"} />
        <Cifra titulo="Vencido" valor={pesos(datos.dinero.vencido)}
          tono={datos.dinero.vencido > 0 ? "mal" : "bien"} />
      </Cifras>

      <Cifras>
        <Cifra titulo="Arrendadas" valor={String(datos.unidades.arrendadas)} />
        <Cifra titulo="Publicadas" valor={String(datos.unidades.publicadas)} />
        <Cifra titulo="En borrador" valor={String(datos.unidades.borrador)} />
        <Cifra titulo="Incidencias abiertas" valor={String(datos.pendientes.incidenciasAbiertas)}
          tono={datos.pendientes.incidenciasAbiertas > 0 ? "ojo" : "normal"} />
      </Cifras>

      {datos.alertas.length === 0 && (
        <div className="aviso bueno" role="status">
          No hay nada pendiente: ningún pago por verificar, ningún interesado sin revisar
          y ninguna incidencia abierta.
        </div>
      )}
    </div>
  );
}
