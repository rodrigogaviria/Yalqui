import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Vacio } from "./comun";

type Area = Awaited<ReturnType<typeof api.misReservas.areas.query>>[number];
type Reserva = Awaited<ReturnType<typeof api.misReservas.reservas.query>>[number];
type Accion = (clave: number | string, fn: () => Promise<unknown>, mensaje: string) => Promise<void>;

const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "pausado" },
  aprobada: { texto: "Aprobada", clase: "arrendado" },
  rechazada: { texto: "Rechazada", clase: "mora" },
  cancelada: { texto: "Cancelada", clase: "borrador" },
};

const sitioDe = (r: { edificacion: string | null; direccion: string | null; complemento: string | null }) =>
  r.edificacion ?? `${r.direccion}${r.complemento ? `, ${r.complemento}` : ""}`;

/**
 * Lo que se puede reservar en las propiedades —salón social, BBQ, cancha— y
 * quién pidió qué. Áreas comunes se configuran acá mismo: no hay catálogo de
 * Yalqui de por medio, cada propietario arma el suyo.
 */
export function Reservas() {
  const [vista, setVista] = useState<"calendario" | "lista">("calendario");
  const [mes, setMes] = useState(() => ({ anio: new Date().getFullYear(), mes: new Date().getMonth() }));
  const [registrando, setRegistrando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [detalle, setDetalle] = useState<Reserva | null>(null);
  const { datos, error, aviso, ocupado, accion, cargar, setAviso } = usePantalla(async () => {
    const [areas, reservas] = await Promise.all([
      api.misReservas.areas.query(),
      api.misReservas.reservas.query(),
    ]);
    return { areas, reservas };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { areas, reservas } = datos;
  const activas = areas.filter((a) => a.activa);
  const pendientes = reservas.filter((r) => r.estado === "pendiente");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Reservas"
        nota="Salón social, BBQ, cancha: lo que se puede reservar en tus propiedades. Un inquilino también puede pedir turno."
        accion={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["calendario", "lista"] as const).map((v) => (
                <button key={v} className={vista === v ? "boton" : "boton fantasma"}
                  style={{ height: 38, fontSize: 13.5, padding: "0 13px" }}
                  onClick={() => setVista(v)}>
                  {v === "calendario" ? "Calendario" : "Lista"}
                </button>
              ))}
            </div>
            <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
              onClick={() => setConfigurando((v) => !v)}>
              {configurando ? "Cerrar configuración" : "Configurar áreas"}
            </button>
            {activas.length > 0 && (
              <button className="boton" onClick={() => setRegistrando((v) => !v)}>
                {registrando ? "Cancelar" : "Registrar reserva"}
              </button>
            )}
          </div>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {configurando && (
        <ConfigurarAreas areas={areas} alCambiar={() => { setAviso("Guardado."); void cargar(); }} />
      )}

      {registrando && (
        <FormularioReserva areas={activas}
          alTerminar={() => { setRegistrando(false); setAviso("Reserva registrada."); void cargar(); }} />
      )}

      {pendientes.length > 0 && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Reservas pendientes</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
              Las pidió un inquilino, o alguien más con acceso a la edificación. Aprobalas o rechazalas.
            </p>
          </div>
          {pendientes.map((r) => <FilaReserva key={r.id} r={r} ocupado={ocupado} accion={accion} />)}
        </section>
      )}

      {areas.length === 0 ? (
        <Vacio titulo="Todavía no configuraste ningún área">
          Entrá a «Configurar áreas» y dale de alta al salón social, la cancha o lo que tengas para reservar.
        </Vacio>
      ) : reservas.length === 0 ? (
        <Vacio titulo="Todavía no hay reservas">Cuando alguien reserve, aparece acá.</Vacio>
      ) : vista === "calendario" ? (
        <CalendarioReservas reservas={reservas} mes={mes} setMes={setMes} alElegir={setDetalle} />
      ) : (
        <ListaReservas reservas={reservas} ocupado={ocupado} accion={accion} />
      )}

      {detalle && (
        <Ventana titulo="Detalle de la reserva" alCerrar={() => setDetalle(null)}>
          <FilaReserva r={detalle} ocupado={ocupado} accion={accion} detallada />
        </Ventana>
      )}
    </div>
  );
}

