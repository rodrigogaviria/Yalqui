import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";
import { fechaCorta, nombreUnidad } from "./comun";

const ESTADO_CONTRATO: Record<string, string> = {
  borrador: "En preparación",
  pendiente_firma: "Pendiente de firma",
  vigente: "Vigente",
  en_mora: "Vigente, con mora",
  en_terminacion: "En terminación",
  terminado: "Terminado",
};

/** Las condiciones de lo que arrendás. Si todavía no hay contrato firmado, lo dice. */
export function MiContrato() {
  const { datos, error } = usePantalla(() => api.inquilino.miUnidad.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado titulo="Mi contrato" />
      {datos.length === 0 && <Vacio titulo="No tenés una unidad registrada" />}

      {datos.map((u) => (
        <section key={u.id} className="tarjeta" style={{ padding: "20px", display: "grid", gap: 14 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{nombreUnidad(u)}</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>{u.ciudad}</p>
          </div>

          {u.descripcion && <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-line" }}>{u.descripcion}</p>}

          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, margin: 0 }}>
            <Dato t="Canon mensual" v={pesos(u.contrato ? Number(u.contrato.canonMensual) : u.canon)} />
            <Dato t="Día de pago" v={`${u.diaPago} de cada mes`} />
            <Dato t="Días de gracia" v={String(u.diasGracia)} />
            <Dato t="Arrendador" v={`${u.propietarioNombre} ${u.propietarioApellido}`} />
            {u.contrato && (
              <>
                <Dato t="Contrato" v={u.contrato.numero} />
                <Dato t="Estado" v={ESTADO_CONTRATO[u.contrato.estado] ?? u.contrato.estado} />
                <Dato t="Desde" v={fechaCorta(u.contrato.fechaInicio)} />
                <Dato t="Hasta" v={fechaCorta(u.contrato.fechaFin)} />
              </>
            )}
          </dl>

          {!u.contrato && (
            <div className="aviso ojo">
              Todavía no hay un contrato firmado en Yalqui para esta unidad. Cuando tu
              arrendador lo genere, te llega el enlace para firmarlo y queda acá.
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>{t}</dt>
      <dd style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 600 }}>{v}</dd>
    </div>
  );
}
