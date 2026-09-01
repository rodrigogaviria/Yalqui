import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "../componentes/Campo";
import { pesos } from "../componentes/Dinero";

type TipoUnidad = Awaited<ReturnType<typeof api.admin.catalogos.tiposActivos.query>>[number];

/** El código del tipo, como lo espera `inmuebles.crear`. */
type CodigoTipo = Parameters<typeof api.inmuebles.crear.mutate>[0]["tipo"];

/**
 * El alta y la edición son el mismo formulario.
 *
 * Separarlos obligaría a mantener dos copias de veinte campos, y la que se use
 * menos se va quedando atrás: fue justamente no tener edición lo que dejó una
 * unidad sin descripción y sin manera de arreglarla.
 */
export function FormularioUnidad({
  inmuebleId, alGuardar, alCancelar,
}: {
  /** Sin id es un alta; con id se edita esa unidad. */
  inmuebleId?: number;
  alGuardar: (edicion: boolean) => void;
  alCancelar: () => void;
}) {
  const editando = inmuebleId !== undefined;
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(editando);
  const [error, setError] = useState<string | null>(null);

  // Los tipos salen del catálogo y no de una lista escrita acá: si estuvieran
  // escritos, anular un tipo desde la administración no tendría efecto alguno.
  const [tipos, setTipos] = useState<TipoUnidad[]>([]);
  const [tipo, setTipo] = useState<CodigoTipo>("apartamento");
  const [direccion, setDireccion] = useState("");
  const [complemento, setComplemento] = useState("");
  const [ciudad, setCiudad] = useState("Bogotá");
  const [departamento, setDepartamento] = useState("Cundinamarca");
  const [canonBase, setCanonBase] = useState("");
  const [valorAdministracion, setValorAdministracion] = useState("");
  const [administracionIncluida, setAdministracionIncluida] = useState(false);
  const [habitaciones, setHabitaciones] = useState("");
  const [banos, setBanos] = useState("");
  const [ocupantesBase, setOcupantesBase] = useState("1");
  const [ocupantesMaximo, setOcupantesMaximo] = useState("");
  const [mascotasMaximo, setMascotasMaximo] = useState("0");
  const [descripcion, setDescripcion] = useState("");

  // Al editar, los campos arrancan vacíos y se llenan con lo que hay guardado.
  // Los números llegan como texto porque los inputs trabajan con strings, y los
  // decimales de la base vienen como "1800000.00": Number() los normaliza para
  // que no aparezcan los ceros en el campo.
  useEffect(() => {
    if (inmuebleId === undefined) return;
    let vigente = true;
    void (async () => {
      try {
        const { unidad } = await api.inmuebles.ver.query({ inmuebleId });
        if (!vigente) return;
        const texto = (v: number | string | null) => (v === null ? "" : String(Number(v)));
        setTipo(unidad.tipo as CodigoTipo);
        setDireccion(unidad.direccion);
        setComplemento(unidad.complemento ?? "");
        setCiudad(unidad.ciudad);
        setDepartamento(unidad.departamento);
        setCanonBase(texto(unidad.canonBase));
        setValorAdministracion(texto(unidad.valorAdministracion));
        setAdministracionIncluida(unidad.administracionIncluida);
        setHabitaciones(texto(unidad.habitaciones));
        setBanos(texto(unidad.banos));
        setOcupantesBase(texto(unidad.ocupantesBase) || "1");
        setOcupantesMaximo(texto(unidad.ocupantesMaximo));
        setMascotasMaximo(texto(unidad.mascotasMaximo) || "0");
        setDescripcion(unidad.descripcion ?? "");
      } catch (e) {
        if (vigente) setError(mensajeDeError(e));
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    // Si la persona se va antes de que responda, no se escribe sobre un
    // formulario que ya no está en pantalla.
    return () => { vigente = false; };
  }, [inmuebleId]);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const lista = await api.admin.catalogos.tiposActivos.query();
        if (vigente) setTipos(lista);
      } catch (e) {
        if (vigente) setError(mensajeDeError(e));
      }
    })();
    return () => { vigente = false; };
  }, []);

  // Qué campos pide el formulario lo decide el tipo: a un parqueadero no tiene
  // sentido preguntarle cuántos baños tiene.
  const definicion = tipos.find((t) => t.codigo === tipo);
  const pideHabitaciones = definicion?.pideHabitaciones ?? true;
  const pideBanos = definicion?.pideBanos ?? true;
  const admiteMascotas = definicion?.admiteMascotas ?? true;

  const canon = Number(canonBase) || 0;
  const admin = Number(valorAdministracion) || 0;
  // Lo que el inquilino ve como total del mes. Si la administración va incluida
  // no se suma: ya está dentro del canon.
  const totalMes = canon + (administracionIncluida ? 0 : admin);

  const numero = (v: string) => (v.trim() === "" ? undefined : Number(v));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const datos = {
      tipo, direccion, ciudad, departamento,
      complemento: complemento.trim() || undefined,
      canonBase: canon,
      valorAdministracion: admin,
      administracionIncluida,
      habitaciones: numero(habitaciones),
      banos: numero(banos),
      ocupantesBase: Number(ocupantesBase) || 1,
      ocupantesMaximo: numero(ocupantesMaximo),
      mascotasMaximo: Number(mascotasMaximo) || 0,
      descripcion: descripcion.trim() || undefined,
    };

    try {
      // Se mandan todos los campos, no solo los que cambiaron: el formulario
      // muestra el estado completo, así que eso es exactamente lo que la
      // persona está confirmando al guardar.
      if (inmuebleId === undefined) await api.inmuebles.crear.mutate(datos);
      else await api.inmuebles.editar.mutate({ inmuebleId, cambios: datos });
      alGuardar(editando);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <p style={{ color: "var(--tinta-2)" }}>Cargando la unidad…</p>;
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <div>
        <h1 style={{ fontSize: 27, fontWeight: 600 }}>
          {editando ? "Editar la unidad" : "Registrar una unidad"}
        </h1>
        <p style={{ color: "var(--tinta-2)", margin: "6px 0 0", fontSize: 15 }}>
          {editando
            ? "Los cambios se guardan sobre la unidad, sin cambiarle el estado."
            : "Queda en borrador. La publicás cuando esté lista."}
        </p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>Qué es y dónde queda</h2>

        <Campo etiqueta="Tipo de unidad">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as CodigoTipo)}>
            {tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
          </select>
        </Campo>

        <Campo etiqueta="Dirección">
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)}
            placeholder="Calle 93 #12-40" required minLength={5} />
        </Campo>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Campo etiqueta="Apto / interior">
            <input value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="302" />
          </Campo>
          <Campo etiqueta="Ciudad">
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Departamento">
            <input value={departamento} onChange={(e) => setDepartamento(e.target.value)} required />
          </Campo>
        </div>
      </section>

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>Canon</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo etiqueta="Canon base" ayuda="Sin administración ni ajustes">
            <input type="number" min={0} step={1000} value={canonBase}
              onChange={(e) => setCanonBase(e.target.value)} placeholder="1800000" required />
          </Campo>
          <Campo etiqueta="Administración">
            <input type="number" min={0} step={1000} value={valorAdministracion}
              onChange={(e) => setValorAdministracion(e.target.value)} placeholder="320000" />
          </Campo>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5 }}>
          <input type="checkbox" checked={administracionIncluida}
            onChange={(e) => setAdministracionIncluida(e.target.checked)}
            style={{ width: 18, height: 18, flexShrink: 0 }} />
          La administración va incluida en el canon
        </label>

        {canon > 0 && (
          <div className="aviso bueno">
            El inquilino verá <strong className="num">{pesos(totalMes)}</strong> al mes
            {administracionIncluida && admin > 0 && ", con la administración adentro"}
            {!administracionIncluida && admin > 0 &&
              <>, desglosado en canon {pesos(canon)} más administración {pesos(admin)}</>}.
          </div>
        )}
      </section>

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>Capacidad</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>
          Es lo que permite que alguien busque «somos cuatro con dos perros» y encuentre tu unidad.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
          {pideHabitaciones && (
            <Campo etiqueta="Habitaciones">
              <input type="number" min={0} max={50} value={habitaciones}
                onChange={(e) => setHabitaciones(e.target.value)} />
            </Campo>
          )}
          {pideBanos && (
            <Campo etiqueta="Baños">
              <input type="number" min={0} max={50} value={banos} onChange={(e) => setBanos(e.target.value)} />
            </Campo>
          )}
          <Campo etiqueta="Personas incluidas">
            <input type="number" min={1} max={50} value={ocupantesBase}
              onChange={(e) => setOcupantesBase(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Personas máximo">
            <input type="number" min={1} max={50} value={ocupantesMaximo}
              onChange={(e) => setOcupantesMaximo(e.target.value)} />
          </Campo>
          {admiteMascotas && (
            <Campo etiqueta="Mascotas máximo" ayuda="0 es no admite">
              <input type="number" min={0} max={20} value={mascotasMaximo}
                onChange={(e) => setMascotasMaximo(e.target.value)} />
            </Campo>
          )}
        </div>
      </section>

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>Descripción</h2>
        <Campo etiqueta="Cómo es la unidad" ayuda="Sin esto no se puede publicar">
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Apartamento de 68 m² en Chapinero, dos habitaciones, piso 3. Cerca del parque de la 93." />
        </Campo>
      </section>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="boton" disabled={enviando}>
          {enviando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar en borrador"}
        </button>
        <button type="button" className="boton fantasma" onClick={alCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
