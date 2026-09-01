import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

/**
 * Qué entra y qué sale de cada unidad.
 *
 * El neto es ingresos menos egresos, sin más: es caja, no contabilidad. No
 * descuenta impuestos ni amortizaciones, y decir «rentabilidad» de otra forma
 * exigiría datos que el sistema no tiene.
 */
export function Rentabilidad({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [registrando, setRegistrando] = useState(false);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [resumen, tipos] = await Promise.all([
      api.rentabilidad.resumen.query({}),
      api.rentabilidad.tipos.query(),
    ]);
    return { resumen, tipos };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { resumen, tipos } = datos;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Rentabilidad"
        nota="Ingresos menos egresos. Es caja, no contabilidad: no descuenta impuestos ni amortizaciones."
        accion={
          <button className="boton" onClick={() => setRegistrando((v) => !v)}>
            {registrando ? "Cancelar" : "Registrar movimiento"}
          </button>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {registrando && (
        <Formulario
          unidades={unidades}
          tipos={tipos}
          ocupado={ocupado === "nuevo"}
          alRegistrar={(entrada) => void accion("nuevo",
            () => api.rentabilidad.registrar.mutate(entrada),
            "Movimiento registrado.").then(() => setRegistrando(false))}
        />
      )}

      <Cifras>
        <Cifra titulo="Ingresos" valor={pesos(resumen.ingresos)} tono="bien" />
        <Cifra titulo="Egresos" valor={pesos(resumen.egresos)} tono="mal" />
        <Cifra titulo="Neto" valor={pesos(resumen.neto)}
          tono={resumen.neto >= 0 ? "bien" : "mal"} />
      </Cifras>

      {resumen.movimientos.length === 0 ? (
        <Vacio titulo="Todavía no hay movimientos">
          Los ingresos por canon van a aparecer solos cuando se verifiquen los pagos.
          Los gastos —administración, predial, reparaciones— se registran acá.
        </Vacio>
      ) : (
        <>
          <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 11 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Por unidad</h2>
            {resumen.porUnidad.map((u) => (
              <Barra key={u.clave} titulo={u.titulo} ingresos={u.ingresos} egresos={u.egresos} neto={u.neto} />
            ))}
          </section>

          <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 11 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Por concepto</h2>
            {resumen.porConcepto.map((c) => (
              <Barra key={c.clave} titulo={c.titulo} ingresos={c.ingresos} egresos={c.egresos} neto={c.neto} />
            ))}
          </section>

          <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Movimientos</h2>
            {resumen.movimientos.map((m) => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "9px 0", borderBottom: "1px solid var(--linea)", fontSize: 14,
              }}>
                <span className="num" style={{ width: 96, color: "var(--tinta-2)", fontSize: 13 }}>
                  {String(m.fecha)}
                </span>
                <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                  {m.concepto ?? "Sin clasificar"}
                  <span style={{ color: "var(--tinta-3)", fontSize: 12.5 }}> · {m.direccion}</span>
                </span>
                <span className="num" style={{
                  fontWeight: 600, color: m.tipo === "ingreso" ? "var(--bien)" : "var(--mal)",
                }}>
                  {m.tipo === "ingreso" ? "+" : "−"} {pesos(Number(m.monto))}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/** Una línea con las dos mitades a escala, para comparar de un vistazo. */
function Barra({ titulo, ingresos, egresos, neto }: {
  titulo: string; ingresos: number; egresos: number; neto: number;
}) {
  const total = Math.max(ingresos, egresos, 1);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo}
        </span>
        <span className="num" style={{ fontWeight: 600, color: neto >= 0 ? "var(--bien)" : "var(--mal)" }}>
          {pesos(neto)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 7 }}>
        <div style={{ width: `${(ingresos / total) * 50}%`, background: "var(--bien)", borderRadius: 3 }} />
        <div style={{ width: `${(egresos / total) * 50}%`, background: "var(--mal)", borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Formulario({ unidades, tipos, ocupado, alRegistrar }: {
  unidades: Array<{ id: number; titulo: string }>;
  tipos: Awaited<ReturnType<typeof api.rentabilidad.tipos.query>>;
  ocupado: boolean;
  alRegistrar: (e: { inmuebleId: number; tipoMovimientoId: number; monto: number; fecha: string; nota?: string }) => void;
}) {
  const [inmuebleId, setInmuebleId] = useState(String(unidades[0]?.id ?? ""));
  const [tipoId, setTipoId] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");

  if (unidades.length === 0) {
    return <div className="aviso ojo">Registrá una unidad antes de anotar movimientos.</div>;
  }

  const ingresos = tipos.filter((t) => t.tipo === "ingreso");
  const egresos = tipos.filter((t) => t.tipo === "egreso");

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Registrar un movimiento</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <Campo etiqueta="Unidad">
          <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Concepto" ayuda="El concepto decide si suma o resta">
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Elegí uno…</option>
            <optgroup label="Ingresos">
              {ingresos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </optgroup>
            <optgroup label="Egresos">
              {egresos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </optgroup>
          </select>
        </Campo>
        <Campo etiqueta="Monto">
          <input type="number" min={0} step={1000} value={monto}
            onChange={(e) => setMonto(e.target.value)} placeholder="320000" />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>

      <Campo etiqueta="Nota" ayuda="Opcional">
        <input value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>

      <div>
        <button className="boton"
          disabled={ocupado || tipoId === "" || Number(monto) <= 0}
          onClick={() => alRegistrar({
            inmuebleId: Number(inmuebleId),
            tipoMovimientoId: Number(tipoId),
            monto: Number(monto),
            fecha,
            ...(nota.trim() === "" ? {} : { nota: nota.trim() }),
          })}>
          {ocupado ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </section>
  );
}
