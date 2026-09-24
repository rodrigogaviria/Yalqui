import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { SubirPago } from "../../componentes/SubirPago";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "../propietario/comun";
import { estadoDelMes, fechaPrevista, nombreUnidad } from "./comun";

/** Lo primero que ve quien arrienda: su unidad, cuánto y cuándo paga, y cómo va el mes. */
export function Inicio({ alIr }: { alIr: (clave: string) => void }) {
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const { datos, error, aviso, cargar, setAviso } =
    usePantalla(() => api.inquilino.miUnidad.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  if (datos.length === 0) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <Encabezado titulo="Inicio" />
        <Vacio titulo="Todavía no arrendás ninguna unidad">
          Cuando tu arrendador te registre en su unidad, acá vas a ver tu canon,
          tu día de pago y todo lo que necesitás.
        </Vacio>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <Encabezado titulo="Inicio" nota="Tu unidad y cómo va tu pago de este mes." />
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {datos.map((u) => {
        const mes = estadoDelMes(u);
        const prevista = fechaPrevista(u);
        return (
          <section key={u.id} className="tarjeta" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ background: "var(--violeta)", color: "#fff", padding: "14px 18px" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{nombreUnidad(u)}</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.82)", marginTop: 2 }}>
                {u.ciudad} · Arrendador: {u.propietarioNombre} {u.propietarioApellido}
                {u.propietarioTelefono ? ` · ${u.propietarioTelefono}` : ""}
              </div>
            </div>
            <div style={{ padding: "18px", display: "grid", gap: 16 }}>
              <Cifras>
                <Cifra titulo="Canon mensual" valor={pesos(u.canon)} />
                <Cifra titulo="Día de pago" valor={`${u.diaPago} de cada mes`} />
                <Cifra titulo="Días de gracia" valor={String(u.diasGracia)} />
                <Cifra titulo="Este mes" valor={mes.texto} tono={mes.tono} />
              </Cifras>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>
                {mes.clave === "pagado"
                  ? "Tu pago de este mes está confirmado."
                  : mes.clave === "revision"
                    ? "Subiste tu pago: tu arrendador lo está revisando."
                    : `Tu pago vence el ${prevista.toLocaleDateString("es-CO")}${u.diasGracia > 0 ? ` y tenés ${u.diasGracia} días de gracia` : ""}.`}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {mes.clave !== "pagado" && (
                  <button className="boton" onClick={() => setSubiendo(u.id)}>Subir mi pago</button>
                )}
                <button className="boton fantasma" onClick={() => alIr("reportar")}>Reportar algo</button>
                <button className="boton fantasma" onClick={() => alIr("mi-contrato")}>Mi contrato</button>
              </div>
            </div>
          </section>
        );
      })}

      {subiendo !== null && (
        <Ventana titulo="Subir mi pago" alCerrar={() => setSubiendo(null)}>
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
