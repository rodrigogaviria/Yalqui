import { useState } from "react";
import { api, sesion, mensajeDeError } from "../lib/api";
import { Marca } from "../componentes/Marca";
import { Campo } from "../componentes/Campo";

type Modo = "ingresar" | "registrar";

export function Entrar({ alEntrar }: { alEntrar: () => void }) {
  const [modo, setModo] = useState<Modo>("ingresar");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [acepta, setAcepta] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r =
        modo === "ingresar"
          ? await api.auth.ingresar.mutate({ email, contrasena })
          : await api.auth.registrar.mutate({
              email, contrasena, nombre, apellido,
              tipoDocumento: "CC", numeroDocumento,
              aceptaTratamientoDatos: true,
            });
      sesion.guardar(r.token);
      alEntrar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  const registrando = modo === "registrar";

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <Marca tamano={34} />
          <p style={{ color: "var(--tinta-2)", margin: "10px 0 0", fontSize: 15 }}>
            Arrendá directo, sin comisión sobre tu canon.
          </p>
        </div>

        <form onSubmit={enviar} className="tarjeta" style={{ padding: 26, display: "grid", gap: 16 }}>
          <h1 style={{ fontSize: 23, fontWeight: 600 }}>
            {registrando ? "Creá tu cuenta" : "Entrá a tu cuenta"}
          </h1>

          {error && <div className="aviso malo" role="alert">{error}</div>}

          {registrando && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo etiqueta="Nombre">
                <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                  autoComplete="given-name" required />
              </Campo>
              <Campo etiqueta="Apellido">
                <input value={apellido} onChange={(e) => setApellido(e.target.value)}
                  autoComplete="family-name" required />
              </Campo>
            </div>
          )}

          {registrando && (
            <Campo etiqueta="Cédula">
              <input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)}
                inputMode="numeric" required />
            </Campo>
          )}

          <Campo etiqueta="Correo">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" required />
          </Campo>

          <Campo
            etiqueta="Contraseña"
            ayuda={registrando ? "Diez caracteres o más" : undefined}
          >
            <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)}
              autoComplete={registrando ? "new-password" : "current-password"} required />
          </Campo>

          {registrando && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: "var(--tinta-2)" }}>
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} required />
              <span>
                Autorizo el tratamiento de mis datos personales. Sin esta autorización no
                se puede crear la cuenta.
              </span>
            </label>
          )}

          <button className="boton" disabled={enviando || (registrando && !acepta)}>
            {enviando ? "Un momento…" : registrando ? "Crear cuenta" : "Entrar"}
          </button>

          <p style={{ margin: 0, textAlign: "center", fontSize: 14, color: "var(--tinta-2)" }}>
            {registrando ? "¿Ya tenés cuenta?" : "¿Todavía no tenés cuenta?"}{" "}
            <button
              type="button"
              onClick={() => { setModo(registrando ? "ingresar" : "registrar"); setError(null); }}
              style={{ background: "none", border: "none", padding: 0, font: "inherit",
                       color: "var(--violeta)", fontWeight: 600, cursor: "pointer" }}
            >
              {registrando ? "Entrá" : "Creala gratis"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
