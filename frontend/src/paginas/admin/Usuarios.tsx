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

type Rol = (typeof ROLES)[number][0];
type Ambito = "global" | "inmueble" | "edificacion" | "contrato";

/**
 * El ámbito no es una elección aparte: lo determina el rol. «Propietario» es
 * siempre de un inmueble, «inquilino» siempre de un contrato — no existe la
 * combinación «propietario de una edificación». Antes se pedían las dos cosas
 * por separado y nada impedía escoger una pareja sin sentido.
 */
const AMBITO_DE_ROL: Record<Rol, Ambito> = {
  admin_yalqui: "global",
  propietario: "inmueble",
  socio_propietario: "inmueble",
  administrador_inmueble: "edificacion",
  inquilino: "contrato",
  personal_propiedad: "edificacion",
  proveedor: "inmueble",
};

export function Usuarios({ avisar }: { avisar: (m: string) => void }) {
  const [listado, setListado] = useState<Listado | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [nEmail, setNEmail] = useState("");
  const [nNombre, setNNombre] = useState("");
  const [nApellido, setNApellido] = useState("");
  const [nDocumento, setNDocumento] = useState("CC");
  const [nNumero, setNNumero] = useState("");
  const [nTelefono, setNTelefono] = useState("");
  const [enlace, setEnlace] = useState<string | null>(null);

  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [nuevaClave, setNuevaClave] = useState("");

  const [rol, setRol] = useState<Rol>("propietario");
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
  const ambitoEfectivo = AMBITO_DE_ROL[rol];
  const pideId = ambitoEfectivo !== "global";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <Seccion
        titulo="Usuarios"
        nota="Buscá por correo, nombre o documento."
        accion={
          <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
            onClick={() => { setRegistrando((v) => !v); setEnlace(null); }}>
            {registrando ? "Cancelar" : "+ Registrar usuario"}
          </button>
        }
      >
        {registrando && (
          <div style={{
            border: "1px solid var(--violeta)", borderRadius: 11, padding: 16,
            background: "var(--violeta-tenue)", display: "grid", gap: 12, marginBottom: 14,
          }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Registrar usuario</div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--tinta-2)" }}>
              Nace sin contraseña, con un enlace de un solo uso para que la persona elija la
              suya. Nadie más puede entrar con esa cuenta hasta que la active.
            </p>

            {enlace ? (
              <div className="aviso bueno">
                Cuenta creada. Enlace de activación: <span className="num">{enlace}</span>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <Campo etiqueta="Correo">
                    <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Nombre">
                    <input value={nNombre} onChange={(e) => setNNombre(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Apellido">
                    <input value={nApellido} onChange={(e) => setNApellido(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Tipo de documento">
                    <select value={nDocumento} onChange={(e) => setNDocumento(e.target.value)}>
                      <option value="CC">CC</option>
                      <option value="CE">CE</option>
                      <option value="NIT">NIT</option>
                      <option value="PA">PA</option>
                    </select>
                  </Campo>
                  <Campo etiqueta="Número de documento">
                    <input value={nNumero} onChange={(e) => setNNumero(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Teléfono" ayuda="Opcional">
                    <input value={nTelefono} onChange={(e) => setNTelefono(e.target.value)} />
                  </Campo>
                </div>
                <div>
                  <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                    disabled={ocupado || !nEmail.includes("@") || nNombre.trim() === "" || nApellido.trim() === "" || nNumero.trim().length < 4}
                    onClick={() => void (async () => {
                      setOcupado(true);
                      setError(null);
                      try {
                        const r = await api.admin.usuarios.crear.mutate({
                          email: nEmail.trim(), nombre: nNombre.trim(), apellido: nApellido.trim(),
                          tipoDocumento: nDocumento as "CC", numeroDocumento: nNumero.trim(),
                          ...(nTelefono.trim() === "" ? {} : { telefono: nTelefono.trim() }),
                        });
                        setEnlace(r.enlaceActivacion);
                        avisar("Usuario registrado");
                        await cargar(busqueda);
                      } catch (e) {
                        setError(mensajeDeError(e));
                      } finally {
                        setOcupado(false);
                      }
                    })()}>
                    {ocupado ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

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
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="boton fantasma"
                style={{ height: 38, fontSize: 14 }}
                onClick={() => { setCambiandoClave((v) => !v); setNuevaClave(""); }}
              >
                {cambiandoClave ? "Cancelar" : "Cambiar contraseña"}
              </button>
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
            </div>
          }
        >
          {cambiandoClave && (
            <div style={{
              border: "1px solid var(--violeta)", borderRadius: 11, padding: 16,
              background: "var(--violeta-tenue)", display: "grid", gap: 10, marginBottom: 4,
            }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--tinta-2)" }}>
                Pone una contraseña temporal. La cuenta queda marcada para cambio obligatorio:
                en el próximo ingreso, esta persona tiene que reemplazarla por la suya antes de
                ver nada.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <Campo etiqueta="Contraseña nueva" ayuda="Seis caracteres o más">
                    <input value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} />
                  </Campo>
                </div>
                <button className="boton" style={{ height: 42 }}
                  disabled={ocupado || nuevaClave.length < 6}
                  onClick={() => void accion(
                    () => api.admin.usuarios.cambiarContrasena.mutate({
                      usuarioId: detalle.usuario.id, nueva: nuevaClave,
                    }),
                    "Contraseña reiniciada",
                  ).then(() => { setCambiandoClave(false); setNuevaClave(""); })}>
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 6 }}>
            <div style={{ flex: "1 1 220px" }}>
              <Campo etiqueta="Rol">
                <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                  {ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
            </div>
            {pideId && (
              <div style={{ width: 160 }}>
                <Campo etiqueta={`Id de ${etiqueta("ambitoRol", ambitoEfectivo).toLowerCase()}`}
                  ayuda="Opcional acá: si lo dejás vacío, el servidor te dice qué falta">
                  <input type="number" min={1} value={ambitoId} onChange={(e) => setAmbitoId(e.target.value)} />
                </Campo>
              </div>
            )}
            <button className="boton" style={{ height: 42 }}
              disabled={ocupado}
              onClick={() => void accion(
                () => api.admin.usuarios.otorgarRol.mutate({
                  usuarioId: detalle.usuario.id,
                  rol,
                  ambitoTipo: ambitoEfectivo,
                  ambitoId: ambitoId.trim() === "" ? 0 : Number(ambitoId),
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
