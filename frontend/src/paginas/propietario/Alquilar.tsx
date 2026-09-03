import { useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { pesos } from "../../componentes/Dinero";

type Resultado = Awaited<ReturnType<typeof api.inmuebles.marcarAlquilado.mutate>>;

/**
 * Marcar una unidad como alquilada, registrando al inquilino.
 *
 * Es el camino directo, para cuando ya conseguiste inquilino por fuera. No abre
 * una vía paralela por el sistema: deja una aplicación aprobada, que es de
 * donde sale el contrato. Un solo camino, con dos entradas.
 */
export function Alquilar({ inmuebleId, direccion, canonBase, alVolver, alContratar }: {
  inmuebleId: number;
  direccion: string;
  canonBase: number;
  alVolver: () => void;
  alContratar: (aplicacionId: number) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<"CC" | "CE" | "NIT" | "PA">("CC");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [telefono, setTelefono] = useState("");
  const [canon, setCanon] = useState(String(canonBase));
  const [meses, setMeses] = useState("12");
  const [ocupantes, setOcupantes] = useState("1");
  const [mascotas, setMascotas] = useState("0");
  const [fechaIngreso, setFechaIngreso] = useState("");

  const [conCodeudor, setConCodeudor] = useState(false);
  const [coNombre, setCoNombre] = useState("");
  const [coDoc, setCoDoc] = useState("");
  const [coTipoDoc, setCoTipoDoc] = useState<"CC" | "CE" | "NIT" | "PA">("CC");
  const [coEmail, setCoEmail] = useState("");
  const [coTelefono, setCoTelefono] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      setHecho(await api.inmuebles.marcarAlquilado.mutate({
        inmuebleId,
        email: email.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        tipoDocumento,
        numeroDocumento: numeroDocumento.trim(),
        ...(telefono.trim() === "" ? {} : { telefono: telefono.trim() }),
        ...(Number(canon) > 0 ? { canonAcordado: Number(canon) } : {}),
        mesesPlazo: Number(meses) || 12,
        numOcupantes: Number(ocupantes) || 1,
        numMascotas: Number(mascotas) || 0,
        ...(fechaIngreso === "" ? {} : { fechaIngreso: new Date(fechaIngreso) }),
        ...(conCodeudor
          ? {
              codeudor: {
                nombre: coNombre.trim(),
                tipoDocumento: coTipoDoc,
                numeroDocumento: coDoc.trim(),
                email: coEmail.trim(),
                ...(coTelefono.trim() === "" ? {} : { telefono: coTelefono.trim() }),
              },
            }
          : {}),
      }));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 680 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 600 }}>Unidad alquilada</h1>
          <p style={{ color: "var(--tinta-2)", margin: "6px 0 0", fontSize: 15 }}>
            {direccion} · {pesos(hecho.canon)} al mes · {hecho.mesesPlazo} meses
          </p>
        </div>

        {hecho.contrasenaTemporal !== null ? (
          <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Decile esto a {nombre}</h2>
            <p style={{ margin: 0, fontSize: 14, color: "var(--tinta-2)" }}>
              Le creamos la cuenta con esta contraseña temporal. Se la decís de palabra o
              por WhatsApp — no hace falta que le llegue ningún correo. La primera vez que
              entre, el sistema la va a obligar a cambiarla por una que solo ella conozca.
            </p>

            <div style={{
              display: "flex", gap: 8, alignItems: "center", background: "var(--papel-2)",
              border: "1px solid var(--linea)", borderRadius: 9, padding: "10px 12px",
            }}>
              <span style={{ fontSize: 13, color: "var(--tinta-2)" }}>Correo</span>
              <code className="num" style={{ flex: 1, fontSize: 13.5 }}>{email}</code>
            </div>
            <div style={{
              display: "flex", gap: 8, alignItems: "center", background: "var(--papel-2)",
              border: "1px solid var(--linea)", borderRadius: 9, padding: "10px 12px",
            }}>
              <span style={{ fontSize: 13, color: "var(--tinta-2)" }}>Contraseña</span>
              <code className="num" style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>
                {hecho.contrasenaTemporal}
              </code>
              <button
                className="boton fantasma"
                style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                onClick={() => {
                  void navigator.clipboard.writeText(hecho.contrasenaTemporal!);
                  setCopiado(true);
                }}
              >
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
          </section>
        ) : (
          <div className="aviso bueno">
            Esa persona ya tenía cuenta en Yalqui, así que sigue entrando con la que ya tenía.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="boton" onClick={() => alContratar(hecho.aplicacionId)}>
            Generar el contrato
          </button>
          <button className="boton fantasma" onClick={alVolver}>Después</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 18, maxWidth: 680 }}>
      <div>
        <button type="button" className="boton fantasma"
          style={{ height: 34, fontSize: 13.5, padding: "0 12px", marginBottom: 12 }}
          onClick={alVolver}>
          ← Volver al portafolio
        </button>
        <h1 style={{ fontSize: 27, fontWeight: 600 }}>Marcar como alquilada</h1>
        <p style={{ color: "var(--tinta-2)", margin: "6px 0 0", fontSize: 15 }}>
          {direccion}
        </p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Tomador</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>
          Quien firma el contrato y responde por el canon.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo etiqueta="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Apellido">
            <input value={apellido} onChange={(e) => setApellido(e.target.value)} required />
          </Campo>
        </div>

        <Campo etiqueta="Correo" ayuda="Ahí le llega el enlace para activar su cuenta y firmar">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>

        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 12 }}>
          <Campo etiqueta="Tipo">
            <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as "CC")}>
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="NIT">NIT</option>
              <option value="PA">PA</option>
            </select>
          </Campo>
          <Campo etiqueta="Documento">
            <input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Campo>
        </div>
      </section>

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Lo que acordaron</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <Campo etiqueta="Canon de arrendamiento" ayuda={`El de la unidad es ${pesos(canonBase)}`}>
            <input type="number" min={0} step={1000} value={canon}
              onChange={(e) => setCanon(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Plazo en meses">
            <input type="number" min={1} max={120} value={meses}
              onChange={(e) => setMeses(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Personas">
            <input type="number" min={1} max={50} value={ocupantes}
              onChange={(e) => setOcupantes(e.target.value)} />
          </Campo>
          <Campo etiqueta="Mascotas">
            <input type="number" min={0} max={20} value={mascotas}
              onChange={(e) => setMascotas(e.target.value)} />
          </Campo>
          <Campo etiqueta="Entra el">
            <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
          </Campo>
        </div>
      </section>

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Codeudor</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            No se le crea cuenta: no va a usar la aplicación, solo responde por la deuda.
            Sus datos pasan al contrato al generarlo.
          </p>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5 }}>
          <input type="checkbox" checked={conCodeudor}
            onChange={(e) => setConCodeudor(e.target.checked)}
            style={{ width: 18, height: 18, flexShrink: 0 }} />
          El arriendo tiene codeudor
        </label>

        {conCodeudor && (
          <>
            <Campo etiqueta="Nombre completo">
              <input value={coNombre} onChange={(e) => setCoNombre(e.target.value)} required />
            </Campo>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
              <Campo etiqueta="Tipo">
                <select value={coTipoDoc} onChange={(e) => setCoTipoDoc(e.target.value as "CC")}>
                  <option value="CC">CC</option>
                  <option value="CE">CE</option>
                  <option value="NIT">NIT</option>
                  <option value="PA">PA</option>
                </select>
              </Campo>
              <Campo etiqueta="Cédula del codeudor">
                <input value={coDoc} onChange={(e) => setCoDoc(e.target.value)} required />
              </Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo etiqueta="Correo del codeudor">
                <input type="email" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} required />
              </Campo>
              <Campo etiqueta="Teléfono">
                <input value={coTelefono} onChange={(e) => setCoTelefono(e.target.value)} />
              </Campo>
            </div>
          </>
        )}
      </section>

      <div className="aviso ojo">
        La unidad sale de circulación al confirmar. El contrato se genera en el paso
        siguiente, y el inquilino queda como tal recién cuando lo firma.
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="boton" disabled={enviando}>
          {enviando ? "Registrando…" : "Marcar como alquilada"}
        </button>
        <button type="button" className="boton fantasma" onClick={alVolver} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
