import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Vacio } from "./comun";

/**
 * Quién vive o vivió en una unidad.
 *
 * Sale de los contratos y no de un campo en la unidad: el inquilino es una
 * relación con fechas, no un atributo. Los anteriores se conservan porque saber
 * quién vivió antes importa para una referencia o un reclamo.
 */
export function VerInquilinos({ inmuebleId, direccion, alVolver, alGenerarContrato }: {
  inmuebleId: number;
  direccion: string;
  alVolver: () => void;
  alGenerarContrato: (aplicacionId: number) => void;
}) {
  const { datos, error } = usePantalla(() => api.inmuebles.inquilinos.query({ inmuebleId }));

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const vacio =
    datos.actuales.length === 0 && datos.designados.length === 0 && datos.anteriores.length === 0;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <button className="boton fantasma"
          style={{ height: 34, fontSize: 13.5, padding: "0 12px", marginBottom: 12 }}
          onClick={alVolver}>
          ← Volver al portafolio
        </button>
        <Encabezado titulo="Inquilinos" nota={direccion} />
      </div>

      {vacio && (
        <Vacio titulo="Nadie ha vivido acá todavía">
          Cuando marques la unidad como alquilada o firmes un contrato, la persona
          aparece en esta lista.
        </Vacio>
      )}

      {datos.designados.length > 0 && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Designado, sin contrato</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
              Ya lo elegiste, pero todavía no hay contrato firmado. Hasta que lo haya,
              esta persona no tiene el rol de inquilino ni ve nada del sistema.
            </p>
          </div>

          {datos.designados.map((d) => (
            <Ficha
              key={d.usuarioId}
              nombre={`${d.nombre} ${d.apellido}`}
              email={d.email}
              telefono={d.telefono}
              sinActivar={d.sinActivar}
              lineas={[
                `Canon acordado ${pesos(Number(d.canonOfrecido))}`,
                ...(d.codeudor
                  ? [`Codeudor: ${d.codeudor.nombre}${d.codeudor.numeroDocumento ? ` · ${d.codeudor.numeroDocumento}` : ""}${d.codeudor.email ? ` · ${d.codeudor.email}` : ""}`]
                  : ["Sin codeudor"]),
              ]}
              accion={
                <button className="boton" style={{ height: 36, fontSize: 13.5 }}
                  onClick={() => alGenerarContrato(d.aplicacionId)}>
                  Generar contrato
                </button>
              }
            />
          ))}
        </section>
      )}

      {datos.actuales.length > 0 && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Vive acá ahora</h2>
          {datos.actuales.map((a) => (
            <Ficha
              key={a.contratoId}
              nombre={`${a.nombre} ${a.apellido}`}
              email={a.email}
              telefono={a.telefono}
              sinActivar={a.sinActivar}
              lineas={[
                `${a.tipoDocumento} ${a.numeroDocumento}`,
                `Contrato ${a.numero} · ${pesos(Number(a.canonMensual))} al mes`,
                `Desde ${new Date(a.fechaInicio).toLocaleDateString("es-CO")} hasta ${new Date(a.fechaFin).toLocaleDateString("es-CO")}`,
              ]}
              etiqueta={a.estadoContrato === "en_mora" ? { texto: "En mora", clase: "mora" } : undefined}
            />
          ))}
        </section>
      )}

      {datos.anteriores.length > 0 && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Vivieron antes</h2>
          {datos.anteriores.map((a) => (
            <Ficha
              key={a.contratoId}
              nombre={`${a.nombre} ${a.apellido}`}
              email={a.email}
              telefono={a.telefono}
              sinActivar={false}
              tenue
              lineas={[
                `Contrato ${a.numero} · ${pesos(Number(a.canonMensual))} al mes`,
                `${new Date(a.fechaInicio).toLocaleDateString("es-CO")} — ${new Date(a.fechaFin).toLocaleDateString("es-CO")}`,
              ]}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function Ficha({ nombre, email, telefono, lineas, sinActivar, tenue = false, etiqueta, accion }: {
  nombre: string;
  email: string;
  telefono: string | null;
  lineas: string[];
  sinActivar: boolean;
  tenue?: boolean;
  etiqueta?: { texto: string; clase: string };
  accion?: import("react").ReactNode;
}) {
  return (
    <div style={{
      padding: "13px 15px", borderRadius: 10, border: "1px solid var(--linea)",
      display: "grid", gap: 5, opacity: tenue ? 0.65 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{nombre}</span>
        {etiqueta && <span className={`pastilla ${etiqueta.clase}`}>{etiqueta.texto}</span>}
        {sinActivar && (
          <span className="pastilla pausado" title="La cuenta existe pero su dueño nunca entró">
            Sin activar
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "var(--tinta-2)" }}>
        <a href={`mailto:${email}`}>{email}</a>
        {telefono && <> · <a href={`tel:${telefono}`}>{telefono}</a></>}
      </div>

      {lineas.map((l, i) => (
        <div key={i} style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>{l}</div>
      ))}

      {accion && <div style={{ marginTop: 4 }}>{accion}</div>}
    </div>
  );
}
