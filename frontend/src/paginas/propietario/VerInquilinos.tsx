import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
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
  const { datos, error, aviso, ocupado, accion } =
    usePantalla(() => api.inmuebles.inquilinos.query({ inmuebleId }));
  const [editando, setEditando] = useState<number | null>(null);

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

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

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
              usuarioId={d.usuarioId}
              nombre={d.nombre}
              apellido={d.apellido}
              email={d.email}
              telefono={d.telefono}
              sinActivar={d.sinActivar}
              editando={editando === d.usuarioId}
              alEditar={() => setEditando(d.usuarioId)}
              alCancelar={() => setEditando(null)}
              ocupado={ocupado === d.usuarioId}
              alGuardar={(campos) => accion(d.usuarioId,
                () => api.inmuebles.editarInquilino.mutate({ inmuebleId, usuarioId: d.usuarioId, ...campos }),
                "Datos actualizados",
              ).then(() => setEditando(null))}
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
              usuarioId={a.usuarioId}
              nombre={a.nombre}
              apellido={a.apellido}
              email={a.email}
              telefono={a.telefono}
              sinActivar={a.sinActivar}
              editando={editando === a.usuarioId}
              alEditar={() => setEditando(a.usuarioId)}
              alCancelar={() => setEditando(null)}
              ocupado={ocupado === a.usuarioId}
              alGuardar={(campos) => accion(a.usuarioId,
                () => api.inmuebles.editarInquilino.mutate({ inmuebleId, usuarioId: a.usuarioId, ...campos }),
                "Datos actualizados",
              ).then(() => setEditando(null))}
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
              nombre={a.nombre}
              apellido={a.apellido}
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

interface CamposInquilino {
  nombre?: string;
  apellido?: string;
  telefono?: string;
  email?: string;
}

function Ficha({
  usuarioId, nombre, apellido, email, telefono, lineas, sinActivar, tenue = false, etiqueta, accion,
  editando = false, alEditar, alCancelar, alGuardar, ocupado = false,
}: {
  usuarioId?: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  lineas: string[];
  sinActivar: boolean;
  tenue?: boolean;
  etiqueta?: { texto: string; clase: string };
  accion?: import("react").ReactNode;
  editando?: boolean;
  alEditar?: () => void;
  alCancelar?: () => void;
  alGuardar?: (campos: CamposInquilino) => void;
  ocupado?: boolean;
}) {
  const [bNombre, setBNombre] = useState(nombre);
  const [bApellido, setBApellido] = useState(apellido);
  const [bTelefono, setBTelefono] = useState(telefono ?? "");
  const [bEmail, setBEmail] = useState(email);

  // Se puede editar mientras la cuenta siga sin activar: una vez que la
  // persona entra y elige su contraseña, la identidad pasa a ser suya.
  const editable = sinActivar && usuarioId !== undefined && alGuardar !== undefined;

  if (editando) {
    return (
      <div style={{
        padding: "13px 15px", borderRadius: 10, border: "1px solid var(--violeta)",
        background: "var(--violeta-tenue)", display: "grid", gap: 10,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <Campo etiqueta="Nombre">
            <input value={bNombre} onChange={(e) => setBNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Apellido">
            <input value={bApellido} onChange={(e) => setBApellido(e.target.value)} />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input value={bTelefono} onChange={(e) => setBTelefono(e.target.value)} />
          </Campo>
          <Campo etiqueta="Correo">
            <input value={bEmail} onChange={(e) => setBEmail(e.target.value)} />
          </Campo>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="boton" style={{ height: 36, fontSize: 13.5 }}
            disabled={ocupado || bNombre.trim() === "" || bApellido.trim() === "" || !bEmail.includes("@")}
            onClick={() => alGuardar?.({
              ...(bNombre.trim() !== nombre ? { nombre: bNombre.trim() } : {}),
              ...(bApellido.trim() !== apellido ? { apellido: bApellido.trim() } : {}),
              ...(bTelefono.trim() !== (telefono ?? "") ? { telefono: bTelefono.trim() } : {}),
              ...(bEmail.trim() !== email ? { email: bEmail.trim() } : {}),
            })}>
            {ocupado ? "…" : "Guardar"}
          </button>
          <button className="boton fantasma" style={{ height: 36, fontSize: 13.5 }}
            disabled={ocupado} onClick={alCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "13px 15px", borderRadius: 10, border: "1px solid var(--linea)",
      display: "grid", gap: 5, opacity: tenue ? 0.65 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{nombre} {apellido}</span>
        {etiqueta && <span className={`pastilla ${etiqueta.clase}`}>{etiqueta.texto}</span>}
        {sinActivar && (
          <span className="pastilla pausado" title="La cuenta existe pero su dueño nunca entró">
            Sin activar
          </span>
        )}
        {editable && (
          <button className="boton fantasma" style={{ height: 28, fontSize: 12.5, padding: "0 10px" }}
            onClick={alEditar}>
            Editar
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, color: "var(--tinta-2)" }}>
        <a href={`mailto:${email}`}>{email}</a>
        {telefono && <> · <a href={`tel:${telefono}`}>{telefono}</a></>}
      </div>

      {lineas.map((l, i) => (
        <div key={i} style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>{l}</div>
      ))}

      {!sinActivar && usuarioId !== undefined && (
        <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>
          Ya activó su cuenta: sus datos ahora los administra desde la suya.
        </div>
      )}

      {accion && <div style={{ marginTop: 4 }}>{accion}</div>}
    </div>
  );
}
