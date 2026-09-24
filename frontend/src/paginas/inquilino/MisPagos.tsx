import { useState } from "react";
import { api } from "../../lib/api";
import { SubirPago } from "../../componentes/SubirPago";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";
import { PASTILLA_PAGO, fechaCorta, nombreUnidad, verComprobante } from "./comun";

/** Todo lo que subiste y en qué quedó cada pago. */
export function MisPagos() {
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const { datos, error, aviso, cargar, setAviso } =
    usePantalla(() => api.inquilino.miUnidad.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis pagos"
        nota="Subí el comprobante de cada pago. Tu arrendador lo confirma y recién ahí queda al día."
        accion={datos.length > 0
          ? <button className="boton" onClick={() => setSubiendo(datos[0]!.id)}>Subir pago</button>
          : undefined}
      />
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {datos.length === 0 && <Vacio titulo="Sin pagos todavía">No tenés una unidad registrada.</Vacio>}

      {datos.map((u) => (
        <section key={u.id} className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0 }}>{nombreUnidad(u)}</h2>
          {u.pagos.length === 0 && (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Todavía no subiste ningún pago.</p>
          )}
          {u.pagos.map((p) => {
            const pastilla = PASTILLA_PAGO[p.estado];
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "11px 13px", borderRadius: 10, border: "1px solid var(--linea)",
              }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>Pago del {fechaCorta(p.fechaPago)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {p.medio === "efectivo" ? "Efectivo" : "Transferencia"}
                    {p.estado === "rechazado" && p.motivoRechazo ? ` · Motivo: ${p.motivoRechazo}` : ""}
                  </div>
                </div>
                <span className={`pastilla ${pastilla.clase}`}>{pastilla.texto}</span>
                {p.comprobanteArchivoId !== null && (
                  <button className="boton fantasma" style={{ height: 34, fontSize: 13 }}
                    onClick={() => void verComprobante(p.comprobanteArchivoId!)}>
                    Ver comprobante
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {subiendo !== null && (
        <Ventana titulo="Subir pago" alCerrar={() => setSubiendo(null)}>
          <SubirPago comoInquilino inmuebleId={subiendo}
            alTerminar={() => {
              setSubiendo(null);
              setAviso("Pago subido. Tu arrendador lo va a revisar.");
              void cargar();
            }} />
        </Ventana>
      )}
    </div>
  );
}
