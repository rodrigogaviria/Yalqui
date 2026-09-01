import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { Tabla, Celda, Seccion } from "./piezas";
import { etiqueta } from "../../lib/etiquetas";

type Listado = Awaited<ReturnType<typeof api.admin.usuarios.listar.query>>;
type Detalle = Awaited<ReturnType<typeof api.admin.usuarios.ver.query>>;

const ROLES = [
  ["admin_yalqui", "Administrador Yalqui"],
  ["administrador_inmueble", "Administrador de inmueble"],
  ["propietario", "Propietario"],
  ["socio_propietario", "Socio propietario"],
  ["inquilino", "Inquilino"],
  ["personal_propiedad", "Personal de la propiedad"],
  ["proveedor", "Proveedor"],
] as const;

const AMBITOS = [
  ["global", "Global"], ["inmueble", "Inmueble"],
  ["edificacion", "Edificación"], ["contrato", "Contrato"],
] as const;

type Rol = (typeof ROLES)[number][0];
type Ambito = (typeof AMBITOS)[number][0];

export function Usuarios({ avisar }: { avisar: (m: string) => void }) {
  const [listado, setListado] = useState<Listado | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [rol, setRol] = useState<Rol>("propietario");
  const [ambitoTipo, setAmbitoTipo] = useState<Ambito>("inmueble");
  const [ambitoId, setAmbitoId] = useState("");

  const cargar = useCallback(async (texto: string) => {
    try {
      setListado(await api.admin.usuarios.listar.query({
        pagina: 1,
        ...(texto.trim() === "" ? {} : { busqueda: texto.trim() }),
      }));
      setError(null);
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargar(""); }, [cargar]);

  const abrir = useCallback(async (usuarioId: number) => {
    setError(null);
    try {
      setDetalle(await api.admin.usuarios.ver.query({ usuarioId }));
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      avisar(mensaje);
      if (detalle) await abrir(detalle.usuario.id);
      await cargar(busqueda);
    } catch (e) { setError(mensajeDeError(e)); } finally { setOcupado(false); }
  }

  // El rol global solo existe para la administración de Yalqui; el resto no
  // significa nada sin decir sobre qué. La pantalla sigue esa misma regla para
  // que no se pueda armar una combinación que el servidor va a rechazar.
  const esAdminYalqui = rol === "admin_yalqui";
  const ambitoEfectivo: Ambito = esAdminYalqui ? "global" : ambitoTipo === "global" ? "inmueble" : ambitoTipo;
  const pideId = ambitoEfectivo !== "global";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <Seccion titulo="Usuarios" nota="Buscá por correo, nombre o documento.">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", paddingBottom: 4 }}>
          <div style={{ flex: "1 1 280px" }}>
            <Campo etiqueta="Buscar">
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void cargar(busqueda); }}
                placeholder="correo, nombre o documento" />
            </Campo>
          </div>
          <button className="boton fantasma" style={{ height: 42 }} onClick={() => void cargar(busqueda)}>
            Buscar
          </button>
        </div>

        {listado === null ? (
          <p style={{ color: "var(--tinta-2)", padding: "4px 0 14px" }}>Cargando…</p>
        ) : (
          <Tabla columnas={["Correo", "Nombre", "Documento", "Estado", "Roles", ""]}>
            {listado.usuarios.map((u) => (
              <tr key={u.id} style={{ background: detalle?.usuario.id === u.id ? "var(--violeta-tenue)" : undefined }}>
                <Celda>{u.email}</Celda>
                <Celda>{u.nombre} {u.apellido}</Celda>
                <Celda ancho={150}><span className="num">{u.tipoDocumento} {u.numeroDocumento}</span></Celda>
                <Celda ancho={110}>
                  <span className={`pastilla ${u.estado === "suspendido" ? "mora" : u.estado === "activo" ? "arrendado" : "borrador"}`}>
                    {etiqueta("estadoCuenta", u.estado)}
                  </span>
                </Celda>
                <Celda ancho={70} alinear="center"><span className="num">{u.roles}</span></Celda>
                <Celda ancho={90}>
                  <button className="boton fantasma" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                    onClick={() => void abrir(u.id)}>
                    Abrir
                  </button>
                </Celda>
              </tr>
            ))}
          </Tabla>
        )}
      </Seccion>

      {detalle && (
        <Seccion
          titulo={`${detalle.usuario.nombre} ${detalle.usuario.apellido}`}
          nota={detalle.usuario.email}
          accion={
            <button
              className={detalle.usuario.estado === "suspendido" ? "boton" : "boton riesgo"}
              style={{ height: 38, fontSize: 14 }}
              disabled={ocupado}
              onClick={() => void accion(
                () => api.admin.usuarios.cambiarEstado.mutate({
                  usuarioId: detalle.usuario.id,
                  estado: detalle.usuario.estado === "suspendido" ? "activo" : "suspendido",
                }),
                detalle.usuario.estado === "suspendido" ? "Cuenta reactivada" : "Cuenta suspendida",
              )}
            >
              {detalle.usuario.estado === "suspendido" ? "Reactivar cuenta" : "Suspender cuenta"}
            </button>
          }
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 6 }}>
            <div style={{ flex: "1 1 220px" }}>
              <Campo etiqueta="Rol">
                <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                  {ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
            </div>
            <div style={{ flex: "0 1 180px" }}>
              <Campo etiqueta="Ámbito" ayuda={esAdminYalqui ? "La administración es siempre global" : undefined}>
                <select value={ambitoEfectivo} disabled={esAdminYalqui}
                  onChange={(e) => setAmbitoTipo(e.target.value as Ambito)}>
                  {AMBITOS.filter(([v]) => esAdminYalqui ? v === "global" : v !== "global")
                    .map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
            </div>
            {pideId && (
              <div style={{ width: 130 }}>
                <Campo etiqueta={`Id de ${etiqueta("ambitoRol", ambitoEfectivo).toLowerCase()}`}>
                  <input type="number" min={1} value={ambitoId} onChange={(e) => setAmbitoId(e.target.value)} />
                </Campo>
              </div>
            )}
            <button className="boton" style={{ height: 42 }}
              disabled={ocupado || (pideId && ambitoId.trim() === "")}
              onClick={() => void accion(
                () => api.admin.usuarios.otorgarRol.mutate({
                  usuarioId: detalle.usuario.id,
                  rol,
                  ambitoTipo: ambitoEfectivo,
                  ambitoId: pideId ? Number(ambitoId) : 0,
                }),
                "Rol otorgado",
              )}>
              Otorgar rol
            </button>
          </div>

          <Tabla columnas={["Rol", "Ámbito", "Otorgado", "Estado", ""]}>
            {detalle.roles.map((r) => (
              <tr key={r.id} style={{ opacity: r.revocadoAt !== null ? 0.5 : 1 }}>
                <Celda>{etiqueta("rol", r.rol)}</Celda>
                <Celda ancho={190}>
                  {r.ambitoTipo === "global"
                    ? "Global"
                    : `${etiqueta("ambitoRol", r.ambitoTipo)} #${r.ambitoId}`}
                </Celda>
                <Celda ancho={130}>{new Date(r.otorgadoAt).toLocaleDateString("es-CO")}</Celda>
                <Celda ancho={110}>{r.revocadoAt === null ? "Vigente" : "Revocado"}</Celda>
                <Celda ancho={100}>
                  {r.revocadoAt === null && (
                    <button className="boton riesgo" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                      disabled={ocupado}
                      onClick={() => void accion(
                        () => api.admin.usuarios.revocarRol.mutate({ rolId: r.id }),
                        "Rol revocado",
                      )}>
                      Revocar
                    </button>
                  )}
                </Celda>
              </tr>
            ))}
          </Tabla>

          <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "0 0 12px" }}>
            Los roles revocados quedan en la lista a propósito: saber que a alguien se le quitó
            un permiso importa tanto como saber que lo tiene. Revocar toma efecto en la
            siguiente petición, no cuando venza la sesión.
          </p>
        </Seccion>
      )}
    </div>
  );
}
