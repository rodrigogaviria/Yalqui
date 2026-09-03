import { useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "../componentes/Campo";

/**
 * Se interpone antes que cualquier otra pantalla cuando la contraseña la puso
 * otra persona — un propietario al dar de alta a su inquilino, o un
 * administrador al reiniciarla. No pide la contraseña actual: ya se demostró
 * quién es al entrar con la temporal, y volver a pedirla acá no suma
 * seguridad, solo un paso más.
 */
export function CambioContrasenaObligatorio({ alCambiar }: { alCambiar: () => void }) {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coincide = nueva.length > 0 && nueva === confirmar;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nueva.length < 10) {
      setError("La contraseña necesita diez caracteres o más");
      return;
    }
    if (!coincide) {
      setError("Las dos contraseñas no coinciden");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api.auth.primerCambioContrasena.mutate({ nueva });
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 20 }}>
      <form onSubmit={enviar} className="tarjeta" style={{ padding: 28, display: "grid", gap: 16, maxWidth: 380, width: "100%" }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0 }}>Elegí tu contraseña</h1>
          <p style={{ color: "var(--tinta-2)", margin: "6px 0 0", fontSize: 14 }}>
            La que tenías la puso otra persona para darte acceso. Antes de seguir, poné
            una que solo vos conozcas.
          </p>
        </div>

        {error && <div className="aviso malo" role="alert">{error}</div>}

        <Campo etiqueta="Contraseña nueva" ayuda="Diez caracteres o más">
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoFocus />
        </Campo>
        <Campo etiqueta="Repetila">
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        </Campo>

        <button className="boton" disabled={enviando || !coincide || nueva.length < 10}>
          {enviando ? "Guardando…" : "Guardar y continuar"}
        </button>
      </form>
    </div>
  );
}
