import { useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "./Campo";

/** Fecha, medio e imagen del comprobante. La transferencia lo exige; el efectivo no. */
export function SubirPago({ inmuebleId, alTerminar, fechaInicial, comoInquilino = false }: {
  inmuebleId: number; alTerminar: (periodo: string) => void; fechaInicial?: string;
  /** El inquilino sube el suyo y queda pendiente de confirmar. */
  comoInquilino?: boolean;
}) {
  const [fecha, setFecha] = useState(fechaInicial ?? new Date().toISOString().slice(0, 10));
  const [medio, setMedio] = useState<"efectivo" | "transferencia">("transferencia");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      let comprobanteArchivoId: number | undefined;
      if (archivo) {
        const subida = await api.archivos.solicitarSubidaPagoUnidad.mutate({
          inmuebleId,
          nombre: archivo.name,
          mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
          bytes: archivo.size,
        });
        const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
        if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
        comprobanteArchivoId = subida.archivoId;
      }
      const registrar = comoInquilino ? api.inquilino.subirPago : api.facturacion.registrarPagoUnidad;
      const { periodo } = await registrar.mutate({
        inmuebleId, fechaPago: new Date(fecha), medio,
        ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
      });
      alTerminar(periodo);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <Campo etiqueta="Fecha del pago">
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo etiqueta="Medio de pago">
        <select value={medio} onChange={(e) => setMedio(e.target.value as typeof medio)}>
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
        </select>
      </Campo>
      <Campo etiqueta={medio === "transferencia" ? "Imagen del comprobante" : "Imagen (opcional)"}
        ayuda="Foto o PDF, hasta 10 MB">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          required={medio === "transferencia"}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </Campo>
      <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }}
        disabled={enviando}>
        {enviando ? "Subiendo…" : "Guardar pago"}
      </button>
      {error && <div className="aviso malo" role="alert" style={{ flexBasis: "100%" }}>{error}</div>}
    </form>
  );
}
