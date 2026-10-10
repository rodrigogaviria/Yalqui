import { useState } from "react";
import { api } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";
import { etiqueta, opciones } from "../../lib/etiquetas";

type Perfil = Awaited<ReturnType<typeof api.vecinos.miPerfil.query>>;
type Vecino = Awaited<ReturnType<typeof api.vecinos.misVecinos.query>>[number];
type Accion = (clave: number | string, fn: () => Promise<unknown>, mensaje: string) => Promise<void>;

const ALCANCE: Record<string, string> = {
  edificacion: "Mi Edificación",
  sector: "Mi Sector",
  yalqui: "Comunidad Yalqui",
};

/** Compartir algunos datos con la comunidad, y ver quién más eligió compartir los suyos. */
export function Vecinos() {
  const [viendo, setViendo] = useState<Vecino | null>(null);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [perfil, vecinos] = await Promise.all([
      api.vecinos.miPerfil.query(),
      api.vecinos.misVecinos.query(),
    ]);
    return { perfil, vecinos };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <Encabezado
        titulo="Vecinos que Ayudan"
        nota="Compartí algunos de tus datos con tu comunidad, y conocé a quienes también eligieron compartir los suyos."
      />
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <FormularioPerfil perfil={datos.perfil} accion={accion} ocupado={ocupado} />

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 10px" }}>Mis Vecinos</h2>
        {datos.vecinos.length === 0 ? (
          <Vacio titulo="Todavía no hay vecinos para mostrar">
            Cuando alguien de tu alcance elija compartir sus datos, aparece acá.
          </Vacio>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {datos.vecinos.map((v) => (
              <button key={v.id} type="button" onClick={() => setViendo(v)} className="tarjeta" style={{
                padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                textAlign: "left", border: "1px solid var(--linea)", cursor: "pointer", width: "100%",
              }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.nombre} {v.apellido}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {v.profesion ?? "Sin profesión registrada"}
                  </div>
                </div>
                <div style={{ fontSize: 13.5, color: "var(--tinta-2)" }}>{v.celular ?? "Sin celular"}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {viendo && (
        <Ventana titulo={`${viendo.nombre} ${viendo.apellido}`} alCerrar={() => setViendo(null)}>
          <DetalleVecino vecino={viendo} />
        </Ventana>
      )}
    </div>
  );
}

function DetalleVecino({ vecino }: { vecino: Vecino }) {
  return (
    <dl style={{ display: "grid", gap: 14, margin: 0 }}>
      <Dato t="Género" v={etiqueta("genero", vecino.genero)} />
      <Dato t="Profesión" v={vecino.profesion ?? "—"} />
      <Dato t="Celular" v={vecino.celular ?? "—"} />
      <Dato t="Hobbies" v={vecino.hobbies.length > 0 ? vecino.hobbies.join(", ") : "—"} />
      {vecino.emprendimientoNombre && (
        <Dato t="Emprendimiento" v={`${vecino.emprendimientoNombre}${vecino.emprendimientoDescripcion ? ` — ${vecino.emprendimientoDescripcion}` : ""}`} />
      )}
    </dl>
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

function FormularioPerfil({ perfil, accion, ocupado }: {
  perfil: Perfil; accion: Accion; ocupado: number | string | null;
}) {
  const [compartir, setCompartir] = useState(perfil.compartir);
  const [alcance, setAlcance] = useState<"edificacion" | "sector" | "yalqui">(perfil.alcance);
  const [genero, setGenero] = useState(perfil.genero ?? "");
  const [profesion, setProfesion] = useState(perfil.profesion ?? "");
  const [celular, setCelular] = useState(perfil.celular ?? "");
  const [hobbies, setHobbies] = useState(perfil.hobbies.join(", "));
  const [emprendimientoNombre, setEmprendimientoNombre] = useState(perfil.emprendimientoNombre ?? "");
  const [emprendimientoDescripcion, setEmprendimientoDescripcion] = useState(perfil.emprendimientoDescripcion ?? "");

  async function guardar() {
    await accion("perfil", () => api.vecinos.actualizarPerfil.mutate({
      compartir,
      alcance,
      genero: genero === "" ? null : genero as typeof perfil.genero & string,
      profesion: profesion.trim() === "" ? null : profesion.trim(),
      celular: celular.trim() === "" ? null : celular.trim(),
      hobbies: hobbies.split(",").map((h) => h.trim()).filter((h) => h.length > 0).slice(0, 8),
      emprendimientoNombre: emprendimientoNombre.trim() === "" ? null : emprendimientoNombre.trim(),
      emprendimientoDescripcion: emprendimientoDescripcion.trim() === "" ? null : emprendimientoDescripcion.trim(),
    }), "Preferencias guardadas.");
  }

  return (
    <section className="tarjeta" style={{ padding: "20px", display: "grid", gap: 14 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={compartir} onChange={(e) => setCompartir(e.target.checked)}
          style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
        <span>
          ¿Deseas compartir algunos de tus datos con tu comunidad de vecinos?
          <span style={{ color: "var(--tinta-2)" }}> (nombre, género, profesión, hobbies, celular…)</span>
        </span>
      </label>

      {compartir && (
        <div style={{ display: "grid", gap: 14, paddingLeft: 28 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Visible para</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {Object.entries(ALCANCE).map(([clave, texto]) => (
                <label key={clave} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
                  <input type="radio" name="alcance" value={clave} checked={alcance === clave}
                    onChange={() => setAlcance(clave as typeof alcance)} />
                  {texto}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Campo etiqueta="Género">
              <select value={genero} onChange={(e) => setGenero(e.target.value)}>
                <option value="">Prefiero no decir</option>
                {opciones("genero").map(([cod, txt]) => <option key={cod} value={cod}>{txt}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Profesión">
              <input value={profesion} onChange={(e) => setProfesion(e.target.value)} placeholder="Diseñadora gráfica" />
            </Campo>
            <Campo etiqueta="Celular">
              <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="300 123 4567" />
            </Campo>
          </div>

          <Campo etiqueta="Hobbies" ayuda="Separados por coma">
            <input value={hobbies} onChange={(e) => setHobbies(e.target.value)} placeholder="Correr, Fotografía, Cocina" />
          </Campo>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Campo etiqueta="Promocionar mi emprendimiento" ayuda="Opcional · nombre">
              <input value={emprendimientoNombre} onChange={(e) => setEmprendimientoNombre(e.target.value)} placeholder="Panadería Doña Luz" />
            </Campo>
            <Campo etiqueta="Productos o servicios" ayuda="Opcional">
              <input value={emprendimientoDescripcion} onChange={(e) => setEmprendimientoDescripcion(e.target.value)} placeholder="Tortas y pan por encargo" />
            </Campo>
          </div>
        </div>
      )}

      <div>
        <button className="boton" disabled={ocupado === "perfil"} onClick={() => void guardar()}>
          {ocupado === "perfil" ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}
