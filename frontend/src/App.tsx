import { useCallback, useEffect, useMemo, useState } from "react";
import { api, sesion } from "./lib/api";
import { perspectivasDe, type Perspectiva } from "./lib/menu";
import { Navegacion } from "./componentes/Navegacion";
import { Entrar } from "./paginas/Entrar";
import { Portafolio } from "./paginas/Portafolio";
import { FormularioUnidad } from "./paginas/FormularioUnidad";
import { ConfigurarUnidad } from "./paginas/ConfigurarUnidad";
import { Administracion } from "./paginas/Administracion";
import { Dashboard } from "./paginas/propietario/Dashboard";
import { Aplicaciones } from "./paginas/propietario/Aplicaciones";
import { Pagos } from "./paginas/propietario/Pagos";
import { Contratos } from "./paginas/propietario/Contratos";
import { Comunicados } from "./paginas/propietario/Comunicados";
import { Incidencias } from "./paginas/propietario/Incidencias";
import { Rentabilidad } from "./paginas/propietario/Rentabilidad";
import { Plan } from "./paginas/propietario/Plan";
import { Alquilar } from "./paginas/propietario/Alquilar";
import { GenerarContrato } from "./paginas/propietario/GenerarContrato";
import { VerInquilinos } from "./paginas/propietario/VerInquilinos";
import { Activar } from "./paginas/Activar";
import { EnConstruccion } from "./paginas/EnConstruccion";

type Sesion = Awaited<ReturnType<typeof api.auth.sesion.query>>;

/**
 * Dónde está parada la aplicación.
 *
 * Las vistas que abren desde el menú se identifican por su clave; las que se
 * abren desde dentro de otra pantalla llevan además el id de sobre qué actúan.
 */
type Vista =
  | { tipo: "menu"; clave: string; sub?: string }
  | { tipo: "nueva" }
  | { tipo: "editar"; inmuebleId: number }
  | { tipo: "configurar"; inmuebleId: number; direccion: string }
  | { tipo: "alquilar"; inmuebleId: number; direccion: string; canonBase: number }
  | { tipo: "contratar"; inmuebleId: number; aplicacionId: number; direccion: string }
  | { tipo: "inquilinos"; inmuebleId: number; direccion: string };

