import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { etiqueta } from "../../lib/etiquetas";
import { Seccion } from "./piezas";

type Plantilla = Awaited<ReturnType<typeof api.admin.operativos.plantillas.query>>[number];

/**
 * Las plantillas de contrato.
 *
 * Se editan como texto porque eso es lo que son. Los marcadores entre llaves se
 * reemplazan al generar: escribir mal uno no rompe nada, simplemente queda el
 * literal en el contrato — así que se listan a la vista.
 */
export function Plantillas({ avisar }: { avisar: (m: string) => void }) {
  const [filas, setFilas] = useState<Plantilla[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState("");

  const cargar = useCallback(async () => {
    try { setFilas(await api.admin.operativos.plantillas.query()); setError(null); }
    catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(id: number, fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(id);
    setError(null);
    try { await fn(); avisar(mensaje); await cargar(); }
    catch (e) { setError(mensajeDeError(e)); }
    finally { setOcupado(null); }
  }

  if (error && filas === null) return <div className="aviso malo" role="alert">{error}</div>;
  if (filas === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <Seccion
      titulo="Plantillas de contrato"
      nota="Al generar un contrato se elige la plantilla vigente del marco legal que le corresponde a la unidad. Solo puede haber una vigente por marco: con dos, el contrato dependería de cuál devuelva primero la base."
    >
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div className="aviso ojo">
        Están redactadas a partir de la Ley 820 de 2003 y el Código Civil, pero
        <strong> no las revisó un abogado</strong>. Antes de usarlas con un arriendo real,
        hacelas revisar.
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {filas.map((p) => {
          const abierta = editando === p.id;
          return (
            <article key={p.id} style={{
              border: "1px solid var(--linea)", borderRadius: 11, padding: "15px 17px",
              display: "grid", gap: 11, opacity: p.estado === "vigente" ? 1 : 0.6,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {etiqueta("marcoLegal", p.marcoLegal)} · versión{" "}
                    <span className="num">{p.version}</span> ·{" "}
                    <span className="num">{p.codigo}</span>
                  </div>
                </div>

                <span className={`pastilla ${p.estado === "vigente" ? "arrendado" : "borrador"}`}>
                  {p.estado === "vigente" ? "Vigente" : p.estado === "archivada" ? "Archivada" : "Borrador"}
                </span>

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="boton fantasma" style={BOTON}
                    onClick={() => {
                      setEditando(abierta ? null : p.id);
                      setBorrador(p.cuerpo);
                    }}>
                    {abierta ? "Cerrar" : "Ver y editar"}
                  </button>
                  <button
                    className={p.estado === "vigente" ? "boton riesgo" : "boton"}
                    style={BOTON}
                    disabled={ocupado === p.id}
                    onClick={() => void accion(p.id,
                      () => api.admin.operativos.activarPlantilla.mutate({
                        plantillaId: p.id, vigente: p.estado !== "vigente",
                      }),
                      p.estado === "vigente" ? "Plantilla archivada" : "Plantilla en vigencia")}>
                    {ocupado === p.id ? "…" : p.estado === "vigente" ? "Archivar" : "Poner en vigencia"}
                  </button>
                </div>
              </div>

              {abierta && (
                <div style={{ display: "grid", gap: 10 }}>
                  <textarea
                    aria-label={`Cuerpo de ${p.nombre}`}
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    rows={18}
                    style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.6 }}
                  />

                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>
                    Marcadores disponibles:{" "}
                    <span className="num">
                      {"{{arrendador}} {{arrendatario}} {{documento_arrendador}} {{documento_arrendatario}} "}
                      {"{{direccion}} {{ciudad}} {{canon}} {{canon_letras}} {{dia_pago}} "}
                      {"{{fecha_inicio}} {{fecha_fin}} {{meses}} {{incremento}} {{garantia}} {{ajustes}}"}
                    </span>
                  </div>

                  {p.estado === "vigente" && borrador !== p.cuerpo && (
                    <div className="aviso ojo">
                      Guardar sube la versión a <strong className="num">{p.version + 1}</strong>. Los contratos
                      ya firmados guardan con qué versión se firmaron, así que siguen mostrando su texto.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                      disabled={ocupado === p.id || borrador === p.cuerpo || borrador.trim().length < 50}
                      onClick={() => void accion(p.id,
                        () => api.admin.operativos.editarPlantilla.mutate({
                          plantillaId: p.id, cuerpo: borrador,
                        }),
                        "Plantilla guardada").then(() => setEditando(null))}>
                      {ocupado === p.id ? "…" : "Guardar"}
                    </button>
                    <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                      onClick={() => setBorrador(p.cuerpo)}
                      disabled={borrador === p.cuerpo}>
                      Descartar cambios
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Seccion>
  );
}

const BOTON = { height: 34, fontSize: 13, padding: "0 12px" } as const;
