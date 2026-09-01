import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Seccion } from "./piezas";
import { CatalogoEditable, type CampoCatalogo } from "./CatalogoEditable";

type Tipo = Awaited<ReturnType<typeof api.admin.catalogos.tipos.query>>[number];
type Parametro = Awaited<ReturnType<typeof api.admin.catalogos.parametros.query>>[number];
type Servicio = Awaited<ReturnType<typeof api.admin.catalogos.servicios.query>>[number];
type Plan = Awaited<ReturnType<typeof api.admin.catalogos.planes.query>>[number];

export function TiposDeInmuebles({ avisar }: { avisar: (m: string) => void }) {
  const [tipos, setTipos] = useState<Tipo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try { setTipos(await api.admin.catalogos.tipos.query()); setError(null); }
    catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setError(null);
    try { await fn(); avisar(mensaje); await cargar(); }
    catch (e) { setError(mensajeDeError(e)); }
    finally { setOcupado(false); }
  }

  const campos: CampoCatalogo[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 150 },
    { clave: "nombre", titulo: "Tipo", tipo: "texto" },
    { clave: "plural", titulo: "Plural", tipo: "texto", ancho: 150 },
    { clave: "marcoLegal", titulo: "Marco legal", tipo: "seleccion", diccionario: "marcoLegal", ancho: 220 },
    { clave: "pideHabitaciones", titulo: "Habitaciones", tipo: "booleano", ancho: 120 },
    { clave: "pideBanos", titulo: "Baños", tipo: "booleano", ancho: 90 },
    { clave: "pideArea", titulo: "Área", tipo: "booleano", ancho: 90 },
    { clave: "admiteMascotas", titulo: "Mascotas", tipo: "booleano", ancho: 100 },
  ];

  return (
    <Seccion
      titulo="Tipos de inmueble"
      nota="El marco legal decide qué reglas aplica el contrato: en vivienda urbana la Ley 820 prohíbe el depósito en dinero y limita el incremento al IPC. Las tres casillas del medio deciden qué campos pide el formulario de alta — a un parqueadero no tiene sentido preguntarle cuántos baños tiene."
    >
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div className="aviso ojo">
        Un tipo se renombra, se reordena y se anula desde acá, pero <strong>crear uno nuevo
        necesita una migración</strong>: el marco legal de algo que nadie modeló no lo puede
        resolver un formulario.
      </div>

      {tipos && (
        <CatalogoEditable
          filas={tipos}
          campos={campos}
          ocupado={ocupado}
          alGuardar={(id, cambios) => accion(
            () => api.admin.catalogos.editarTipo.mutate({ tipoId: id, ...cambios }),
            "Tipo actualizado",
          )}
          alAnular={(id, activo) => accion(
            () => api.admin.catalogos.activar.mutate({ catalogo: "tipo", id, activo }),
            activo ? "Tipo reactivado" : "Tipo anulado",
          )}
        />
      )}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------

/** Lo que Yalqui cobra: planes de suscripción y servicios a la carta. */
export function Comercial({ avisar }: { avisar: (m: string) => void }) {
  const [planes, setPlanes] = useState<Plan[] | null>(null);
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        api.admin.catalogos.planes.query(),
        api.admin.catalogos.servicios.query(),
      ]);
      setPlanes(p); setServicios(s); setError(null);
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setError(null);
    try { await fn(); avisar(mensaje); await cargar(); }
    catch (e) { setError(mensajeDeError(e)); }
    finally { setOcupado(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <Seccion
        titulo="Planes"
        nota="La suscripción se cobra por inmueble. En Básico, que es gratis, un propietario igual puede comprar servicios a la carta."
      >
        {planes && (
          <CatalogoEditable
            filas={planes}
            campos={[
              { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 150 },
              { clave: "nombre", titulo: "Plan", tipo: "texto" },
              { clave: "precioMes", titulo: "Precio al mes", tipo: "dinero", ancho: 170 },
              { clave: "cicloDefault", titulo: "Ciclo", tipo: "seleccion", diccionario: "ciclo", ancho: 130 },
            ]}
            ocupado={ocupado}
            alGuardar={(id, cambios) => accion(
              () => api.admin.catalogos.editarPlan.mutate({ planId: id, ...cambios }),
              "Plan actualizado",
            )}
            alAnular={(id, activo) => accion(
              () => api.admin.catalogos.activar.mutate({ catalogo: "plan", id, activo }),
              activo ? "Plan reactivado" : "Plan anulado",
            )}
          />
        )}
      </Seccion>

      <Seccion
        titulo="Servicios de Yalqui"
        nota="Se cobran por unidad y son independientes del plan. Nunca se mezclan con el canon: son dos flujos de dinero distintos, y el arriendo va directo del inquilino al propietario."
      >
        {servicios && (
          <CatalogoEditable
            filas={servicios}
            campos={[
              { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 180 },
              {
                clave: "nombre", titulo: "Servicio", tipo: "texto",
                detalle: (f) => (f["descripcion"] as string | null) ?? null,
              },
              { clave: "modeloCobro", titulo: "Cobro", tipo: "seleccion", diccionario: "modeloCobro", ancho: 140 },
              { clave: "precioBase", titulo: "Precio", tipo: "dinero", ancho: 160 },
            ]}
            ocupado={ocupado}
            alGuardar={(id, cambios) => accion(
              () => api.admin.catalogos.editarServicioYalqui.mutate({ servicioId: id, ...cambios }),
              "Servicio actualizado",
            )}
            alAnular={(id, activo) => accion(
              () => api.admin.catalogos.activar.mutate({ catalogo: "servicio", id, activo }),
              activo ? "Servicio reactivado" : "Servicio anulado",
            )}
          />
        )}
      </Seccion>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Parametros({ avisar }: { avisar: (m: string) => void }) {
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const p = await api.admin.catalogos.parametros.query();
      setParametros(p);
      setBorrador(Object.fromEntries(p.map((x) => [x.clave, x.valor])));
      setError(null);
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar(clave: string) {
    setGuardando(clave);
    setError(null);
    try {
      await api.admin.catalogos.guardarParametro.mutate({ clave, valor: borrador[clave] ?? "" });
      avisar("Parámetro guardado");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(null);
      // Se recarga siempre: dejar en pantalla un valor que el servidor rechazó
      // haría creer que quedó aplicado.
      await cargar();
    }
  }

  const categorias = [...new Set(parametros.map((p) => p.categoria))];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div className="aviso ojo">
        Las tasas tributarias vienen cargadas con los valores vigentes en Colombia, pero
        están <strong>pendientes de confirmar con un contador</strong> antes de emitir la primera factura.
      </div>

      {categorias.map((cat) => (
        <Seccion key={cat} titulo={etiquetaCategoria(cat)}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {parametros.filter((p) => p.categoria === cat).map((p) => {
                const cambiado = (borrador[p.clave] ?? "") !== p.valor;
                return (
                  <tr key={p.clave}>
                    <td style={CELDA}>
                      <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                      {p.descripcion && (
                        <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2, maxWidth: 460 }}>
                          {p.descripcion}
                        </div>
                      )}
                      <div className="num" style={{ fontSize: 11.5, color: "var(--tinta-3)", marginTop: 2 }}>
                        {p.clave}
                      </div>
                    </td>
                    <td style={{ ...CELDA, width: 190 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <input
                          aria-label={p.nombre}
                          value={borrador[p.clave] ?? ""}
                          disabled={!p.editable}
                          onChange={(e) => setBorrador((b) => ({ ...b, [p.clave]: e.target.value }))}
                          style={{ width: 120 }}
                        />
                        {p.unidad && <span style={{ fontSize: 13, color: "var(--tinta-2)" }}>{p.unidad}</span>}
                      </div>
                    </td>
                    <td style={{ ...CELDA, width: 200 }}>
                      {!p.editable ? (
                        <span style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>
                          De sistema: cambiarlo rompería supuestos del código.
                        </span>
                      ) : cambiado ? (
                        <button className="boton" style={{ height: 32, fontSize: 13, padding: "0 12px" }}
                          disabled={guardando === p.clave} onClick={() => void guardar(p.clave)}>
                          {guardando === p.clave ? "…" : "Guardar"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Seccion>
      ))}
    </div>
  );
}

const CELDA = { padding: "10px 12px", borderBottom: "1px solid var(--linea)" } as const;

function etiquetaCategoria(c: string): string {
  return { general: "General", tributario: "Tributario", cobranza: "Cobranza",
           precalificacion: "Precalificación", contrato: "Contrato" }[c] ?? c;
}