export default function App() {
  const [usuario, setUsuario] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>({ tipo: "menu", clave: "portafolio" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [rolActivo, setRolActivo] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  /** El token del enlace de activación, si se llegó por ahí. Se lee una sola
   *  vez al arrancar: después la URL vuelve a la raíz. */
  const [tokenActivacion, setTokenActivacion] = useState<string | null>(() =>
    window.location.pathname === "/activar"
      ? new URLSearchParams(window.location.search).get("t")
      : null,
  );
  /** Las unidades del propietario, para los selectores de las pantallas que
   *  crean algo sobre una unidad. Se piden una vez y no en cada pantalla. */
  const [unidades, setUnidades] = useState<Array<{ id: number; titulo: string; tipo: string }>>([]);

  const revisarSesion = useCallback(async () => {
    if (!sesion.token()) { setUsuario(null); setCargando(false); return; }
    try {
      setUsuario(await api.auth.sesion.query());
    } catch {
      sesion.borrar();
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void revisarSesion(); }, [revisarSesion]);

  useEffect(() => {
    if (usuario === null) { setUnidades([]); return; }
    let vigente = true;
    void (async () => {
      try {
        const r = await api.inmuebles.mias.query();
        if (vigente) {
          setUnidades(r.unidades.map((u) => ({
            id: u.id,
            titulo: `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`,
            tipo: u.tipo,
          })));
        }
      } catch {
        // Sin unidades los selectores quedan vacíos y cada pantalla lo explica;
        // no vale la pena romper toda la aplicación por esto.
      }
    })();
    return () => { vigente = false; };
  }, [usuario]);

  // Las perspectivas salen de los roles que devuelve el servidor. Es comodidad
  // de navegación, no seguridad: cada procedimiento vuelve a exigir su rol.
  const perspectivas = useMemo(
    () => perspectivasDe(usuario?.roles ?? []),
    [usuario],
  );

  const perspectiva: Perspectiva =
    perspectivas.find((p) => p.rol === rolActivo) ?? perspectivas[0]!;

  // Al cambiar de perspectiva la vista anterior puede no existir en la nueva:
  // «Portafolio» no está en el menú del inquilino. Se cae a la primera opción
  // que el rol sí tenga, en vez de dejar la pantalla en blanco.
  useEffect(() => {
    if (vista.tipo !== "menu") return;
    if (perspectiva.opciones.some((o) => o.clave === vista.clave)) return;
    const primera = perspectiva.opciones.find((o) => !o.pendiente) ?? perspectiva.opciones[0];
    if (primera) {
      const sub = primera.sub?.[0]?.clave;
      setVista({ tipo: "menu", clave: primera.clave, ...(sub === undefined ? {} : { sub }) });
    }
  }, [perspectiva, vista]);

  function salir() {
    sesion.borrar();
    setUsuario(null);
    setRolActivo(null);
    setVista({ tipo: "menu", clave: "portafolio" });
  }

  if (cargando) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--tinta-2)" }}>
        Cargando…
      </div>
    );
  }

  // La activación vive fuera de la sesión: quien llega con el enlace todavía no
  // puede entrar a ninguna parte, y su cuenta es justamente lo que viene a tomar.
  if (tokenActivacion !== null) {
    return (
      <Activar
        token={tokenActivacion}
        alEntrar={() => {
          window.history.replaceState({}, "", "/");
          setTokenActivacion(null);
          setCargando(true);
          void revisarSesion();
        }}
      />
    );
  }

  if (!usuario) {
    return <Entrar alEntrar={() => { setCargando(true); void revisarSesion(); }} />;
  }

  const opcionActual = vista.tipo === "menu"
    ? perspectiva.opciones.find((o) => o.clave === vista.clave)
    : undefined;

  return (
    <div style={{ display: "flex", minHeight: "100dvh" }}>
      <Navegacion
        perspectiva={perspectiva}
        perspectivas={perspectivas}
        vista={vista.tipo === "menu" ? vista.clave : ""}
        subVista={vista.tipo === "menu" ? vista.sub : undefined}
        email={usuario.email}
        alElegir={(clave, sub) => {
          setAviso(null);
          setVista({ tipo: "menu", clave, ...(sub === undefined ? {} : { sub }) });
        }}
        alCambiarPerspectiva={(rol) => { setAviso(null); setRolActivo(rol); }}
        alSalir={salir}
        abierto={menuAbierto}
        alCerrar={() => setMenuAbierto(false)}
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Solo aparece en pantalla angosta, donde el menú está fuera de vista. */}
        <header className="barra-movil" style={{
          display: "none", alignItems: "center", gap: 12, height: 56,
          padding: "0 16px", borderBottom: "1px solid var(--linea)", background: "var(--papel)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <button
            className="boton fantasma"
            style={{ height: 36, padding: "0 12px", fontSize: 18, lineHeight: 1 }}
            aria-label="Abrir el menú"
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto(true)}
          >
            ☰
          </button>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {opcionActual?.titulo ?? "Yalqui"}
          </span>
        </header>

        <main style={{ flex: 1, width: "100%", maxWidth: 1120, margin: "0 auto", padding: "26px 22px 60px" }}>
          {aviso && <div className="aviso bueno" role="status" style={{ marginBottom: 18 }}>{aviso}</div>}

          {vista.tipo === "menu" && vista.clave === "portafolio" && (
            <Portafolio
              alCrearUnidad={() => { setAviso(null); setVista({ tipo: "nueva" }); }}
              alEditarUnidad={(inmuebleId) => { setAviso(null); setVista({ tipo: "editar", inmuebleId }); }}
              alConfigurarUnidad={(inmuebleId, direccion) => {
                setAviso(null);
                setVista({ tipo: "configurar", inmuebleId, direccion });
              }}
              alAlquilar={(inmuebleId, direccion, canonBase) => {
                setAviso(null);
                setVista({ tipo: "alquilar", inmuebleId, direccion, canonBase });
              }}
              alVerInquilinos={(inmuebleId, direccion) => {
                setAviso(null);
                setVista({ tipo: "inquilinos", inmuebleId, direccion });
              }}
              alActuar={() => setAviso(null)}
            />
          )}

          {vista.tipo === "menu" && vista.clave === "dashboard" && (
            <Dashboard alIr={(clave) => setVista({ tipo: "menu", clave })} />
          )}
          {vista.tipo === "menu" && vista.clave === "aplicaciones" && <Aplicaciones />}
          {vista.tipo === "menu" && vista.clave === "pagos" && <Pagos />}
          {vista.tipo === "menu" && vista.clave === "contratos" && <Contratos />}
          {vista.tipo === "menu" && vista.clave === "comunicados" && <Comunicados unidades={unidades} />}
          {vista.tipo === "menu" && vista.clave === "incidencias" && <Incidencias unidades={unidades} />}
          {vista.tipo === "menu" && vista.clave === "rentabilidad" && <Rentabilidad unidades={unidades} />}
          {vista.tipo === "menu" && vista.clave === "plan" && <Plan />}

          {vista.tipo === "menu" && vista.clave === "admin" && (
            // Remonta al cambiar de sección: si no, un «Barrio agregado» se
            // quedaría en pantalla sobre la tabla de parámetros.
            <Administracion key={vista.sub ?? "geografia"} seccion={vista.sub ?? "geografia"} />
          )}

          {vista.tipo === "menu" && opcionActual?.pendiente && (
            <EnConstruccion opcion={opcionActual} perspectiva={perspectiva} />
          )}

          {vista.tipo === "inquilinos" && (
            <VerInquilinos
              key={vista.inmuebleId}
              inmuebleId={vista.inmuebleId}
              direccion={vista.direccion}
              alVolver={() => setVista({ tipo: "menu", clave: "portafolio" })}
              alGenerarContrato={(aplicacionId) => setVista({
                tipo: "contratar",
                inmuebleId: (vista as { inmuebleId: number }).inmuebleId,
                aplicacionId,
                direccion: (vista as { direccion: string }).direccion,
              })}
            />
          )}

          {vista.tipo === "alquilar" && (
            <Alquilar
              key={vista.inmuebleId}
              inmuebleId={vista.inmuebleId}
              direccion={vista.direccion}
              canonBase={vista.canonBase}
              alVolver={() => setVista({ tipo: "menu", clave: "portafolio" })}
              alContratar={(aplicacionId) => setVista({
                tipo: "contratar",
                inmuebleId: (vista as { inmuebleId: number }).inmuebleId,
                aplicacionId,
                direccion: (vista as { direccion: string }).direccion,
              })}
            />
          )}

          {vista.tipo === "contratar" && (
            <GenerarContrato
              key={vista.aplicacionId}
              inmuebleId={vista.inmuebleId}
              aplicacionId={vista.aplicacionId}
              direccion={vista.direccion}
              esVivienda={esVivienda(vista.inmuebleId, unidades)}
              alVolver={() => setVista({ tipo: "menu", clave: "contratos" })}
            />
          )}

          {vista.tipo === "configurar" && (
            <ConfigurarUnidad
              key={vista.inmuebleId}
              inmuebleId={vista.inmuebleId}
              direccion={vista.direccion}
              alVolver={() => setVista({ tipo: "menu", clave: "portafolio" })}
            />
          )}

          {(vista.tipo === "nueva" || vista.tipo === "editar") && (
            <FormularioUnidad
              key={vista.tipo === "editar" ? vista.inmuebleId : "nueva"}
              {...(vista.tipo === "editar" ? { inmuebleId: vista.inmuebleId } : {})}
              alGuardar={(edicion) => {
                setAviso(edicion ? "Cambios guardados." : "Unidad registrada. Quedó en borrador.");
                setVista({ tipo: "menu", clave: "portafolio" });
              }}
              alCancelar={() => setVista({ tipo: "menu", clave: "portafolio" })}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Si la unidad se rige por la Ley 820. Decide qué opciones ofrece el formulario
 * de contrato: en vivienda urbana el depósito está prohibido y el incremento
 * topado. El servidor lo vuelve a comprobar — esto solo evita ofrecer algo que
 * no se puede pactar.
 */
function esVivienda(inmuebleId: number, unidades: Array<{ id: number; tipo: string }>): boolean {
  const u = unidades.find((x) => x.id === inmuebleId);
  return u === undefined || u.tipo === "apartamento" || u.tipo === "casa";
}
