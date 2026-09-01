import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { etiqueta } from "../../lib/etiquetas";
import { Campo } from "../../componentes/Campo";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "pausado" },
  asignada: { texto: "Asignada", clase: "publicado" },
  en_progreso: { texto: "En progreso", clase: "publicado" },
  espera_aprobacion: { texto: "Espera tu aprobación", clase: "pausado" },
  resuelta: { texto: "Resuelta", clase: "arrendado" },
  cerrada: { texto: "Cerrada", clase: "borrador" },
  rechazada: { texto: "Rechazada", clase: "mora" },
};

/** El siguiente paso natural de cada estado. Evita un menú de siete opciones
 *  donde casi siempre solo una tiene sentido. */
const SIGUIENTE: Record<string, { estado: keyof typeof ESTADO; texto: string }> = {
  abierta: { estado: "en_progreso", texto: "Marcar en progreso" },
  asignada: { estado: "en_progreso", texto: "Marcar en progreso" },
  en_progreso: { estado: "resuelta", texto: "Marcar resuelta" },
  espera_aprobacion: { estado: "resuelta", texto: "Aprobar y resolver" },
  resuelta: { estado: "cerrada", texto: "Cerrar" },
};

export function Incidencias({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [abriendo, setAbriendo] = useState(false);
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [lista, tipos] = await Promise.all([
      api.incidencias.mias.query({}),
      api.incidencias.tipos.query(),
    ]);
    return { lista, tipos };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { lista, tipos } = datos;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Incidencias"
        nota="Lo que se rompe y quién lo paga. El vencimiento sale de las horas de atención del tipo, que se configuran en la administración."
        accion={
          <button className="boton" onClick={() => setAbriendo((v) => !v)}>
            {abriendo ? "Cancelar" : "Reportar algo"}
          </button>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {abriendo && (
        <Formulario
          unidades={unidades}
          tipos={tipos}
          ocupado={ocupado === "nueva"}
          alReportar={(entrada) => void accion("nueva",
            () => api.incidencias.reportar.mutate(entrada),
            "Incidencia reportada.").then(() => setAbriendo(false))}
        />
      )}

      <Cifras>
        <Cifra titulo="Abiertas" valor={String(lista.abiertas)}
          tono={lista.abiertas > 0 ? "ojo" : "bien"} />
        <Cifra titulo="Vencidas" valor={String(lista.incidencias.filter((i) => i.vencida).length)}
          tono={lista.incidencias.some((i) => i.vencida) ? "mal" : "normal"} />
        <Cifra titulo="Costo a tu cargo" valor={pesos(lista.costoAcumulado)}
          pie="Solo lo que asumís vos, no lo del inquilino ni la copropiedad" />
      </Cifras>

      {lista.total === 0 ? (
        <Vacio titulo="Nada roto por ahora">
          Cuando algo falle, reportalo acá. El tipo que elijas define la prioridad,
          el plazo de atención y quién asume el costo por defecto.
        </Vacio>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {lista.incidencias.map((i) => {
            const e = ESTADO[i.estado] ?? { texto: i.estado, clase: "borrador" };
            const paso = SIGUIENTE[i.estado];
            return (
              <article key={i.id} className="tarjeta" style={{
                padding: "15px 18px", display: "grid", gap: 10,
                ...(i.vencida ? { borderLeft: "4px solid var(--mal)" } : {}),
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600 }}>{i.titulo}</div>
                    <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 2 }}>
                      {i.tipo ?? "Sin tipo"} · {i.direccion}{i.complemento ? `, ${i.complemento}` : ""}
                      {" · "}{etiqueta("prioridad", i.prioridad)}
                    </div>
                    {i.descripcion && (
                      <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 4 }}>{i.descripcion}</div>
                    )}
                    <div style={{ fontSize: 12.5, color: i.vencida ? "var(--mal)" : "var(--tinta-3)", marginTop: 4 }}>
                      Lo asume: {etiqueta("responsable", i.responsableCosto)}
                      {i.slaVenceAt && ` · ${i.vencida ? "venció" : "vence"} el ${new Date(i.slaVenceAt).toLocaleDateString("es-CO")}`}
                    </div>
                  </div>

                  <span className={`pastilla ${e.clase}`}>{e.texto}</span>

                  {(i.costoFinal ?? i.costoEstimado) !== null && (
                    <div style={{ width: 140, textAlign: "right" }}>
                      <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
                        {pesos(Number(i.costoFinal ?? i.costoEstimado))}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>
                        {i.costoFinal !== null ? "costo final" : "estimado"}
                      </div>
                    </div>
                  )}
                </div>

                {paso && (
                  <div>
                    <button className="boton fantasma" style={{ height: 36, fontSize: 13.5 }}
                      disabled={ocupado === i.id}
                      onClick={() => void accion(i.id,
                        () => api.incidencias.cambiarEstado.mutate({
                          incidenciaId: i.id, estado: paso.estado as "resuelta",
                        }),
                        `${i.titulo}: ${paso.texto.toLowerCase()}`)}>
                      {ocupado === i.id ? "…" : paso.texto}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Formulario({ unidades, tipos, ocupado, alReportar }: {
  unidades: Array<{ id: number; titulo: string }>;
  tipos: Awaited<ReturnType<typeof api.incidencias.tipos.query>>;
  ocupado: boolean;
  alReportar: (e: { inmuebleId: number; tipoIncidenciaId: number; titulo: string; descripcion?: string }) => void;
}) {
  const [inmuebleId, setInmuebleId] = useState(String(unidades[0]?.id ?? ""));
  const [tipoId, setTipoId] = useState(String(tipos[0]?.id ?? ""));
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const tipo = tipos.find((t) => String(t.id) === tipoId);

  if (unidades.length === 0) {
    return <div className="aviso ojo">Registrá una unidad antes de reportar una incidencia.</div>;
  }

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Reportar una incidencia</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <Campo etiqueta="Unidad">
          <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo"
          ayuda={tipo?.slaHoras ? `Se atiende en ${tipo.slaHoras} horas` : undefined}>
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Campo>
      </div>

      <Campo etiqueta="Qué pasó">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
          placeholder="Fuga bajo el lavaplatos" />
      </Campo>

      <Campo etiqueta="Detalle" ayuda="Opcional">
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>

      {tipo && (
        <div className="aviso ojo">
          Por defecto lo asume: <strong>{etiqueta("responsable", tipo.responsableSugerido)}</strong>.
          Prioridad {etiqueta("prioridad", tipo.prioridadSugerida).toLowerCase()}.
        </div>
      )}

      <div>
        <button className="boton" disabled={ocupado || titulo.trim().length < 4}
          onClick={() => alReportar({
            inmuebleId: Number(inmuebleId),
            tipoIncidenciaId: Number(tipoId),
            titulo: titulo.trim(),
            ...(descripcion.trim() === "" ? {} : { descripcion: descripcion.trim() }),
          })}>
          {ocupado ? "Reportando…" : "Reportar"}
        </button>
      </div>
    </section>
  );
}
