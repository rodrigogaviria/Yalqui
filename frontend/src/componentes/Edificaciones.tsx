import { useEffect, useState, useCallback } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "./Campo";
import { Ventana } from "./Ventana";
import { AreasYReservas } from "./AreasYReservas";
import { MemoriasUnidad } from "./MemoriasUnidad";

type Edificacion = Awaited<ReturnType<typeof api.inmuebles.misEdificaciones.query>>[number];
type UnidadBasica = { id: number; direccion: string; complemento: string | null; edificacionId: number | null };
type Plantilla = Awaited<ReturnType<typeof api.inmuebles.plantillasDisponibles.query>>[number];

const nombre = (u: { direccion: string; complemento: string | null }) =>
  `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`;

/**
 * Las edificaciones del propietario y qué unidades hay en cada una.
 *
 * Una edificación agrupa unidades del mismo edificio o casa: a ella se dirige
 * un aviso para todos sus habitantes y cuelgan las zonas comunes. Se crea
 * acá y se le asignan las unidades de a varias, para pasar un edificio entero
 * de una vez.
 */
export function Edificaciones({ unidades, alCambiar }: {
  unidades: UnidadBasica[]; alCambiar: () => void;
}) {
  const [lista, setLista] = useState<Edificacion[] | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Edificacion | null>(null);
  const [asignando, setAsignando] = useState<Edificacion | null>(null);
  const [areas, setAreas] = useState<Edificacion | null>(null);
  const [memorias, setMemorias] = useState<Edificacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setLista(await api.inmuebles.misEdificaciones.query()); } catch { setLista([]); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { void api.inmuebles.plantillasDisponibles.query().then(setPlantillas).catch(() => setPlantillas([])); }, []);

  if (lista === null) return null;
  if (lista.length === 0 && !creando && unidades.length === 0) return null;

  return (
    <section className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0 }}>Edificaciones</h2>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--tinta-2)" }}>
            Agrupá tus unidades por edificio o casa.
          </p>
        </div>
        <button className="boton fantasma" style={{ height: 36, fontSize: 13.5 }} onClick={() => setCreando(true)}>
          + Crear edificación
        </button>
      </div>

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {lista.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>
          Todavía no tenés ninguna. Creá una, por ejemplo «Casa Belén», y asignale sus unidades.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {lista.map((e) => {
            const n = unidades.filter((u) => u.edificacionId === e.id).length;
            return (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "11px 14px", borderRadius: 10, border: "1px solid var(--linea)",
              }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{e.nombre}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {e.direccion} · {e.ciudad} · {n} {n === 1 ? "unidad" : "unidades"}
                  </div>
                </div>
                {n > 0 && (
                  <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                    onClick={() => setAreas(e)}>
                    Áreas y reservas
                  </button>
                )}
                <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                  onClick={() => setMemorias(e)}>
                  Memorias
                </button>
                <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                  onClick={() => setEditando(e)}>
                  Editar
                </button>
                <button className="boton" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                  onClick={() => setAsignando(e)}>
                  Asignar unidades
                </button>
              </div>
            );
          })}
        </div>
      )}

      {creando && (
        <Ventana titulo="Crear edificación" alCerrar={() => setCreando(false)}>
          <FormularioEdificacion
            direccionInicial={unidades[0]?.direccion ?? ""}
            plantillas={plantillas}
            alTerminar={(nombreNuevo) => {
              setCreando(false);
              setAviso(`«${nombreNuevo}» creada. Ahora asignale sus unidades.`);
              void cargar();
            }} />
        </Ventana>
      )}

      {editando && (
        <Ventana titulo={`Editar ${editando.nombre}`} alCerrar={() => setEditando(null)}>
          <FormularioEditarEdificacion
            edificacion={editando} plantillas={plantillas}
            alTerminar={() => {
              setEditando(null);
              setAviso(`«${editando.nombre}» actualizada.`);
              void cargar();
            }} />
        </Ventana>
      )}

      {areas && (
        <Ventana titulo={`Áreas comunes y reservas · ${areas.nombre}`} alCerrar={() => setAreas(null)}>
          {/* Cualquier unidad de la edificación sirve de llave: el servidor
              resuelve a las áreas de la edificación. */}
          <AreasYReservas inmuebleId={unidades.find((u) => u.edificacionId === areas.id)!.id} />
        </Ventana>
      )}

      {memorias && (
        <Ventana titulo={`Memorias · ${memorias.nombre}`} alCerrar={() => setMemorias(null)}>
          <MemoriasUnidad edificacionId={memorias.id} />
        </Ventana>
      )}

      {asignando && (
        <Ventana titulo={`Unidades de ${asignando.nombre}`} alCerrar={() => setAsignando(null)}>
          <AsignarUnidades edificacion={asignando} unidades={unidades}
            alTerminar={() => {
              setAviso(`Unidades de «${asignando.nombre}» actualizadas.`);
              setAsignando(null);
              void cargar();
              alCambiar();
            }} />
        </Ventana>
      )}
    </section>
  );
}

