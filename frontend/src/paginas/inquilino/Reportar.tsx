import { useState } from "react";
import { api } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { abrirArchivo } from "../../lib/archivos";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";
import { nombreUnidad } from "./comun";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  abierta: { texto: "Recibida", clase: "pausado" },
  asignada: { texto: "Asignada", clase: "publicado" },
  en_progreso: { texto: "En progreso", clase: "publicado" },
  espera_aprobacion: { texto: "En aprobación", clase: "pausado" },
  resuelta: { texto: "Resuelta", clase: "arrendado" },
  cerrada: { texto: "Cerrada", clase: "borrador" },
  rechazada: { texto: "Rechazada", clase: "mora" },
};

const ACEPTA_MEDIA = "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm";

/** Reportar un daño o un problema de tu unidad, y ver cómo va. */
export function Reportar() {
  const [abierto, setAbierto] = useState(false);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [unidades, tipos, lista] = await Promise.all([
      api.inquilino.miUnidad.query(),
      api.incidencias.tipos.query(),
      api.incidencias.mias.query({}),
    ]);
    return { unidades, tipos, lista };
  });
  const [unidadId, setUnidadId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [verMedia, setVerMedia] = useState<number | null>(null);

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { unidades, tipos, lista } = datos;
  const unidad = unidadId || String(unidades[0]?.id ?? "");
  const tipo = tipoId || String(tipos[0]?.id ?? "");

  async function enviarReporte() {
    const { incidenciaId } = await api.incidencias.reportar.mutate({
      ambito: "unidad",
      inmuebleId: Number(unidad),
      tipoIncidenciaId: Number(tipo),
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
    });
    for (const archivo of archivos) {
      const subida = await api.archivos.solicitarSubidaIncidencia.mutate({
        incidenciaId, nombre: archivo.name,
        mime: archivo.type as "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "video/mp4" | "video/quicktime" | "video/webm",
        bytes: archivo.size,
      });
      const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
      if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}. El reporte ya quedó registrado; probá subirlo de nuevo.`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="¿Todo bien?"
        nota="Una fuga, una falla eléctrica, algo que se dañó. Tu arrendador lo recibe y le hace seguimiento."
        accion={unidades.length > 0
          ? <button className="boton" onClick={() => setAbierto((v) => !v)}>{abierto ? "Cancelar" : "Nuevo reporte"}</button>
          : undefined}
      />
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {abierto && (
        <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
          {unidades.length > 1 && (
            <Campo etiqueta="Unidad">
              <select value={unidad} onChange={(e) => setUnidadId(e.target.value)}>
                {unidades.map((u) => <option key={u.id} value={u.id}>{nombreUnidad(u)}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Qué pasó">
            <select value={tipo} onChange={(e) => setTipoId(e.target.value)}>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Resumen">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Fuga en el lavamanos del baño" />
          </Campo>
          <Campo etiqueta="Detalle">
            <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Contá qué pasó, desde cuándo y qué tan grave es" />
          </Campo>
          <Campo etiqueta="Fotos o videos" ayuda="Opcional · una o varias">
            <input type="file" accept={ACEPTA_MEDIA} multiple
              onChange={(e) => setArchivos(e.target.files ? Array.from(e.target.files) : [])} />
            {archivos.length > 0 && (
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--tinta-2)" }}>
                {archivos.length} {archivos.length === 1 ? "archivo elegido" : "archivos elegidos"}
              </p>
            )}
          </Campo>
          <div>
            <button className="boton"
              disabled={ocupado === "nuevo" || titulo.trim().length < 4 || descripcion.trim().length < 4}
              onClick={() => void accion("nuevo", enviarReporte,
                "Reporte enviado. Tu arrendador ya lo puede ver.",
              ).then(() => { setAbierto(false); setTitulo(""); setDescripcion(""); setArchivos([]); })}>
              {ocupado === "nuevo" ? "Enviando…" : "Enviar reporte"}
            </button>
          </div>
        </section>
      )}

      {lista.total === 0 ? (
        <Vacio titulo="No tenés reportes">Si algo se daña, contanos con «Nuevo reporte».</Vacio>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {lista.incidencias.map((i) => {
            const e = ESTADO[i.estado] ?? { texto: i.estado, clase: "borrador" };
            return (
              <article key={i.id} className="tarjeta" style={{
                padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{i.titulo}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {i.tipo ?? "Sin tipo"} · {new Date(i.reportadaAt).toLocaleDateString("es-CO")}
                  </div>
                </div>
                <span className={`pastilla ${e.clase}`}>{e.texto}</span>
                <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
                  onClick={() => setVerMedia(verMedia === i.id ? null : i.id)}>
                  {verMedia === i.id ? "Cerrar" : "Fotos y videos"}
                </button>
                {verMedia === i.id && <MediaIncidencia incidenciaId={i.id} />}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Las fotos y videos que se adjuntaron a esta incidencia. */
function MediaIncidencia({ incidenciaId }: { incidenciaId: number }) {
  const { datos, error } = usePantalla(() => api.archivos.mediaDeIncidencia.query({ incidenciaId }));

  if (error) return <div className="aviso malo" role="alert" style={{ flexBasis: "100%" }}>{error}</div>;
  if (datos === null) return <p style={{ flexBasis: "100%", margin: 0, fontSize: 13, color: "var(--tinta-3)" }}>Cargando…</p>;
  if (datos.length === 0) {
    return <p style={{ flexBasis: "100%", margin: 0, fontSize: 13, color: "var(--tinta-3)" }}>No se adjuntó nada.</p>;
  }

  return (
    <div style={{ flexBasis: "100%", display: "flex", gap: 8, flexWrap: "wrap" }}>
      {datos.map((m) => (
        <button key={m.id} type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
          disabled={m.archivoId === null}
          onClick={() => m.archivoId !== null && abrirArchivo(m.archivoId)}>
          {m.mime.startsWith("video/") ? "▶ " : "🖼 "}{m.nombre}
        </button>
      ))}
    </div>
  );
}
