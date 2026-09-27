import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

/**
 * Lo que sale de cada unidad: mantenimiento, administración, impuestos.
 *
 * Son los egresos de los mismos movimientos que alimentan Mis Rendimientos,
 * así que un gasto que se anota acá ya cuenta allá.
 */
export function Gastos({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [registrando, setRegistrando] = useState(false);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [gastos, tipos] = await Promise.all([
      api.rentabilidad.gastos.query(),
      api.rentabilidad.tipos.query(),
    ]);
    return { gastos, tipos: tipos.filter((t) => t.tipo === "egreso") };
  });
  const [edificaciones, setEdificaciones] = useState<Array<{ id: number; nombre: string }>>([]);
  useEffect(() => { void api.inmuebles.misEdificaciones.query().then(setEdificaciones).catch(() => setEdificaciones([])); }, []);
  const [inmuebleId, setInmuebleId] = useState("");
  const [prorrateo, setProrrateo] = useState<"partes_iguales" | "por_area" | "por_canon">("partes_iguales");
  const [tipoId, setTipoId] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
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
        accion={unidades.length > 0
          ? <button className="boton" onClick={() => setRegistrando((v) => !v)}>{registrando ? "Cancelar" : "Registrar gasto"}</button>
          : undefined}
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
          </div>
          <Campo etiqueta="Concepto" ayuda="Opcional · qué se pagó">
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          <div>
            <button className="boton"
              disabled={ocupado === "nuevo" || tipoId === "" || Number(monto) <= 0}
              onClick={() => void accion("nuevo",
                () => api.rentabilidad.registrar.mutate({
                  ...(esEdificacion ? { edificacionId: Number(unidad.slice(1)), prorrateo } : { inmuebleId: Number(unidad) }),
                  tipoMovimientoId: Number(tipoId),
                  monto: Number(monto), fecha, ...(nota.trim() ? { nota: nota.trim() } : {}),
                }),
                "Gasto registrado.",
              ).then(() => { setRegistrando(false); setMonto(""); setNota(""); setTipoId(""); })}>
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
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {gastos.map((g) => (
            <div key={g.id} className="tarjeta" style={{
              padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {g.concepto ?? "Sin clasificar"}
                  {g.origenTipo === "factura_propiedad" && (
                    <span className="pastilla publicado" style={{ marginLeft: 8, fontSize: 11 }}>De una factura</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  {g.edificacion
                    ? `${g.edificacion} · toda la edificación (reparto ${g.prorrateo === "por_area" ? "por área" : g.prorrateo === "por_canon" ? "por canon" : "en partes iguales"})`
                    : `${g.direccion}${g.complemento ? `, ${g.complemento}` : ""}`}
                  {" · "}{new Date(g.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })}
                  {g.nota ? ` · ${g.nota}` : ""}
                </div>
              </div>
              <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(g.monto))}</div>
              {g.partes.length > 0 && (
                <details style={{ flexBasis: "100%" }}>
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
      )}
    </div>
  );
}
