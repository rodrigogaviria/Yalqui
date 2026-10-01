import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

type Gasto = Awaited<ReturnType<typeof api.rentabilidad.gastos.query>>[number];

/**
 * Lo que sale de cada unidad: mantenimiento, administración, impuestos.
 *
 * Son los egresos de los mismos movimientos que alimentan Mis Rendimientos,
 * así que un gasto que se anota acá ya cuenta allá.
 */
export function Gastos({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [vista, setVista] = useState<"calendario" | "lista">("calendario");
  const [mes, setMes] = useState(() => ({ anio: new Date().getFullYear(), mes: new Date().getMonth() }));
  const [registrando, setRegistrando] = useState(false);
  const [detalle, setDetalle] = useState<Gasto | null>(null);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [gastos, tipos, proveedores] = await Promise.all([
      api.rentabilidad.gastos.query(),
      api.rentabilidad.tipos.query(),
      api.rentabilidad.proveedores.query(),
    ]);
    return { gastos, tipos: tipos.filter((t) => t.tipo === "egreso"), proveedores };
  });
  const [edificaciones, setEdificaciones] = useState<Array<{ id: number; nombre: string }>>([]);
  useEffect(() => { void api.inmuebles.misEdificaciones.query().then(setEdificaciones).catch(() => setEdificaciones([])); }, []);
  const [inmuebleId, setInmuebleId] = useState("");
  const [prorrateo, setProrrateo] = useState<"partes_iguales" | "por_area" | "por_canon">("partes_iguales");
  const [tipoId, setTipoId] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [proveedorId, setProveedorId] = useState("");
  const [nota, setNota] = useState("");

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const gastos = datos.gastos;
  const total = gastos.reduce((t, g) => t + Number(g.monto), 0);
  const mesActual = new Date().toISOString().slice(0, 7);
  const delMes = gastos.filter((g) => String(g.fecha).slice(0, 7) === mesActual)
    .reduce((t, g) => t + Number(g.monto), 0);
  const unidad = inmuebleId || (edificaciones[0] ? `e${edificaciones[0].id}` : String(unidades[0]?.id ?? ""));
  const esEdificacion = unidad.startsWith("e");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Gastos"
        nota="Lo que sale de tus propiedades. También cuenta en Mis Rendimientos."
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
            {unidades.length > 0 && (
              <button className="boton" onClick={() => setRegistrando((v) => !v)}>
                {registrando ? "Cancelar" : "Registrar gasto"}
              </button>
            )}
          </div>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {registrando && (
        <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Registrar un gasto</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
            <Campo etiqueta="Propiedad">
              <select value={unidad} onChange={(e) => setInmuebleId(e.target.value)}>
                {edificaciones.map((e) => <option key={`e${e.id}`} value={`e${e.id}`}>{e.nombre} (toda la edificación)</option>)}
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
              </select>
            </Campo>
            {esEdificacion && (
              <Campo etiqueta="Reparto entre las unidades">
                <select value={prorrateo} onChange={(e) => setProrrateo(e.target.value as typeof prorrateo)}>
                  <option value="partes_iguales">Partes iguales</option>
                  <option value="por_area">Por área</option>
                  <option value="por_canon">Por canon</option>
                </select>
              </Campo>
            )}
            <Campo etiqueta="Tipo de gasto">
              <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                <option value="">Elegí uno…</option>
                {datos.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Monto">
              <input type="number" min={0} step={1000} value={monto} placeholder="320000"
                onChange={(e) => setMonto(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta="Proveedor" ayuda="A quién se le pagó">
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Elegí uno…</option>
                {datos.proveedores.map((p) => <option key={p.id} value={p.id}>{p.razonSocial}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Concepto" ayuda="Opcional · qué se pagó">
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          <div>
            <button className="boton"
              disabled={ocupado === "nuevo" || tipoId === "" || Number(monto) <= 0 || proveedorId === ""}
              onClick={() => void accion("nuevo",
                () => api.rentabilidad.registrar.mutate({
                  ...(esEdificacion ? { edificacionId: Number(unidad.slice(1)), prorrateo } : { inmuebleId: Number(unidad) }),
                  tipoMovimientoId: Number(tipoId),
                  monto: Number(monto), fecha, proveedorId: Number(proveedorId),
                  ...(nota.trim() ? { nota: nota.trim() } : {}),
                }),
                "Gasto registrado.",
              ).then(() => { setRegistrando(false); setMonto(""); setNota(""); setProveedorId(""); setTipoId(""); })}>
              {ocupado === "nuevo" ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        </section>
      )}

      <Cifras>
        <Cifra titulo="Este mes" valor={pesos(delMes)} tono={delMes > 0 ? "mal" : "normal"} />
        <Cifra titulo="Total registrado" valor={pesos(total)} />
        <Cifra titulo="Gastos" valor={String(gastos.length)} />
      </Cifras>

      {gastos.length === 0 ? (
        <Vacio titulo="Todavía no registraste gastos">
          Mantenimiento, administración, impuesto predial: anotalos acá y quedan
          descontados en Mis Rendimientos.
        </Vacio>
      ) : vista === "calendario" ? (
        <CalendarioGastos gastos={gastos} mes={mes} setMes={setMes} alElegir={setDetalle} />
      ) : (
        <ListaGastos gastos={gastos} alElegir={setDetalle} />
      )}

      {detalle && (
        <Ventana titulo="Detalle del gasto" alCerrar={() => setDetalle(null)}>
          <DetalleGasto gasto={detalle} />
        </Ventana>
      )}
    </div>
  );
}

type Mes = { anio: number; mes: number };
const periodoDe = (m: Mes) => `${m.anio}-${String(m.mes + 1).padStart(2, "0")}`;

/**
 * El tipo de gasto, con el servicio puntual si es genérico.
 *
 * «Servicios públicos» agrupa agua, energía, gas e internet: de un gasto que
 * nació solo de una factura pagada, la nota ya dice «Factura de agua · …», y
 * de ahí sale el servicio. Sin eso, o si el tipo ya es específico (Seguro,
 * Impuesto predial), se deja el tipo tal cual.
 */
function tituloGasto(g: Gasto): string {
  const base = g.concepto ?? "Sin clasificar";
  if (g.origenTipo !== "factura_propiedad" || !g.nota) return base;
  const m = /^Factura de ([^·]+)/i.exec(g.nota);
  if (!m) return base;
  const servicio = m[1]!.trim();
  const capitalizado = servicio.charAt(0).toUpperCase() + servicio.slice(1);
  return capitalizado.toLowerCase() === base.toLowerCase() ? base : `${base} · ${capitalizado}`;
}

function nombreMes(periodo: string): string {
  const [ano, mes] = periodo.split("-");
  const fecha = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Cada gasto puesto en el día en que se pagó, con su tipo y su valor a la vista; tocarlo muestra el detalle. */
function CalendarioGastos({ gastos, mes, setMes, alElegir }: {
  gastos: Gasto[]; mes: Mes; setMes: (m: Mes) => void; alElegir: (g: Gasto) => void;
}) {
  const ultimo = new Date(mes.anio, mes.mes + 1, 0).getDate();
  const primerDiaSemana = (new Date(mes.anio, mes.mes, 1).getDay() + 6) % 7; // lunes = 0
  const periodo = periodoDe(mes);

  const porDia = new Map<number, Gasto[]>();
  for (const g of gastos) {
    if (String(g.fecha).slice(0, 7) !== periodo) continue;
    const dia = Number(String(g.fecha).slice(8, 10));
    porDia.set(dia, [...(porDia.get(dia) ?? []), g]);
  }
  const delMes = [...porDia.values()].flat().reduce((t, g) => t + Number(g.monto), 0);

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
        <span style={{ fontSize: 13, color: "var(--tinta-2)" }}>
          Total del mes: <strong className="num">{pesos(delMes)}</strong>
        </span>
      </div>

      {porDia.size === 0 && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>
          Sin gastos registrados este mes.
        </p>
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
                    {(porDia.get(dia) ?? []).map((g) => (
                      <button key={g.id} type="button" onClick={() => alElegir(g)}
                        title={`${tituloGasto(g)} · ${pesos(Number(g.monto))}${g.proveedor ? ` · ${g.proveedor}` : ""} · tocá para ver el detalle`}
                        style={{
                          fontSize: 11, padding: "2px 6px", borderRadius: 6, border: "none", cursor: "pointer",
                          background: "var(--mal-tenue)", color: "#7d211d", textAlign: "left", fontFamily: "inherit",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                        <strong>{tituloGasto(g)}</strong> · {pesos(Number(g.monto))}
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

function ListaGastos({ gastos, alElegir }: { gastos: Gasto[]; alElegir: (g: Gasto) => void }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {gastos.map((g) => (
        <div key={g.id} className="tarjeta" role="button" tabIndex={0}
          onClick={() => alElegir(g)}
          onKeyDown={(e) => { if (e.key === "Enter") alElegir(g); }}
          style={{
            padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            cursor: "pointer",
          }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>
              {tituloGasto(g)}
              {g.origenTipo === "factura_propiedad" && (
                <span className="pastilla publicado" style={{ marginLeft: 8, fontSize: 11 }}>De una factura</span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
              {g.edificacion
                ? `${g.edificacion} · toda la edificación (reparto ${g.prorrateo === "por_area" ? "por área" : g.prorrateo === "por_canon" ? "por canon" : "en partes iguales"})`
                : `${g.direccion}${g.complemento ? `, ${g.complemento}` : ""}`}
              {" · "}{new Date(g.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })}
              {g.proveedor ? ` · ${g.proveedor}` : ""}
              {g.nota ? ` · ${g.nota}` : ""}
            </div>
          </div>
          <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(g.monto))}</div>
          {g.partes.length > 0 && (
            <details style={{ flexBasis: "100%" }} onClick={(e) => e.stopPropagation()}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--tinta-2)" }}>
                Ver el reparto entre {g.partes.length} unidades
              </summary>
              <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                {g.partes.map((x) => (
                  <div key={x.unidad} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{x.unidad}</span>
                    <span className="num">{pesos(Number(x.monto))}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

/** Todo lo que se sabe de un gasto: para cuando la pastilla del calendario, o la fila de la lista, se quedan cortas. */
function DetalleGasto({ gasto: g }: { gasto: Gasto }) {
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--linea)" }}>
      <span style={{ color: "var(--tinta-2)", fontSize: 13.5 }}>{etiqueta}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: "right" }}>{valor}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {g.origenTipo === "factura_propiedad" && (
        <span className="pastilla publicado" style={{ width: "fit-content", fontSize: 11 }}>De una factura</span>
      )}
      {fila("Tipo de gasto", tituloGasto(g))}
      {fila("Valor", pesos(Number(g.monto)))}
      {fila("Fecha", new Date(g.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" }))}
      {fila("Propiedad", g.edificacion
        ? `${g.edificacion} · toda la edificación`
        : `${g.direccion}${g.complemento ? `, ${g.complemento}` : ""}`)}
      {g.edificacion && fila("Reparto", g.prorrateo === "por_area" ? "Por área" : g.prorrateo === "por_canon" ? "Por canon" : "Partes iguales")}
      {g.proveedor && fila("Proveedor", g.proveedor)}
      {g.nota && fila("Concepto", g.nota)}

      {g.partes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
            Reparto entre {g.partes.length} unidades
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {g.partes.map((x) => (
              <div key={x.unidad} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{x.unidad}</span>
                <span className="num">{pesos(Number(x.monto))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
