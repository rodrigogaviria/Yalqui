import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Campo } from "./Campo";
import { etiqueta, opciones } from "../lib/etiquetas";
import { abrirArchivo } from "../lib/archivos";

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TIPOS = opciones("tipoMemoria");

type MemoriaUnidad = Awaited<ReturnType<typeof api.archivos.memoriasDeUnidad.query>>[number];
type MemoriaEdificacion = Awaited<ReturnType<typeof api.archivos.memoriasDeEdificacion.query>>[number];

/**
 * Las memorias de una unidad o de una edificación entera: planos, fichas
 * técnicas, licencias, documentos contables. Cada una lleva un tipo del
 * catálogo fijo, ofrecido y listado en orden alfabético — no es una
 * galería, es un archivador. En una unidad que pertenece a una edificación,
 * se ven también las memorias de toda la edificación, marcadas aparte.
 */
export function MemoriasUnidad(props: { inmuebleId: number } | { edificacionId: number }) {
  const inmuebleId = "inmuebleId" in props ? props.inmuebleId : undefined;
  const edificacionId = "edificacionId" in props ? props.edificacionId : undefined;
  const esEdificacion = edificacionId !== undefined;
  const sitio = esEdificacion ? { edificacionId } : { inmuebleId: inmuebleId! };

  const [memorias, setMemorias] = useState<Array<MemoriaUnidad | MemoriaEdificacion> | null>(null);
  const [tipo, setTipo] = useState(TIPOS[0]![0]);
  const [descripcion, setDescripcion] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    const pedido = edificacionId !== undefined
      ? api.archivos.memoriasDeEdificacion.query({ edificacionId })
      : api.archivos.memoriasDeUnidad.query({ inmuebleId: inmuebleId! });
    void pedido.then(setMemorias).catch((e) => setError(mensajeDeError(e)));
  };
  useEffect(cargar, [inmuebleId, edificacionId]);

  async function subir(archivos: FileList) {
    setSubiendo(true); setError(null);
    try {
      for (const archivo of Array.from(archivos)) {
        const subida = await api.archivos.solicitarSubidaMemoriaUnidad.mutate({
          ...sitio, tipo: tipo as never, nombre: archivo.name,
          mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic"
            | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: archivo.size,
          ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        });
        const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
        if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}. Probá de nuevo.`);
      }
      setDescripcion("");
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
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
          {esEdificacion ? "Memorias de la edificación" : "Memorias de la unidad"}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
          {esEdificacion
            ? "Planos del edificio, licencia de construcción: lo que es de toda la edificación y no de una sola unidad."
            : "Planos, fichas técnicas, licencias, documentos contables: elegí el tipo y subí el archivo."}
        </p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Campo etiqueta="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ minWidth: 220 }}>
            {TIPOS.map(([codigo, texto]) => <option key={codigo} value={codigo}>{texto}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Descripción" ayuda="Opcional">
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Certificado de gas 2026, piso 3…" style={{ minWidth: 220 }} />
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
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {etiqueta("tipoMemoria", m.tipo)}
                  {!esEdificacion && "deLaEdificacion" in m && m.deLaEdificacion ? (
                    <span className="pastilla publicado" style={{ marginLeft: 8, fontSize: 11 }}>De la edificación</span>
                  ) : null}
                </div>
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
