import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { abrirArchivo } from "../lib/archivos";

const ACEPTA_MEDIA = "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm";
type Mime = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "video/mp4" | "video/quicktime" | "video/webm";

const fecha = (f: string | Date) => new Date(f).toLocaleDateString("es-CO", { timeZone: "UTC" });

/**
 * El acta de entrega de un contrato ya legalizado: su texto, la evidencia
 * (fotos/videos que solo sube el inquilino) y la firma de las dos partes.
 */
export function ActaEntrega({ contratoId }: { contratoId: number }) {
  const [tick, setTick] = useState(0);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof api.contratos.actaDe.query>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [firmando, setFirmando] = useState(false);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const d = await api.contratos.actaDe.query({ contratoId });
        if (vigente) { setDatos(d); setError(null); }
      } catch (e) {
        if (vigente) setError(mensajeDeError(e));
      }
    })();
    return () => { vigente = false; };
  }, [contratoId, tick]);

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ fontSize: 13, color: "var(--tinta-3)" }}>Cargando acta…</p>;

  async function subir() {
    setSubiendo(true);
    setError(null);
    try {
      for (const archivo of archivos) {
        const s = await api.archivos.solicitarSubidaActa.mutate({
          actaId: datos!.id, nombre: archivo.name, mime: archivo.type as Mime, bytes: archivo.size,
        });
        const r = await fetch(s.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
        if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}. Probá de nuevo.`);
      }
      setArchivos([]);
      setAviso("Evidencia subida.");
      setTick((n) => n + 1);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function firmar() {
    setFirmando(true);
    setError(null);
    try {
      await api.contratos.firmarActa.mutate({ contratoId });
      setAviso("Acta firmada.");
      setTick((n) => n + 1);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setFirmando(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Acta de entrega</div>
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <div style={{
        whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.5, color: "var(--tinta-2)",
        maxHeight: 140, overflowY: "auto", border: "1px solid var(--linea)", borderRadius: 8, padding: 10,
      }}>
        {datos.texto}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <span>Quien entrega: {datos.entregaFirmadaAt ? `Firmó el ${fecha(datos.entregaFirmadaAt)}` : "Falta firmar"}</span>
        <span>Inquilino: {datos.inquilinoFirmadaAt ? `Firmó el ${fecha(datos.inquilinoFirmadaAt)}` : "Falta firmar"}</span>
      </div>

      {datos.media.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {datos.media.map((m) => (
            <button key={m.id} type="button" className="boton fantasma" style={{ height: 32, fontSize: 12.5 }}
              onClick={() => abrirArchivo(m.id)}>
              {m.mime.startsWith("video/") ? "▶ " : "🖼 "}{m.nombre}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!datos.esPropietario && (
          <>
            <input type="file" multiple accept={ACEPTA_MEDIA}
              onChange={(e) => setArchivos(e.target.files ? Array.from(e.target.files) : [])} />
            <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
              disabled={archivos.length === 0 || subiendo} onClick={() => void subir()}>
              {subiendo ? "Subiendo…" : "Subir evidencia"}
            </button>
          </>
        )}
        {!datos.yoFirme && (
          <button type="button" className="boton" style={{ height: 34, fontSize: 13 }}
            disabled={firmando} onClick={() => void firmar()}>
            {firmando ? "Firmando…" : "Firmar acta"}
          </button>
        )}
      </div>
    </div>
  );
}
