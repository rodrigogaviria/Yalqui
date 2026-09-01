import { useEffect, useState } from "react";
import { api, mensajeDeError, sesion } from "../lib/api";
import { Campo } from "../componentes/Campo";
import { Marca } from "../componentes/Marca";

/**
 * Donde el inquilino toma posesión de la cuenta que le crearon.
 *
 * Es pública y vive fuera de la sesión: quien llega acá todavía no puede entrar
 * a ninguna parte. Elegir la contraseña es justamente lo que hace que la cuenta
 * sea suya y deje de ser accesible para quien la creó.
 */
export function Activar({ token, alEntrar }: { token: string; alEntrar: () => void }) {
  const [cuenta, setCuenta] = useState<{ email: string; nombre: string; apellido: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState("");
  const [repetida, setRepetida] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const c = await api.auth.verActivacion.query({ token });
        if (vigente) setCuenta(c);
      } catch (e) {
        if (vigente) setError(mensajeDeError(e));
      }
    })();
    return () => { vigente = false; };
  }, [token]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api.auth.activar.mutate({ token, contrasena });
      sesion.guardar(r.token);
      alEntrar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 22 }}>
      <div style={{ width: "100%", maxWidth: 400, display: "grid", gap: 20 }}>
        <Marca tamano={28} />

        {error && !cuenta ? (
          <div className="aviso malo" role="alert">{error}</div>
        ) : cuenta === null ? (
          <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>
        ) : (
          <form onSubmit={enviar} className="tarjeta" style={{ padding: 24, display: "grid", gap: 15 }}>
            <div>
              <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0 }}>
                Hola, {cuenta.nombre}
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--tinta-2)" }}>
                Tu propietario creó esta cuenta a nombre de <strong>{cuenta.email}</strong>.
                Elegí una contraseña: desde ese momento solo vos podés entrar.
              </p>
            </div>

            {error && <div className="aviso malo" role="alert">{error}</div>}

            <Campo etiqueta="Contraseña" ayuda="Diez caracteres o más">
              <input type="password" value={contrasena} minLength={10}
                onChange={(e) => setContrasena(e.target.value)} required autoFocus />
            </Campo>

            <Campo etiqueta="Repetila">
              <input type="password" value={repetida}
                onChange={(e) => setRepetida(e.target.value)} required />
            </Campo>

            {repetida !== "" && repetida !== contrasena && (
              <div className="aviso malo">Las dos contraseñas no coinciden.</div>
            )}

            <button className="boton"
              disabled={enviando || contrasena.length < 10 || contrasena !== repetida}>
              {enviando ? "Activando…" : "Activar mi cuenta"}
            </button>

            <p style={{ margin: 0, fontSize: 12.5, color: "var(--tinta-3)" }}>
              Al activarla aceptás el tratamiento de tus datos personales. El enlace
              sirve una sola vez.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
