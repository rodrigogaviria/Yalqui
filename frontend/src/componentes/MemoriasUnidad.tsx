import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "./Campo";
import { etiqueta, opciones } from "../lib/etiquetas";
import { abrirArchivo } from "../lib/archivos";

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TIPOS = opciones("tipoMemoria");

type Memoria = Awaited<ReturnType<typeof api.archivos.memoriasDeUnidad.query>>[number];

/**
 * Las memorias de la unidad: planos, fichas técnicas, licencias, documentos
 * contables. Cada una lleva un tipo del catálogo fijo, ofrecido y listado en
 * orden alfabético — no es una galería, es un archivador.
 */
export function MemoriasUnidad({ inmuebleId }: { inmuebleId: number }) {
  const [memorias, setMemorias] = useState<Memoria[] | null>(null);
  const [tipo, setTipo] = useState(TIPOS[0]![0]);
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    void api.archivos.memoriasDeUnidad.query({ inmuebleId })
      .then(setMemorias)
      .catch((e) => setError(mensajeDeError(e)));
  };
  useEffect(cargar, [inmuebleId]);

  async function subir(archivos: FileList) {
    setSubiendo(true); setError(null);
    try {
      for (const archivo of Array.from(archivos)) {
        const subida = await api.archivos.solicitarSubidaMemoriaUnidad.mutate({
          inmuebleId, tipo: tipo as never, nombre: archivo.name,
          mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic"
            | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

  async function quitar(memoriaId: number) {
    setOcupado(memoriaId); setError(null);
    try {
      await api.archivos.eliminarMemoriaUnidad.mutate({ memoriaId });
      cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setOcupado(null); }
  }

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Memorias de la unidad</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
          Planos, fichas técnicas, licencias, documentos contables: elegí el tipo y subí el archivo.
        </p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Campo etiqueta="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ minWidth: 220 }}>
            {TIPOS.map(([codigo, texto]) => <option key={codigo} value={codigo}>{texto}</option>)}
          </select>
        </Campo>
        <label className="boton fantasma" style={{
          height: 38, fontSize: 13.5, display: "inline-flex", alignItems: "center", padding: "0 14px",
          cursor: subiendo ? "default" : "pointer", opacity: subiendo ? 0.6 : 1,
        }}>
          {subiendo ? "Subiendo…" : "Subir uno o varios"}
          <input type="file" accept={ACEPTA} multiple disabled={subiendo} style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) void subir(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {memorias === null ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Cargando…</p>
      ) : memorias.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Todavía no subiste ninguna.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {memorias.map((m) => (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "10px 12px", borderRadius: 10, border: "1px solid var(--linea)",
            }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{etiqueta("tipoMemoria", m.tipo)}</div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  {new Date(m.createdAt).toLocaleDateString("es-CO")}{m.descripcion ? ` · ${m.descripcion}` : ""}
                </div>
              </div>
              <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
                onClick={() => abrirArchivo(m.archivoId)}>
                Ver
              </button>
              <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
                disabled={ocupado === m.id}
                onClick={() => void quitar(m.id)}>
                {ocupado === m.id ? "…" : "Quitar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
