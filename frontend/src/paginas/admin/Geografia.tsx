import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { Tabla, Celda, Interruptor, Seccion } from "./piezas";

type Departamento = Awaited<ReturnType<typeof api.admin.geografia.departamentos.query>>[number];
type Ciudad = Awaited<ReturnType<typeof api.admin.geografia.ciudades.query>>[number];
type Barrio = Awaited<ReturnType<typeof api.admin.geografia.barrios.query>>[number];

export function Geografia({ avisar }: { avisar: (m: string) => void }) {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [deptoSel, setDeptoSel] = useState<number | null>(null);
  const [ciudadSel, setCiudadSel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nuevaCiudad, setNuevaCiudad] = useState("");
  const [daneCiudad, setDaneCiudad] = useState("");
  const [nuevoBarrio, setNuevoBarrio] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [estrato, setEstrato] = useState("");

  const cargarDeptos = useCallback(async () => {
    try {
      setDepartamentos(await api.admin.geografia.departamentos.query({ incluirInactivos: true }));
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  const cargarCiudades = useCallback(async (departamentoId: number) => {
    try {
      setCiudades(await api.admin.geografia.ciudades.query({ departamentoId, incluirInactivas: true }));
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  const cargarBarrios = useCallback(async (ciudadId: number) => {
    try {
      setBarrios(await api.admin.geografia.barrios.query({ ciudadId, incluirInactivos: true }));
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargarDeptos(); }, [cargarDeptos]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      avisar(mensaje);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  function elegirDepto(id: number) {
    setDeptoSel(id);
    setCiudadSel(null);
    setBarrios([]);
    void cargarCiudades(id);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <Seccion
        titulo="Departamentos"
        nota="Los 32 departamentos más Bogotá D.C., con su código DANE. Desactivar uno apaga también sus ciudades: dejarlas encendidas bajo un padre apagado las haría aparecer en un selector que ya no tiene cómo llegar a ellas."
      >
        <Tabla columnas={["DANE", "Departamento", "Ciudades", "Activo", ""]}>
          {departamentos.map((d) => (
            <tr key={d.id} style={{ background: deptoSel === d.id ? "var(--violeta-tenue)" : undefined }}>
              <Celda ancho={70}><span className="num">{d.codigoDane ?? "—"}</span></Celda>
              <Celda>{d.nombre}</Celda>
              <Celda ancho={90}>{deptoSel === d.id ? ciudades.length : ""}</Celda>
              <Celda ancho={70}>
                <Interruptor
                  activo={d.activo}
                  ocupado={ocupado}
                  onChange={(v) => void accion(async () => {
                    await api.admin.geografia.activar.mutate({ nivel: "departamento", id: d.id, activo: v });
                    await cargarDeptos();
                    if (deptoSel === d.id) await cargarCiudades(d.id);
                  }, v ? `${d.nombre} activado` : `${d.nombre} desactivado y sus ciudades con él`)}
                />
              </Celda>
              <Celda ancho={110}>
                <button className="boton fantasma" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                  onClick={() => elegirDepto(d.id)}>
                  Ver ciudades
                </button>
              </Celda>
            </tr>
          ))}
        </Tabla>
      </Seccion>

      {deptoSel !== null && (
        <Seccion
          titulo={`Ciudades de ${departamentos.find((d) => d.id === deptoSel)?.nombre ?? ""}`}
          nota="Vienen cargadas las capitales y los municipios donde hay mercado de arriendo, no los 1.100 del país. El resto se agrega acá cuando aparezca una unidad que lo necesite."
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 4 }}>
            <div style={{ flex: "1 1 220px" }}>
              <Campo etiqueta="Nueva ciudad">
                <input value={nuevaCiudad} onChange={(e) => setNuevaCiudad(e.target.value)} placeholder="Sabaneta" />
              </Campo>
            </div>
            <div style={{ width: 140 }}>
              <Campo etiqueta="Código DANE" ayuda="Cinco dígitos">
                <input value={daneCiudad} onChange={(e) => setDaneCiudad(e.target.value)} placeholder="05631" />
              </Campo>
            </div>
            <button className="boton" style={{ height: 42 }} disabled={ocupado || nuevaCiudad.trim().length < 2}
              onClick={() => void accion(async () => {
                await api.admin.geografia.crearCiudad.mutate({
                  departamentoId: deptoSel,
                  nombre: nuevaCiudad.trim(),
                  ...(daneCiudad.trim() === "" ? {} : { codigoDane: daneCiudad.trim() }),
                });
                setNuevaCiudad(""); setDaneCiudad("");
                await cargarCiudades(deptoSel);
              }, "Ciudad agregada")}>
              Agregar
            </button>
          </div>

          <Tabla columnas={["DANE", "Ciudad", "Capital", "Activa", ""]}>
            {ciudades.map((c) => (
              <tr key={c.id} style={{ background: ciudadSel === c.id ? "var(--violeta-tenue)" : undefined }}>
                <Celda ancho={70}><span className="num">{c.codigoDane ?? "—"}</span></Celda>
                <Celda>{c.nombre}</Celda>
                <Celda ancho={80}>{c.esCapital ? "Sí" : ""}</Celda>
                <Celda ancho={70}>
                  <Interruptor
                    activo={c.activo}
                    ocupado={ocupado}
                    onChange={(v) => void accion(async () => {
                      await api.admin.geografia.activar.mutate({ nivel: "ciudad", id: c.id, activo: v });
                      await cargarCiudades(deptoSel);
                    }, v ? `${c.nombre} activada` : `${c.nombre} desactivada`)}
                  />
                </Celda>
                <Celda ancho={110}>
                  <button className="boton fantasma" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                    onClick={() => { setCiudadSel(c.id); void cargarBarrios(c.id); }}>
                    Ver barrios
                  </button>
                </Celda>
              </tr>
            ))}
          </Tabla>
        </Seccion>
      )}

      {ciudadSel !== null && (
        <Seccion
          titulo={`Barrios de ${ciudades.find((c) => c.id === ciudadSel)?.nombre ?? ""}`}
          nota="No vienen cargados: no existe un listado oficial de barrios comparable al DANE de municipios, así que se arman desde acá con lo que el mercado use de verdad."
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 4 }}>
            <div style={{ flex: "1 1 200px" }}>
              <Campo etiqueta="Nuevo barrio">
                <input value={nuevoBarrio} onChange={(e) => setNuevoBarrio(e.target.value)} placeholder="Chapinero Alto" />
              </Campo>
            </div>
            <div style={{ flex: "0 1 180px" }}>
              <Campo etiqueta="Localidad o comuna">
                <input value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Chapinero" />
              </Campo>
            </div>
            <div style={{ width: 100 }}>
              <Campo etiqueta="Estrato">
                <input type="number" min={1} max={6} value={estrato} onChange={(e) => setEstrato(e.target.value)} />
              </Campo>
            </div>
            <button className="boton" style={{ height: 42 }} disabled={ocupado || nuevoBarrio.trim().length < 2}
              onClick={() => void accion(async () => {
                await api.admin.geografia.crearBarrio.mutate({
                  ciudadId: ciudadSel,
                  nombre: nuevoBarrio.trim(),
                  ...(localidad.trim() === "" ? {} : { localidad: localidad.trim() }),
                  ...(estrato.trim() === "" ? {} : { estrato: Number(estrato) }),
                });
                setNuevoBarrio(""); setLocalidad(""); setEstrato("");
                await cargarBarrios(ciudadSel);
              }, "Barrio agregado")}>
              Agregar
            </button>
          </div>

          {barrios.length === 0 ? (
            <p style={{ color: "var(--tinta-3)", fontSize: 14, padding: "4px 0 14px" }}>
              Todavía no hay barrios cargados para esta ciudad.
            </p>
          ) : (
            <Tabla columnas={["Barrio", "Localidad", "Estrato", "Activo"]}>
              {barrios.map((b) => (
                <tr key={b.id}>
                  <Celda>{b.nombre}</Celda>
                  <Celda>{b.localidad ?? "—"}</Celda>
                  <Celda ancho={80}>{b.estrato ?? "—"}</Celda>
                  <Celda ancho={70}>
                    <Interruptor
                      activo={b.activo}
                      ocupado={ocupado}
                      onChange={(v) => void accion(async () => {
                        await api.admin.geografia.activar.mutate({ nivel: "barrio", id: b.id, activo: v });
                        await cargarBarrios(ciudadSel);
                      }, v ? "Barrio activado" : "Barrio desactivado")}
                    />
                  </Celda>
                </tr>
              ))}
            </Tabla>
          )}
        </Seccion>
      )}
    </div>
  );
}
