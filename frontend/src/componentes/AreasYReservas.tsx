import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { etiqueta } from "../lib/etiquetas";
import { Campo } from "./Campo";

type AreaComun = Awaited<ReturnType<typeof api.reservas.areasComunes.query>>[number];
type Reserva = Awaited<ReturnType<typeof api.reservas.mias.query>>["reservas"][number];

const PASTILLA_ESTADO: Record<Reserva["estado"], string> = {
  pendiente: "pausado",
  aprobada: "arrendado",
  rechazada: "mora",
  cancelada: "borrador",
};

/**
 * Las áreas comunes y sus reservas, vistas desde una unidad.
 *
 * Si la unidad pertenece a una edificación, las áreas son las de la
 * edificación —se configuran una sola vez para todo el edificio—; si es una
 * unidad suelta, son las suyas. La clave sigue siendo la unidad y es el
 * servidor quien resuelve a cuál de las dos corresponde.
 */
export function AreasYReservas({ inmuebleId }: { inmuebleId: number }) {
  const [areas, setAreas] = useState<AreaComun[]>([]);
  const [listaReservas, setListaReservas] = useState<Reserva[]>([]);
  const [sitio, setSitio] = useState<{ edificacion: string | null; puedeAdministrar: boolean }>({ edificacion: null, puedeAdministrar: true });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | string | null>(null);
  const [nuevaArea, setNuevaArea] = useState({ nombre: "", descripcion: "", capacidad: "" });
  const [nuevaReserva, setNuevaReserva] = useState({
    areaComunId: "", solicitante: "", fecha: "", horaInicio: "", horaFin: "",
  });

  const cargar = useCallback(async () => {
    try {
      const [ac, res] = await Promise.all([
        api.reservas.areasComunes.query({ inmuebleId }),
        api.reservas.mias.query({ inmuebleId }),
      ]);
      setAreas(ac);
      setListaReservas(res.reservas);
      setSitio({ edificacion: res.edificacion, puedeAdministrar: res.puedeAdministrar });
      setError(null);
    } catch (e) { setError(mensajeDeError(e)); }
  }, [inmuebleId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(clave: number | string, fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(clave);
    setError(null);
    try {
      await fn();
      setAviso(mensaje);
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e));
      setAviso(null);
    } finally { setOcupado(null); }
  }

  return (
    <>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}
      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
            Áreas comunes{sitio.edificacion ? ` de ${sitio.edificacion}` : ""}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            {sitio.edificacion
              ? `Lo que se puede reservar en ${sitio.edificacion}: es el mismo para todas sus unidades.`
              : "Lo que se puede reservar en tu edificio."}
            {" "}Sin ninguna acá, la opción de Reservas de abajo no tiene qué ofrecer.
          </p>
        </div>

        {areas.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {areas.map((a) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "11px 13px", borderRadius: 10,
                border: `1px solid ${a.activa ? "var(--violeta)" : "var(--linea)"}`,
                background: a.activa ? "var(--violeta-tenue)" : "transparent",
              }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.nombre}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 1 }}>
                    {a.descripcion}{a.descripcion && a.capacidad ? " · " : ""}
                    {a.capacidad ? `hasta ${a.capacidad} personas` : ""}
                  </div>
                </div>
                {!sitio.puedeAdministrar && (
                  <span className={`pastilla ${a.activa ? "arrendado" : "borrador"}`}>{a.activa ? "Disponible" : "No disponible"}</span>
                )}
                {sitio.puedeAdministrar && <button
                  className={a.activa ? "boton riesgo" : "boton"}
                  style={{ height: 38, fontSize: 13.5, padding: "0 14px" }}
                  disabled={ocupado === `area-${a.id}`}
                  onClick={() => void accion(
                    `area-${a.id}`,
                    () => api.reservas.activarAreaComun.mutate({ inmuebleId, areaComunId: a.id, activa: !a.activa }),
                    a.activa ? `${a.nombre} ya no se puede reservar` : `${a.nombre} disponible para reservar`,
                  )}
                >
                  {ocupado === `area-${a.id}` ? "…" : a.activa ? "Desactivar" : "Activar"}
                </button>}
              </div>
            ))}
          </div>
        )}

        {sitio.puedeAdministrar && <form
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            void accion(
              "nueva-area",
              () => api.reservas.crearAreaComun.mutate({
                inmuebleId,
                nombre: nuevaArea.nombre,
                ...(nuevaArea.descripcion.trim() ? { descripcion: nuevaArea.descripcion.trim() } : {}),
                ...(nuevaArea.capacidad ? { capacidad: Number(nuevaArea.capacidad) } : {}),
              }),
              `${nuevaArea.nombre} agregada`,
            ).then(() => setNuevaArea({ nombre: "", descripcion: "", capacidad: "" }));
          }}
        >
          <Campo etiqueta="Nueva área">
            <input required placeholder="Nombre del área" value={nuevaArea.nombre}
              onChange={(e) => setNuevaArea((v) => ({ ...v, nombre: e.target.value }))} />
          </Campo>
          <Campo etiqueta="Descripción (opcional)">
            <input placeholder="Con cocina y mesas" value={nuevaArea.descripcion}
              onChange={(e) => setNuevaArea((v) => ({ ...v, descripcion: e.target.value }))} />
          </Campo>
          <Campo etiqueta="Capacidad (opcional)">
            <input type="number" min={1} style={{ width: 90 }} value={nuevaArea.capacidad}
              onChange={(e) => setNuevaArea((v) => ({ ...v, capacidad: e.target.value }))} />
          </Campo>
          <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }}
            disabled={ocupado === "nueva-area" || nuevaArea.nombre.trim().length < 2}>
            {ocupado === "nueva-area" ? "…" : "Agregar"}
          </button>
        </form>}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
            Reservas
            {listaReservas.some((r) => r.estado === "pendiente") && (
              <span className="pastilla pausado" style={{ marginLeft: 8, fontSize: 12 }}>
                {listaReservas.filter((r) => r.estado === "pendiente").length} por aprobar
              </span>
            )}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            Toda reserva nace pendiente. La aprobás o la rechazás vos, acá mismo.
          </p>
        </div>

        {areas.filter((a) => a.activa).length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>
            Activá un área común arriba para poder pedir una reserva.
          </p>
        ) : (
          <form
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
            onSubmit={(e) => {
              e.preventDefault();
              void accion(
                "nueva-reserva",
                () => api.reservas.solicitar.mutate({
                  inmuebleId,
                  areaComunId: Number(nuevaReserva.areaComunId),
                  ...(nuevaReserva.solicitante.trim() ? { solicitante: nuevaReserva.solicitante.trim() } : {}),
                  fecha: new Date(nuevaReserva.fecha),
                  horaInicio: nuevaReserva.horaInicio,
                  horaFin: nuevaReserva.horaFin,
                }),
                "Reserva pedida, queda pendiente de aprobar",
              ).then(() => setNuevaReserva({ areaComunId: "", solicitante: "", fecha: "", horaInicio: "", horaFin: "" }));
            }}
          >
            <Campo etiqueta="Recurso">
              <select required value={nuevaReserva.areaComunId}
                onChange={(e) => setNuevaReserva((v) => ({ ...v, areaComunId: e.target.value }))}>
                <option value="" disabled>Elegí una</option>
                {areas.filter((a) => a.activa).map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Solicitante (opcional)">
              <input placeholder="Tu nombre si no ponés otro" value={nuevaReserva.solicitante}
                onChange={(e) => setNuevaReserva((v) => ({ ...v, solicitante: e.target.value }))} />
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" required value={nuevaReserva.fecha}
                onChange={(e) => setNuevaReserva((v) => ({ ...v, fecha: e.target.value }))} />
            </Campo>
            <Campo etiqueta="Hora inicio">
              <input type="time" required value={nuevaReserva.horaInicio}
                onChange={(e) => setNuevaReserva((v) => ({ ...v, horaInicio: e.target.value }))} />
            </Campo>
            <Campo etiqueta="Hora fin">
              <input type="time" required value={nuevaReserva.horaFin}
                onChange={(e) => setNuevaReserva((v) => ({ ...v, horaFin: e.target.value }))} />
            </Campo>
            <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }}
              disabled={ocupado === "nueva-reserva"}>
              {ocupado === "nueva-reserva" ? "…" : "Pedir reserva"}
            </button>
          </form>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {listaReservas.map((r) => (
            <div key={r.id} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "11px 13px", borderRadius: 10, border: "1px solid var(--linea)",
            }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {r.area} <span style={{ fontWeight: 400, color: "var(--tinta-2)" }}>· {r.solicitante}</span>
                </div>
                <div className="num" style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 1 }}>
                  {new Date(r.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })} · {r.horaInicio.slice(0, 5)} a {r.horaFin.slice(0, 5)}
                </div>
              </div>

              <span className={`pastilla ${PASTILLA_ESTADO[r.estado]}`}>{etiqueta("estadoReserva", r.estado)}</span>

              {r.estado === "pendiente" && sitio.puedeAdministrar && (
                <>
                  <button className="boton" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                    disabled={ocupado === `decidir-${r.id}`}
                    onClick={() => void accion(
                      `decidir-${r.id}`,
                      () => api.reservas.decidir.mutate({ inmuebleId, reservaId: r.id, estado: "aprobada" }),
                      "Reserva aprobada",
                    )}
                  >
                    Aprobar
                  </button>
                  <button className="boton riesgo" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                    disabled={ocupado === `decidir-${r.id}`}
                    onClick={() => void accion(
                      `decidir-${r.id}`,
                      () => api.reservas.decidir.mutate({ inmuebleId, reservaId: r.id, estado: "rechazada" }),
                      "Reserva rechazada",
                    )}
                  >
                    Rechazar
                  </button>
                </>
              )}
              {(r.estado === "pendiente" || r.estado === "aprobada") && (sitio.puedeAdministrar || r.esMia) && (
                <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                  disabled={ocupado === `cancelar-${r.id}`}
                  onClick={() => void accion(
                    `cancelar-${r.id}`,
                    () => api.reservas.cancelar.mutate({ inmuebleId, reservaId: r.id }),
                    "Reserva cancelada",
                  )}
                >
                  Cancelar
                </button>
              )}
            </div>
          ))}
          {listaReservas.length === 0 && (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Todavía no hay reservas.</p>
          )}
        </div>
      </section>
    </>
  );
}