/** El selector de plantilla, compartido entre crear y editar. */
function SelectorPlantilla({ plantillas, value, onChange }: {
  plantillas: Plantilla[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <Campo etiqueta="Plantilla de contrato" ayuda="Con la que se generan los contratos de sus unidades. Sin elegir una, se usa la vigente del marco legal de cada unidad.">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">La vigente del marco legal</option>
        {plantillas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {p.marcoLegal.replace("_", " ")}{p.estado === "borrador" ? " (borrador)" : ""}
          </option>
        ))}
      </select>
    </Campo>
  );
}

function FormularioEdificacion({ direccionInicial, plantillas, alTerminar }: {
  direccionInicial: string; plantillas: Plantilla[]; alTerminar: (nombre: string) => void;
}) {
  const [nombreE, setNombreE] = useState("");
  const [direccion, setDireccion] = useState(direccionInicial);
  const [ciudad, setCiudad] = useState("");
  const [tipo, setTipo] = useState<"edificio" | "conjunto" | "casa_dividida" | "zona">("edificio");
  const [regimen, setRegimen] = useState<"copropiedad" | "propiedad_unica" | "informal">("propiedad_unica");
  const [plantillaId, setPlantillaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.inmuebles.crearEdificacion.mutate({
        nombre: nombreE, tipo, regimen, direccion, ciudad,
        ...(plantillaId ? { plantillaContratoId: Number(plantillaId) } : {}),
      });
      alTerminar(nombreE);
    } catch (err) { setError(mensajeDeError(err)); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <Campo etiqueta="Nombre"><input required value={nombreE} placeholder="Casa Belén" onChange={(e) => setNombreE(e.target.value)} /></Campo>
      <Campo etiqueta="Dirección"><input required minLength={5} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Campo>
      <Campo etiqueta="Ciudad"><input required value={ciudad} placeholder="Manizales" onChange={(e) => setCiudad(e.target.value)} /></Campo>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo etiqueta="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="edificio">Edificio</option>
            <option value="conjunto">Conjunto</option>
            <option value="casa_dividida">Casa dividida</option>
            <option value="zona">Zona</option>
          </select>
        </Campo>
        <Campo etiqueta="Régimen">
          <select value={regimen} onChange={(e) => setRegimen(e.target.value as typeof regimen)}>
            <option value="propiedad_unica">Propiedad única</option>
            <option value="copropiedad">Copropiedad</option>
            <option value="informal">Informal</option>
          </select>
        </Campo>
      </div>
      <SelectorPlantilla plantillas={plantillas} value={plantillaId} onChange={setPlantillaId} />
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div><button type="submit" className="boton" disabled={enviando}>{enviando ? "Creando…" : "Crear edificación"}</button></div>
    </form>
  );
}

