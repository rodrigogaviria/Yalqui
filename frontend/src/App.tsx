import { useCallback, useEffect, useState } from "react";
import { api, sesion } from "./lib/api";
import { Marca } from "./componentes/Marca";
import { Entrar } from "./paginas/Entrar";
import { Portafolio } from "./paginas/Portafolio";
import { FormularioUnidad } from "./paginas/FormularioUnidad";
import { Administracion } from "./paginas/Administracion";
import { ConfigurarUnidad } from "./paginas/ConfigurarUnidad";

type Sesion = Awaited<ReturnType<typeof api.auth.sesion.query>>;
// La vista de edición carga el id, así que no alcanza con un nombre suelto.
type Vista =
  | { tipo: "portafolio" }
  | { tipo: "nueva" }
  | { tipo: "editar"; inmuebleId: number }
  | { tipo: "configurar"; inmuebleId: number; direccion: string }
  | { tipo: "admin" };

export default function App() {
  const [usuario, setUsuario] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>({ tipo: "portafolio" });
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Al arrancar se pregunta al servidor quién es el token guardado. Un token
   * vencido o de una cuenta suspendida se descarta acá y no más adelante,
   * cuando ya se está mostrando una pantalla que la persona no puede usar.
   */
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

  function salir() {
    sesion.borrar();
    setUsuario(null);
    setVista({ tipo: "portafolio" });
  }

  if (cargando) {
    return <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--tinta-2)" }}>Cargando…</div>;
  }

  if (!usuario) {
    return <Entrar alEntrar={() => { setCargando(true); void revisarSesion(); }} />;
  }

  // El botón de administración se muestra según el rol que devuelve el
  // servidor, pero eso es comodidad y no seguridad: cada procedimiento de
  // administración vuelve a exigir el rol por su cuenta.
  const esAdmin = usuario.roles.some((r) => r.rol === "admin_yalqui" && r.ambitoTipo === "global");

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{
        background: "var(--papel)", borderBottom: "1px solid var(--linea)",
        padding: "0 22px", height: 62, display: "flex", alignItems: "center", gap: 16,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <button onClick={() => { setAviso(null); setVista({ tipo: "portafolio" }); }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
          aria-label="Ir al portafolio">
          <Marca tamano={24} />
        </button>

        {esAdmin && (
          <button
            className="boton fantasma"
            style={{ height: 36, fontSize: 14, padding: "0 13px", marginLeft: 8 }}
            aria-current={vista.tipo === "admin" ? "page" : undefined}
            onClick={() => { setAviso(null); setVista({ tipo: "admin" }); }}
          >
            Administración
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--tinta-2)" }}>
          {usuario.email}
        </span>
        <button className="boton fantasma" style={{ height: 38, fontSize: 14, padding: "0 14px" }} onClick={salir}>
          Salir
        </button>
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: 1080, margin: "0 auto", padding: "26px 22px 60px" }}>
        {aviso && (
          <div className="aviso bueno" role="status" style={{ marginBottom: 18 }}>{aviso}</div>
        )}

        {vista.tipo === "portafolio" && (
          <Portafolio
            alCrearUnidad={() => { setAviso(null); setVista({ tipo: "nueva" }); }}
            alEditarUnidad={(inmuebleId) => { setAviso(null); setVista({ tipo: "editar", inmuebleId }); }}
            alConfigurarUnidad={(inmuebleId, direccion) => {
              setAviso(null);
              setVista({ tipo: "configurar", inmuebleId, direccion });
            }}
            alActuar={() => setAviso(null)}
          />
        )}

        {vista.tipo === "admin" && esAdmin && <Administracion />}

        {vista.tipo === "configurar" && (
          <ConfigurarUnidad
            key={vista.inmuebleId}
            inmuebleId={vista.inmuebleId}
            direccion={vista.direccion}
            alVolver={() => setVista({ tipo: "portafolio" })}
          />
        )}

        {(vista.tipo === "nueva" || vista.tipo === "editar") && (
          <FormularioUnidad
            // Remontar al cambiar de unidad: si no, el formulario conservaría
            // los valores de la anterior mientras llega la nueva.
            key={vista.tipo === "editar" ? vista.inmuebleId : "nueva"}
            {...(vista.tipo === "editar" ? { inmuebleId: vista.inmuebleId } : {})}
            alGuardar={(edicion) => {
              setAviso(edicion ? "Cambios guardados." : "Unidad registrada. Quedó en borrador.");
              setVista({ tipo: "portafolio" });
            }}
            alCancelar={() => setVista({ tipo: "portafolio" })}
          />
        )}
      </main>
    </div>
  );
}
