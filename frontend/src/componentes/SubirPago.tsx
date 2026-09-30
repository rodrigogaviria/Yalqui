import { useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "./Campo";
import { pesos } from "./Dinero";

type Parte = { monto: string; medio: "efectivo" | "transferencia"; archivo: File | null };
const parteVacia = (): Parte => ({ monto: "", medio: "transferencia", archivo: null });

/**
 * Fecha, y una o varias partes del pago, cada una con su medio, su monto y su
 * comprobante. Varias partes es lo que permite anotar que el mismo pago
 * llegó dividido: una porción en efectivo, el resto por transferencia. La
 * transferencia exige comprobante; el efectivo no.
 */
export function SubirPago({ inmuebleId, alTerminar, fechaInicial, comoInquilino = false }: {
  inmuebleId: number; alTerminar: (periodo: string) => void; fechaInicial?: string;
  /** El inquilino sube el suyo y queda pendiente de confirmar. */
  comoInquilino?: boolean;
}) {
  const [fecha, setFecha] = useState(fechaInicial ?? new Date().toISOString().slice(0, 10));
  const [partes, setPartes] = useState<Parte[]>([parteVacia()]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (i: number, cambios: Partial<Parte>) =>
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambios } : p)));

  const total = partes.reduce((t, p) => t + (Number(p.monto) || 0), 0);
  const puedeEnviar = partes.every((p) => Number(p.monto) > 0
    && (p.medio === "efectivo" || p.archivo !== null));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const partesEnviadas = await Promise.all(partes.map(async (p) => {
        let comprobanteArchivoId: number | undefined;
        if (p.archivo) {
          const subida = await api.archivos.solicitarSubidaPagoUnidad.mutate({
            inmuebleId,
            nombre: p.archivo.name,
            mime: p.archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
            bytes: p.archivo.size,
          });
          const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": p.archivo.type }, body: p.archivo });
          if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
          comprobanteArchivoId = subida.archivoId;
        }
        return {
          monto: Number(p.monto), medio: p.medio,
          ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
        };
      }));
      const registrar = comoInquilino ? api.inquilino.subirPago : api.facturacion.registrarPagoUnidad;
      const { periodo } = await registrar.mutate({
        inmuebleId, fechaPago: new Date(fecha), partes: partesEnviadas,
      });
      alTerminar(periodo);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <Campo etiqueta="Fecha del pago">
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>

      <div style={{ display: "grid", gap: 10 }}>
        {partes.map((p, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
            padding: partes.length > 1 ? "10px 12px" : 0,
            border: partes.length > 1 ? "1px solid var(--linea)" : "none",
            borderRadius: partes.length > 1 ? 10 : 0,
          }}>
            {partes.length > 1 && (
              <div style={{ flexBasis: "100%", fontSize: 12.5, fontWeight: 600, color: "var(--tinta-2)" }}>
                Parte {i + 1}
              </div>
            )}
            <Campo etiqueta="Medio de pago">
              <select value={p.medio} onChange={(e) => cambiar(i, { medio: e.target.value as Parte["medio"] })}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </Campo>
            <Campo etiqueta="Valor">
              <input type="number" min={1} step="any" required value={p.monto} placeholder="320000"
                onChange={(e) => cambiar(i, { monto: e.target.value })} />
            </Campo>
            <Campo etiqueta={p.medio === "transferencia" ? "Imagen del comprobante" : "Imagen (opcional)"}
              ayuda="Foto o PDF, hasta 10 MB">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                required={p.medio === "transferencia"}
                onChange={(e) => cambiar(i, { archivo: e.target.files?.[0] ?? null })} />
            </Campo>
            {partes.length > 1 && (
              <button type="button" className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))}>
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
          disabled={partes.length >= 6}
          onClick={() => setPartes((ps) => [...ps, parteVacia()])}>
          + Pagaron con otro medio
        </button>
        {partes.length > 1 && (
          <span style={{ fontSize: 13.5, color: "var(--tinta-2)" }}>
            Total: <strong className="num">{pesos(total)}</strong>
          </span>
        )}
      </div>

      <div>
        <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }}
          disabled={enviando || !puedeEnviar}>
          {enviando ? "Subiendo…" : "Guardar pago"}
        </button>
      </div>
      {error && <div className="aviso malo" role="alert">{error}</div>}
    </form>
  );
}
