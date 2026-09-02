import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { etiqueta } from "../../lib/etiquetas";
import { Seccion, Tabla, Celda } from "./piezas";
import { CatalogoEditable, Entrada, type CampoCatalogo } from "./CatalogoEditable";
import { FormularioRegistro } from "./FormularioRegistro";

type Requisito = Awaited<ReturnType<typeof api.admin.operativos.requisitos.query>>[number];
type TipoDocumento = Awaited<ReturnType<typeof api.admin.operativos.documentos.query>>[number];

/**
 * Requisitos y tipos de documento, en la misma pantalla.
 *
 * Van juntos porque son las dos mitades de una sola pregunta: qué hay que
 * demostrar, y con qué se demuestra. Verlos separados obliga a recordar de
 * memoria qué documento existe mientras se arma un requisito.
 */
export function Requisitos({ avisar }: { avisar: (m: string) => void }) {
  const [requisitos, setRequisitos] = useState<Requisito[] | null>(null);
  const [documentos, setDocumentos] = useState<TipoDocumento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [agregando, setAgregando] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Record<string, unknown>>({});

  const cargar = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([
        api.admin.operativos.requisitos.query(),
        api.admin.operativos.documentos.query(),
      ]);
      setRequisitos(r); setDocumentos(d); setError(null);
    } catch (e) { setError(mensajeDeError(e)); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setError(null);
    try { await fn(); avisar(mensaje); await cargar(); }
    catch (e) { setError(mensajeDeError(e)); }
    finally { setOcupado(false); }
  }

  // El código solo hace falta al crear — `editarRequisito` no lo acepta, es la
  // llave con la que ya quedó identificado — así que se busca por clave y no
  // por posición: agregarlo acá no debe correr el resto de los índices que usa
  // la edición en línea más abajo.
  const camposRequisito: CampoCatalogo[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto", editable: false },
    { clave: "nombre", titulo: "Requisito", tipo: "texto" },
    { clave: "descripcion", titulo: "Descripción", tipo: "texto", opcional: true },
    { clave: "aplicaA", titulo: "Aplica a", tipo: "seleccion", diccionario: "aplicaA" },
    { clave: "modo", titulo: "Se cumple con", tipo: "seleccion", diccionario: "modoRequisito" },
    { clave: "obligatorio", titulo: "Obligatorio", tipo: "booleano" },
  ];
  const campoDe = (clave: string) => camposRequisito.find((c) => c.clave === clave)!;

  const camposDocumento: CampoCatalogo[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 190 },
    {
      clave: "nombre", titulo: "Documento", tipo: "texto",
      detalle: (f) => (f["descripcion"] as string | null) ?? null,
    },
    { clave: "vigenciaDias", titulo: "Vigencia (días)", tipo: "numero", ancho: 140, opcional: true },
    { clave: "formatos", titulo: "Formatos", tipo: "texto", ancho: 150, opcional: true },
    { clave: "tamanoMaxMb", titulo: "Máx. MB", tipo: "numero", ancho: 100, opcional: true },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <Seccion
        titulo="Requisitos"
        nota="Un requisito es lo que hay que demostrar; un documento es con qué se demuestra. Casi nunca hay un solo camino: demostrar ingresos lo resuelve un certificado laboral, o tres extractos, o una declaración de renta, según de qué viva la persona. Pedir siempre los tres es lo que vuelve trámite arrendar."
      >
        <FormularioRegistro
          titulo="Registrar requisito"
          ocupado={ocupado}
          campos={camposRequisito}
          alRegistrar={(v) => accion(
            () => api.admin.operativos.crearRequisito.mutate(v as never),
            "Requisito registrado",
          )}
        />

        {requisitos === null || documentos === null ? (
          <p style={{ color: "var(--tinta-2)", padding: "4px 0 14px" }}>Cargando…</p>
        ) : (
          <Tabla columnas={["Requisito", "Aplica a", "Se cumple con", "Documentos que lo soportan", "Acciones"]}>
            {requisitos.map((r) => {
              const enEdicion = editando === r.id;
              return (
              <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.5 }}>
                {enEdicion ? (
                  <>
                    <Celda>
                      <div style={{ display: "grid", gap: 6 }}>
                        <Entrada campo={campoDe("nombre")} valor={borrador["nombre"]}
                          alCambiar={(v) => setBorrador((b) => ({ ...b, nombre: v }))} />
                        <Entrada campo={campoDe("descripcion")} valor={borrador["descripcion"]}
                          alCambiar={(v) => setBorrador((b) => ({ ...b, descripcion: v }))} />
                      </div>
                    </Celda>
                    <Celda ancho={140}>
                      <Entrada campo={campoDe("aplicaA")} valor={borrador["aplicaA"]}
                        alCambiar={(v) => setBorrador((b) => ({ ...b, aplicaA: v }))} />
                    </Celda>
                    <Celda ancho={160}>
                      <Entrada campo={campoDe("modo")} valor={borrador["modo"]}
                        alCambiar={(v) => setBorrador((b) => ({ ...b, modo: v }))} />
                    </Celda>
                  </>
                ) : (
                  <>
                    <Celda>
                      <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                      {r.descripcion && (
                        <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2, maxWidth: 330 }}>
                          {r.descripcion}
                        </div>
                      )}
                      {!r.obligatorio && (
                        <div style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 2 }}>opcional</div>
                      )}
                    </Celda>
                    <Celda ancho={120}>{etiqueta("aplicaA", r.aplicaA)}</Celda>
                    <Celda ancho={150}>{etiqueta("modoRequisito", r.modo)}</Celda>
                  </>
                )}

                <Celda>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                    {r.documentos.length === 0 && (
                      <span style={{ fontSize: 13, color: "var(--tinta-3)" }}>
                        Sin documentos: nadie puede cumplirlo todavía.
                      </span>
                    )}
                    {r.documentos.map((d) => (
                      <span key={d.vinculoId} style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5,
                        background: "var(--papel-2)", border: "1px solid var(--linea)",
                        borderRadius: 999, padding: "3px 6px 3px 10px",
                      }}>
                        {d.documento}
                        <button
                          aria-label={`Quitar ${d.documento}`}
                          disabled={ocupado}
                          onClick={() => void accion(
                            () => api.admin.operativos.desvincularDocumento.mutate({ vinculoId: d.vinculoId }),
                            "Documento desvinculado",
                          )}
                          style={{
                            border: "none", background: "none", cursor: "pointer", fontSize: 15,
                            lineHeight: 1, color: "var(--tinta-3)", padding: "0 2px",
                          }}
                        >×</button>
                      </span>
                    ))}
                  </div>

                  {agregando === r.id ? (
                    <select
                      autoFocus
                      defaultValue=""
                      disabled={ocupado}
                      onChange={(e) => {
                        const tipoDocumentoId = Number(e.target.value);
                        setAgregando(null);
                        if (tipoDocumentoId > 0) {
                          void accion(
                            () => api.admin.operativos.vincularDocumento.mutate({
                              requisitoId: r.id, tipoDocumentoId,
                            }),
                            "Documento vinculado",
                          );
                        }
                      }}
                      style={{ maxWidth: 260 }}
                    >
                      <option value="">Elegí un documento…</option>
                      {documentos
                        .filter((d) => d.activo && !r.documentos.some((v) => v.tipoDocumentoId === d.id))
                        .map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  ) : (
                    <button className="boton fantasma" style={{ height: 30, fontSize: 12.5, padding: "0 10px" }}
                      onClick={() => setAgregando(r.id)}>
                      Agregar documento
                    </button>
                  )}
                </Celda>

                <Celda ancho={190}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {enEdicion ? (
                      <>
                        <button className="boton" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                          disabled={ocupado}
                          onClick={() => void accion(
                            () => api.admin.operativos.editarRequisito.mutate({
                              requisitoId: r.id,
                              nombre: String(borrador["nombre"] ?? r.nombre),
                              descripcion: String(borrador["descripcion"] ?? r.descripcion ?? ""),
                              aplicaA: borrador["aplicaA"] as never ?? r.aplicaA,
                              modo: borrador["modo"] as never ?? r.modo,
                            }),
                            "Requisito actualizado",
                          ).then(() => setEditando(null))}>
                          Guardar
                        </button>
                        <button className="boton fantasma" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                          onClick={() => setEditando(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button className="boton fantasma" style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                        onClick={() => {
                          setEditando(r.id);
                          setBorrador({ nombre: r.nombre, descripcion: r.descripcion ?? "", aplicaA: r.aplicaA, modo: r.modo });
                        }}>
                        Editar
                      </button>
                    )}
                    <button
                      className={r.activo ? "boton riesgo" : "boton"}
                      style={{ height: 32, fontSize: 13, padding: "0 11px" }}
                      disabled={ocupado}
                      onClick={() => void accion(
                        () => api.admin.operativos.anular.mutate({
                          catalogo: "requisito", id: r.id, activo: !r.activo,
                        }),
                        r.activo ? "Requisito anulado" : "Requisito reactivado",
                      )}
                    >
                      {r.activo ? "Anular" : "Reactivar"}
                    </button>
                  </div>
                </Celda>
              </tr>
              );
            })}
          </Tabla>
        )}
      </Seccion>

      <Seccion
        titulo="Tipos de documento"
        nota="La vigencia en días es lo que impide aceptar un certificado laboral de hace ocho meses como prueba del presente. Vacío es un documento que no caduca, como la cédula."
      >
        <FormularioRegistro
          titulo="Registrar documento"
          ocupado={ocupado}
          campos={camposDocumento}
          alRegistrar={(v) => accion(
            () => api.admin.operativos.crearDocumento.mutate(v as never),
            "Documento registrado",
          )}
        />

        {documentos && (
          <CatalogoEditable
            filas={documentos}
            campos={camposDocumento}
            ocupado={ocupado}
            alGuardar={(id, cambios) => accion(
              () => api.admin.operativos.editarDocumento.mutate({ documentoId: id, ...cambios }),
              "Documento actualizado",
            )}
            alAnular={(id, activo) => accion(
              () => api.admin.operativos.anular.mutate({ catalogo: "documento", id, activo }),
              activo ? "Documento reactivado" : "Documento anulado",
            )}
          />
        )}
      </Seccion>
    </div>
  );
}
