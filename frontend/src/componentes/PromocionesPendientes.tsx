import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";

type Promocion = Awaited<ReturnType<typeof api.promociones.deMisUnidades.query>>[number];

/** Los pedidos de «vecino embajador» sobre mis unidades, a la espera de que los decida. */
export function PromocionesPendientes() {
  const [datos, setDatos] = useState<Promocion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    try { setDatos(await api.promociones.deMisUnidades.query()); setError(null); }
    catch (e) { setError(mensajeDeError(e)); }
  }
  useEffect(() => { void cargar(); }, []);

  async function decidir(id: number, decision: "aprobada" | "rechazada") {
    setOcupada(id);
    try {
      await api.promociones.decidir.mutate({ promocionId: id, decision });
      setAviso(decision === "aprobada" ? "Promoción aprobada." : "Promoción rechazada.");
      await cargar();
    } catch (e) { setError(mensajeDeError(e)); } finally { setOcupada(null); }
  }

  const pendientes = datos?.filter((p) => p.estado === "pendiente") ?? [];
  if (pendientes.length === 0) return null;

  return (
    <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Pedidos de promocionar tus unidades</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
          Si la arriendan por su intermedio, se liquida la comisión configurada en la unidad.
        </p>
      </div>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}
      {pendientes.map((p) => (
        <div key={p.id} style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "12px 14px", borderRadius: 10, border: "1px solid var(--linea)",
        }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>
              {p.direccion}{p.complemento ? `, ${p.complemento}` : ""}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
              {p.promotorNombre} {p.promotorApellido}{p.promotorTelefono ? ` · ${p.promotorTelefono}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="boton" style={{ height: 38, fontSize: 13.5 }}
              disabled={ocupada === p.id} onClick={() => void decidir(p.id, "aprobada")}>
              Aprobar
            </button>
            <button className="boton riesgo" style={{ height: 38, fontSize: 13.5 }}
              disabled={ocupada === p.id} onClick={() => void decidir(p.id, "rechazada")}>
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