function FormularioEditarEdificacion({ edificacion, plantillas, alTerminar }: {
  edificacion: Edificacion; plantillas: Plantilla[]; alTerminar: () => void;
}) {
  const [nombreE, setNombreE] = useState(edificacion.nombre);
  const [direccion, setDireccion] = useState(edificacion.direccion);
  const [barrio, setBarrio] = useState(edificacion.barrio ?? "");
  const [ciudad, setCiudad] = useState(edificacion.ciudad);
  const [areaComun, setAreaComun] = useState(edificacion.areaComunM2 !== null ? String(Number(edificacion.areaComunM2)) : "");
  const [adminNombre, setAdminNombre] = useState(edificacion.administracionNombre ?? "");
  const [adminTelefono, setAdminTelefono] = useState(edificacion.administracionTelefono ?? "");
  const [plantillaId, setPlantillaId] = useState(edificacion.plantillaContratoId !== null ? String(edificacion.plantillaContratoId) : "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.inmuebles.editarEdificacion.mutate({
        edificacionId: edificacion.id,
        nombre: nombreE.trim(), direccion: direccion.trim(), ciudad: ciudad.trim(),
        barrio: barrio.trim() || undefined,
        ...(areaComun.trim() ? { areaComunM2: Number(areaComun) } : {}),
        administracionNombre: adminNombre.trim() || undefined,
        administracionTelefono: adminTelefono.trim() || undefined,
        plantillaContratoId: plantillaId ? Number(plantillaId) : null,
      });
      alTerminar();
    } catch (err) { setError(mensajeDeError(err)); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <Campo etiqueta="Nombre"><input required value={nombreE} onChange={(e) => setNombreE(e.target.value)} /></Campo>
      <Campo etiqueta="Dirección"><input required minLength={5} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Campo>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo etiqueta="Barrio" ayuda="Opcional"><input value={barrio} onChange={(e) => setBarrio(e.target.value)} /></Campo>
        <Campo etiqueta="Ciudad"><input required value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Campo>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo etiqueta="Administración (nombre)" ayuda="Opcional">
          <input value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Administración (teléfono)" ayuda="Opcional">
          <input value={adminTelefono} onChange={(e) => setAdminTelefono(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Área común (m²)" ayuda="Opcional">
        <input type="number" min={0} step="any" value={areaComun} onChange={(e) => setAreaComun(e.target.value)} />
      </Campo>
      <SelectorPlantilla plantillas={plantillas} value={plantillaId} onChange={setPlantillaId} />
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div><button type="submit" className="boton" disabled={enviando}>{enviando ? "Guardando…" : "Guardar cambios"}</button></div>
    </form>
  );
}

function AsignarUnidades({ edificacion, unidades, alTerminar }: {
  edificacion: Edificacion; unidades: UnidadBasica[]; alTerminar: () => void;
}) {
  const [marcadas, setMarcadas] = useState<number[]>(
    unidades.filter((u) => u.edificacionId === edificacion.id).map((u) => u.id),
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eran = unidades.filter((u) => u.edificacionId === edificacion.id).map((u) => u.id);
  const salen = eran.filter((id) => !marcadas.includes(id));
  const entran = marcadas.filter((id) => !eran.includes(id));

  async function guardar() {
    setEnviando(true); setError(null);
    try {
      if (entran.length > 0) await api.inmuebles.asignarEdificacion.mutate({ inmuebleIds: entran, edificacionId: edificacion.id });
      if (salen.length > 0) await api.inmuebles.asignarEdificacion.mutate({ inmuebleIds: salen, edificacionId: null });
      alTerminar();
    } catch (err) { setError(mensajeDeError(err)); } finally { setEnviando(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{
        display: "grid", gap: 6, maxHeight: 320, overflowY: "auto",
        border: "1px solid var(--linea)", borderRadius: 10, padding: "10px 12px",
      }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" style={{ width: 17, height: 17 }}
            checked={marcadas.length === unidades.length && unidades.length > 0}
            ref={(el) => { if (el) el.indeterminate = marcadas.length > 0 && marcadas.length < unidades.length; }}
            onChange={(e) => setMarcadas(e.target.checked ? unidades.map((u) => u.id) : [])} />
          Marcar todas ({unidades.length})
        </label>
        {unidades.map((u) => (
          <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" style={{ width: 17, height: 17 }} checked={marcadas.includes(u.id)}
              onChange={(e) => setMarcadas((c) => e.target.checked ? [...c, u.id] : c.filter((x) => x !== u.id))} />
            {nombre(u)}
          </label>
        ))}
      </div>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button className="boton" disabled={enviando || (entran.length === 0 && salen.length === 0)} onClick={() => void guardar()}>
          {enviando ? "Guardando…" : `Guardar (${marcadas.length} unidades)`}
        </button>
      </div>
    </div>
  );
}
