import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";

const ACEPTA = "image/jpeg,image/png,image/webp,image/heic";

type Foto = Awaited<ReturnType<typeof api.archivos.fotosDeUnidad.query>>[number];

/**
 * Las fotos de una unidad: se suben una o varias a la vez, se marca cuál es
 * la portada y se pueden quitar. Van directo a S3 con una URL firmada, igual
 * que cualquier otro archivo del sistema.
 */
export function FotosUnidad({ inmuebleId }: { inmuebleId: number }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    void api.archivos.fotosDeUnidad.query({ inmuebleId })
      .then(setFotos)
      .catch((e) => setError(mensajeDeError(e)));
  };
  useEffect(cargar, [inmuebleId]);

  // Cada foto se ve con una URL firmada propia: se piden todas apenas llega la lista.
  useEffect(() => {
    if (!fotos) return;
    let vigente = true;
    void Promise.all(fotos.map((f) =>
      api.archivos.urlDescarga.query({ archivoId: f.archivoId }).then((r) => [f.id, r.url] as const),
    )).then((pares) => { if (vigente) setUrls(Object.fromEntries(pares)); });
    return () => { vigente = false; };
  }, [fotos]);

  async function subir(archivos: FileList) {
    setSubiendo(true); setError(null);
    try {
      for (const archivo of Array.from(archivos)) {
        const subida = await api.archivos.solicitarSubidaFotoUnidad.mutate({
          inmuebleId, nombre: archivo.name,
          mime: archivo.type as "image/jpeg" | "image/png" | "image/webp" | "image/heic",
          bytes: archivo.size,
        });
        const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
        if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}. Probá de nuevo.`);
      }
      cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setSubiendo(false); }
  }

  async function marcarPortada(fotoId: number) {
    setOcupado(fotoId); setError(null);
    try {
      await api.archivos.marcarPortadaUnidad.mutate({ fotoId });
      cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setOcupado(null); }
  }

  async function quitar(fotoId: number) {
    setOcupado(fotoId); setError(null);
    try {
      await api.archivos.eliminarFotoUnidad.mutate({ fotoId });
      cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setOcupado(null); }
  }

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Fotos de la unidad</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
          La primera foto que subas queda como portada. Podés cambiarla cuando quieras.
        </p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      {fotos === null ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Cargando…</p>
      ) : fotos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Todavía no subiste ninguna.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
          {fotos.map((f) => (
            <div key={f.id} style={{
              position: "relative", borderRadius: 10, overflow: "hidden",
              border: f.esPortada ? "2px solid var(--violeta)" : "1px solid var(--linea)",
              aspectRatio: "4 / 3", background: "var(--papel-2)",
            }}>
              {urls[f.id] ? (
                <img src={urls[f.id]} alt={f.descripcion ?? "Foto de la unidad"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 12, color: "var(--tinta-3)" }}>
                  Cargando…
                </div>
              )}
              {f.esPortada && (
                <span className="pastilla arrendado" style={{ position: "absolute", top: 6, left: 6, fontSize: 10.5 }}>
                  Portada
                </span>
              )}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, padding: 6,
                display: "flex", gap: 4, background: "linear-gradient(transparent, rgba(0,0,0,.55))",
              }}>
                {!f.esPortada && (
                  <button type="button" className="boton fantasma" style={{ height: 28, fontSize: 11, padding: "0 8px", background: "#fff" }}
                    disabled={ocupado === f.id}
                    onClick={() => void marcarPortada(f.id)}>
                    {ocupado === f.id ? "…" : "Portada"}
                  </button>
                )}
                <button type="button" className="boton fantasma" style={{ height: 28, fontSize: 11, padding: "0 8px", background: "#fff" }}
                  disabled={ocupado === f.id}
                  onClick={() => void quitar(f.id)}>
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="boton fantasma" style={{
        height: 38, fontSize: 13.5, display: "inline-flex", alignItems: "center", padding: "0 14px",
        width: "fit-content", cursor: subiendo ? "default" : "pointer", opacity: subiendo ? 0.6 : 1,
      }}>
        {subiendo ? "Subiendo…" : "Subir una o varias fotos"}
        <input type="file" accept={ACEPTA} multiple disabled={subiendo} style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.length) void subir(e.target.files); e.target.value = ""; }} />
      </label>
    </section>
  );
}