/** Una reserva con sus datos y sus acciones: Confirmar, Rechazar, Cancelar según el estado. */
function FilaReserva({ r, ocupado, accion, detallada = false }: {
  r: Reserva; ocupado: number | string | null; accion: Accion; detallada?: boolean;
}) {
  const e = ESTADO[r.estado] ?? { texto: r.estado, clase: "borrador" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      padding: detallada ? 0 : "12px 14px", borderRadius: 10,
      border: detallada ? "none" : "1px solid var(--linea)",
    }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.area}</div>
        <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
          {sitioDe(r)} · {new Date(r.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })}
          {" · "}{r.horaInicio.slice(0, 5)}–{r.horaFin.slice(0, 5)}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>A nombre de {r.solicitante}</div>
      </div>
      <span className={`pastilla ${e.clase}`}>{e.texto}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {r.estado === "pendiente" && (
          <>
            <button className="boton" style={{ height: 36, fontSize: 13.5 }}
              disabled={ocupado === r.id}
              onClick={() => void accion(r.id,
                () => api.misReservas.decidirReserva.mutate({ reservaId: r.id, estado: "aprobada" }),
                "Reserva aprobada.")}>
              {ocupado === r.id ? "…" : "Aprobar"}
            </button>
            <button className="boton riesgo" style={{ height: 36, fontSize: 13.5 }}
              disabled={ocupado === r.id}
              onClick={() => void accion(r.id,
                () => api.misReservas.decidirReserva.mutate({ reservaId: r.id, estado: "rechazada" }),
                "Reserva rechazada.")}>
              Rechazar
            </button>
          </>
        )}
        {(r.estado === "pendiente" || r.estado === "aprobada") && (
          <button className="boton fantasma" style={{ height: 36, fontSize: 13.5 }}
            disabled={ocupado === r.id}
            onClick={() => void accion(r.id,
              () => api.misReservas.cancelarReserva.mutate({ reservaId: r.id }),
              "Reserva cancelada.")}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function ListaReservas({ reservas, ocupado, accion }: { reservas: Reserva[]; ocupado: number | string | null; accion: Accion }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {reservas.map((r) => (
        <div key={r.id} className="tarjeta" style={{ padding: "13px 16px" }}>
          <FilaReserva r={r} ocupado={ocupado} accion={accion} detallada />
        </div>
      ))}
    </div>
  );
}

type Mes = { anio: number; mes: number };
const periodoDe = (m: Mes) => `${m.anio}-${String(m.mes + 1).padStart(2, "0")}`;

function nombreMes(periodo: string): string {
  const [ano, mes] = periodo.split("-");
  const fecha = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const FONDO_ESTADO: Record<string, string> = {
  pendiente: "var(--ojo-tenue)", aprobada: "var(--bien-tenue)",
  rechazada: "var(--mal-tenue)", cancelada: "var(--papel-2)",
};
const TEXTO_ESTADO: Record<string, string> = {
  pendiente: "#4a3405", aprobada: "#0e3b24", rechazada: "#7d211d", cancelada: "var(--tinta-2)",
};

/** Cada reserva en el día que le toca, coloreada por su estado. */
function CalendarioReservas({ reservas, mes, setMes, alElegir }: {
  reservas: Reserva[]; mes: Mes; setMes: (m: Mes) => void; alElegir: (r: Reserva) => void;
}) {
  const ultimo = new Date(mes.anio, mes.mes + 1, 0).getDate();
  const primerDiaSemana = (new Date(mes.anio, mes.mes, 1).getDay() + 6) % 7;
  const periodo = periodoDe(mes);

  const porDia = new Map<number, Reserva[]>();
  for (const r of reservas) {
    if (String(r.fecha).slice(0, 7) !== periodo) continue;
    const dia = Number(String(r.fecha).slice(8, 10));
    porDia.set(dia, [...(porDia.get(dia) ?? []), r]);
  }

  const celdas: Array<number | null> = [
    ...Array<null>(primerDiaSemana).fill(null),
    ...Array.from({ length: ultimo }, (_, i) => i + 1),
  ];
  const mover = (d: number) => {
    const f = new Date(mes.anio, mes.mes + d, 1);
    setMes({ anio: f.getFullYear(), mes: f.getMonth() });
  };

  return (
    <section className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="boton fantasma" style={{ height: 34, padding: "0 12px" }}
            aria-label="Mes anterior" onClick={() => mover(-1)}>←</button>
          <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0, minWidth: 150, textAlign: "center" }}>
            {nombreMes(periodo)}
          </h2>
          <button className="boton fantasma" style={{ height: 34, padding: "0 12px" }}
            aria-label="Mes siguiente" onClick={() => mover(1)}>→</button>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--tinta-2)" }}>
          {Object.entries(ESTADO).map(([k, e]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: FONDO_ESTADO[k] }} />
              {e.texto}
            </span>
          ))}
        </div>
      </div>

      {porDia.size === 0 && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Sin reservas este mes.</p>
      )}

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 6, minWidth: 770 }}>
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} style={{ fontSize: 12, fontWeight: 600, color: "var(--tinta-3)", textAlign: "center" }}>{d}</div>
          ))}
          {celdas.map((dia, i) => (
            <div key={i} style={{
              minHeight: 78, borderRadius: 8, padding: 6,
              border: dia === null ? "none" : "1px solid var(--linea)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              {dia !== null && (
                <>
                  <span className="num" style={{ fontSize: 12, color: "var(--tinta-3)" }}>{dia}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {(porDia.get(dia) ?? []).map((r) => (
                      <button key={r.id} type="button" onClick={() => alElegir(r)}
                        title={`${r.area} · ${sitioDe(r)} · ${r.horaInicio.slice(0, 5)}–${r.horaFin.slice(0, 5)} · ${r.solicitante} · ${ESTADO[r.estado]?.texto ?? r.estado}`}
                        style={{
                          fontSize: 11, padding: "2px 6px", borderRadius: 6, border: "none", cursor: "pointer",
                          background: FONDO_ESTADO[r.estado], color: TEXTO_ESTADO[r.estado], textAlign: "left", fontFamily: "inherit",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                        <strong>{r.horaInicio.slice(0, 5)}</strong> {r.area}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** El catálogo de áreas de todo el portafolio: alta, y prender o apagar. */
function ConfigurarAreas({ areas, alCambiar }: { areas: Area[]; alCambiar: () => void }) {
  const [edificaciones, setEdificaciones] = useState<Array<{ id: number; nombre: string }> | null>(null);
  const [unidades, setUnidades] = useState<Array<{ id: number; titulo: string; edificacionId: number | null }> | null>(null);
  useEffect(() => {
    void Promise.all([api.inmuebles.misEdificaciones.query(), api.inmuebles.mias.query()])
      .then(([eds, u]) => {
        setEdificaciones(eds);
        setUnidades(u.unidades.map((x) => ({
          id: x.id, edificacionId: x.edificacionId,
          titulo: `${x.direccion}${x.complemento ? `, ${x.complemento}` : ""}`,
        })));
      })
      .catch(() => { setEdificaciones([]); setUnidades([]); });
  }, []);
  const sueltas = (unidades ?? []).filter((u) => u.edificacionId === null);

  const [sitio, setSitio] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const opciones = [
    ...(edificaciones ?? []).map((e) => ({ valor: `e${e.id}`, texto: `${e.nombre} (toda la edificación)` })),
    ...sueltas.map((u) => ({ valor: String(u.id), texto: u.titulo })),
  ];
  const sitioActual = sitio || opciones[0]?.valor || "";

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const esEdificacion = sitioActual.startsWith("e");
      await api.misReservas.registrarAreaComun.mutate({
        ...(esEdificacion ? { edificacionId: Number(sitioActual.slice(1)) } : { inmuebleId: Number(sitioActual) }),
        nombre: nombre.trim(),
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        ...(capacidad.trim() ? { capacidad: Number(capacidad) } : {}),
      });
      setNombre(""); setDescripcion(""); setCapacidad("");
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  async function activar(areaComunId: number, activa: boolean) {
    setOcupado(areaComunId);
    try {
      await api.misReservas.activarAreaComun.mutate({ areaComunId, activa });
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setOcupado(null); }
  }

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 16 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Áreas comunes</h2>

      {areas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Todavía no diste de alta ninguna.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {areas.map((a) => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "10px 12px", borderRadius: 10, border: "1px solid var(--linea)",
              opacity: a.activa ? 1 : 0.6,
            }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.nombre}</div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  {sitioDe(a)}{a.capacidad ? ` · hasta ${a.capacidad}` : ""}{a.descripcion ? ` · ${a.descripcion}` : ""}
                </div>
              </div>
              <button className="boton fantasma" style={{ height: 34, fontSize: 13 }}
                disabled={ocupado === a.id}
                onClick={() => void activar(a.id, !a.activa)}>
                {ocupado === a.id ? "…" : a.activa ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={crear} style={{ display: "grid", gap: 12, borderTop: "1px solid var(--linea)", paddingTop: 16 }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 600, margin: 0 }}>Dar de alta un área</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          <Campo etiqueta="Propiedad">
            <select value={sitioActual} onChange={(e) => setSitio(e.target.value)}>
              {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Nombre">
            <input value={nombre} placeholder="Salón social" onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Capacidad" ayuda="Opcional">
            <input type="number" min={1} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Descripción" ayuda="Opcional">
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
        {error && <div className="aviso malo" role="alert">{error}</div>}
        <div>
          <button type="submit" className="boton" disabled={enviando || nombre.trim().length < 2 || opciones.length === 0}>
            {enviando ? "Guardando…" : "Agregar área"}
          </button>
        </div>
        {opciones.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--tinta-3)" }}>
            Registrá una unidad o una edificación antes de configurar áreas.
          </p>
        )}
      </form>
    </section>
  );
}

/** Pide una reserva en cualquier área activa del portafolio. */
function FormularioReserva({ areas, alTerminar }: { areas: Area[]; alTerminar: () => void }) {
  const [areaComunId, setAreaComunId] = useState(String(areas[0]?.id ?? ""));
  const [solicitante, setSolicitante] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [horaInicio, setHoraInicio] = useState("18:00");
  const [horaFin, setHoraFin] = useState("20:00");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.misReservas.registrarReserva.mutate({
        areaComunId: Number(areaComunId), fecha, horaInicio, horaFin,
        ...(solicitante.trim() ? { solicitante: solicitante.trim() } : {}),
      });
      alTerminar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  if (areas.length === 0) {
    return <div className="aviso ojo">Configurá un área activa antes de registrar una reserva.</div>;
  }

  return (
    <form onSubmit={enviar} className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Registrar una reserva</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Campo etiqueta="Área">
          <select value={areaComunId} onChange={(e) => setAreaComunId(e.target.value)}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {sitioDe(a)}</option>)}
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
        <Campo etiqueta="A nombre de" ayuda="Opcional · si no es para vos">
          <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
        </Campo>
      </div>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar reserva"}
        </button>
      </div>
    </form>
  );
}
