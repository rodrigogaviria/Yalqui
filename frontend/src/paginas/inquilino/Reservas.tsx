import { useState } from "react";
import { api } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "pausado" },
  aprobada: { texto: "Aprobada", clase: "arrendado" },
  rechazada: { texto: "Rechazada", clase: "mora" },
  cancelada: { texto: "Cancelada", clase: "borrador" },
};

/** Reservar el salón social, el BBQ o lo que haya disponible, y ver en qué quedó cada pedido. */
export function Reservas() {
  const [abierto, setAbierto] = useState(false);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [areas, reservas] = await Promise.all([
      api.inquilino.areasComunes.query(),
      api.inquilino.misReservas.query(),
    ]);
    return { areas, reservas };
  });
  const [areaComunId, setAreaComunId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [horaInicio, setHoraInicio] = useState("18:00");
  const [horaFin, setHoraFin] = useState("20:00");

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { areas, reservas } = datos;
  const area = areaComunId || String(areas[0]?.id ?? "");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Reservas"
        nota="El salón social, el BBQ, la cancha: lo que tu propiedad tenga para reservar. Tu arrendador aprueba el turno."
        accion={areas.length > 0
          ? <button className="boton" onClick={() => setAbierto((v) => !v)}>{abierto ? "Cancelar" : "Reservar"}</button>
          : undefined}
      />
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {areas.length === 0 && (
        <Vacio titulo="Sin áreas para reservar">Tu propiedad todavía no tiene áreas comunes configuradas.</Vacio>
      )}

      {abierto && (
        <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
            <Campo etiqueta="Área">
              <select value={area} onChange={(e) => setAreaComunId(e.target.value)}>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.capacidad ? ` (hasta ${a.capacidad})` : ""}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta="Desde">
              <input type="time" required value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="time" required value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </Campo>
          </div>
          <div>
            <button className="boton"
              disabled={ocupado === "nuevo"}
              onClick={() => void accion("nuevo",
                () => api.inquilino.reservar.mutate({ areaComunId: Number(area), fecha, horaInicio, horaFin }),
                "Reserva pedida. Queda pendiente de que la aprueben.",
              ).then(() => setAbierto(false))}>
              {ocupado === "nuevo" ? "Enviando…" : "Pedir reserva"}
            </button>
          </div>
        </section>
      )}

      {reservas.length === 0 ? (
        areas.length > 0 ? <Vacio titulo="Todavía no reservaste nada">Elegí un área y un horario con «Reservar».</Vacio> : null
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {reservas.map((r) => {
            const e = ESTADO[r.estado] ?? { texto: r.estado, clase: "borrador" };
            return (
              <article key={r.id} className="tarjeta" style={{
                padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.area}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {new Date(r.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })}
                    {" · "}{r.horaInicio.slice(0, 5)}–{r.horaFin.slice(0, 5)}
                  </div>
                </div>
                <span className={`pastilla ${e.clase}`}>{e.texto}</span>
                {(r.estado === "pendiente" || r.estado === "aprobada") && (
                  <button className="boton fantasma" style={{ height: 34, fontSize: 13 }}
                    disabled={ocupado === r.id}
                    onClick={() => void accion(r.id,
                      () => api.inquilino.cancelarReserva.mutate({ reservaId: r.id }),
                      "Reserva cancelada.")}>
                    {ocupado === r.id ? "…" : "Cancelar"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
