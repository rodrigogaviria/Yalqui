import { useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Campo } from "../../componentes/Campo";

/**
 * Genera el contrato desde una aplicación aprobada.
 *
 * El marco legal lo decide el tipo de unidad, no este formulario: en vivienda
 * urbana la Ley 820 prohíbe el depósito en dinero y topa el incremento al IPC,
 * así que esas opciones ni se ofrecen. El servidor las rechaza igual — acá solo
 * se evita proponerle a alguien algo que no puede pactar.
 */
export function GenerarContrato({ inmuebleId, aplicacionId, direccion, esVivienda, alVolver }: {
  inmuebleId: number;
  aplicacionId: number;
  direccion: string;
  esVivienda: boolean;
  alVolver: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ numero: string; plantilla: string; firmantes: number; faltantes: string[] } | null>(null);

  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [meses, setMeses] = useState("12");
  const [diaPago, setDiaPago] = useState("5");
  const [incrementoTipo, setIncrementoTipo] = useState<"ipc" | "ipc_mas_puntos" | "fijo" | "ninguno">("ipc");
  const [garantiaTipo, setGarantiaTipo] = useState<"codeudor" | "poliza" | "fiador" | "deposito" | "ninguna">("codeudor");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api.contratos.generar.mutate({
        inmuebleId,
        aplicacionId,
        fechaInicio: new Date(fechaInicio),
        mesesPlazo: Number(meses),
        diaPago: Number(diaPago),
        incrementoTipo,
        garantiaTipo,
      });
      setHecho({ numero: r.numero, plantilla: r.plantilla, firmantes: r.firmantes, faltantes: r.faltantes });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 640 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 600 }}>Contrato generado</h1>
          <p style={{ color: "var(--tinta-2)", margin: "6px 0 0", fontSize: 15 }}>{direccion}</p>
        </div>

        <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 9 }}>
          <Dato titulo="Número" valor={hecho.numero} />
          <Dato titulo="Plantilla" valor={hecho.plantilla} />
          <Dato titulo="Firmantes" valor={String(hecho.firmantes)} />
        </section>

        {hecho.faltantes.length > 0 && (
          <div className="aviso ojo">
            El contrato quedó con <strong>{hecho.faltantes.length}</strong> dato
            {hecho.faltantes.length === 1 ? "" : "s"} sin llenar:{" "}
            <span className="num">{hecho.faltantes.join(", ")}</span>. Aparecen entre llaves
            en el texto — completá la unidad o los datos de las partes y volvé a generarlo
            antes de mandarlo a firmar.
          </div>
        )}

        <div className="aviso ojo">
          Queda en borrador. Desde <strong>Contratos</strong> lo enviás a firmar, y cada
          firmante recibe su propio enlace. El contrato entra en vigencia cuando firman todos.
        </div>

        <button className="boton" onClick={alVolver}>Ir a contratos</button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 18, maxWidth: 640 }}>
      <div>
        <h1 style={{ fontSize: 27, fontWeight: 600 }}>Generar el contrato</h1>
        <p style={{ color: "var(--tinta-2)", margin: "6px 0 0", fontSize: 15 }}>{direccion}</p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 15 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <Campo etiqueta="Empieza el">
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Meses">
            <input type="number" min={1} max={120} value={meses}
              onChange={(e) => setMeses(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Paga el día" ayuda="Del 1 al 28">
            <input type="number" min={1} max={28} value={diaPago}
              onChange={(e) => setDiaPago(e.target.value)} required />
          </Campo>
        </div>

        <Campo
          etiqueta="Incremento anual"
          ayuda={esVivienda ? "En vivienda urbana el tope legal es el IPC del año anterior" : undefined}
        >
          <select value={incrementoTipo} onChange={(e) => setIncrementoTipo(e.target.value as "ipc")}>
            <option value="ipc">IPC del año anterior</option>
            {!esVivienda && <option value="ipc_mas_puntos">IPC más puntos</option>}
            <option value="fijo">Porcentaje fijo</option>
            <option value="ninguno">Sin incremento</option>
          </select>
        </Campo>

        <Campo
          etiqueta="Garantía"
          ayuda={esVivienda ? "La Ley 820 prohíbe el depósito en dinero para vivienda" : undefined}
        >
          <select value={garantiaTipo} onChange={(e) => setGarantiaTipo(e.target.value as "codeudor")}>
            <option value="codeudor">Codeudor</option>
            <option value="poliza">Póliza de arrendamiento</option>
            <option value="fiador">Fiador</option>
            {!esVivienda && <option value="deposito">Depósito en dinero</option>}
            <option value="ninguna">Sin garantía</option>
          </select>
        </Campo>
      </section>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="boton" disabled={enviando}>
          {enviando ? "Generando…" : "Generar"}
        </button>
        <button type="button" className="boton fantasma" onClick={alVolver} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14.5 }}>
      <span style={{ color: "var(--tinta-2)" }}>{titulo}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{valor}</span>
    </div>
  );
}
