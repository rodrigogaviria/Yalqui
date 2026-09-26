import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

/** Cuánto le pesa el canon sobre sus ingresos, del más cómodo al que no da. */
const NIVEL: Record<string, { texto: string; clase: string }> = {
  holgado: { texto: "Holgado", clase: "arrendado" },
  ajustado: { texto: "Ajustado", clase: "publicado" },
  al_limite: { texto: "Al límite", clase: "pausado" },
  no_alcanza: { texto: "No alcanza", clase: "mora" },
};

const ESTADO: Record<string, string> = {
  borrador: "Borrador", enviada: "Enviada", en_verificacion: "En verificación",
  en_negociacion: "En negociación", aprobada: "Aprobada", rechazada: "Rechazada",
  retirada: "Retirada", convertida: "Convertida en contrato",
};

const NIVEL_SCORE: Record<string, { texto: string; clase: string }> = {
  excelente: { texto: "Excelente", clase: "arrendado" },
  bueno: { texto: "Bueno", clase: "publicado" },
  regular: { texto: "Regular", clase: "pausado" },
  riesgo: { texto: "Riesgo", clase: "mora" },
  critico: { texto: "Crítico", clase: "mora" },
};

/** El score de la persona, con cada dimensión a la vista al pasar el cursor.
 *  Sin historial en Yalqui es el punto de partida, y se dice. */
function Score({ score }: { score: NonNullable<Awaited<ReturnType<typeof api.aplicaciones.paraMi.query>>["aplicaciones"][number]["score"]> }) {
  const n = NIVEL_SCORE[score.nivel]!;
  const detalle = score.dimensiones.map((d) => `${d.nombre}: ${d.puntaje}`).join("\n");
  return (
    <div style={{ textAlign: "center", minWidth: 84 }}
      title={`${detalle}\n${score.sinHistorial ? "Sin historial en Yalqui: es el puntaje de partida." : `${score.eventos} hecho${score.eventos === 1 ? "" : "s"} registrados.`}`}>
      <div style={{ fontSize: 11.5, color: "var(--tinta-3)" }}>Score</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{score.puntaje}</div>
      <span className={`pastilla ${n.clase}`} style={{ fontSize: 11 }}>{n.texto}</span>
      {score.sinHistorial && (
        <div style={{ fontSize: 10.5, color: "var(--tinta-3)", marginTop: 2 }}>sin historial</div>
      )}
    </div>
  );
}

/**
 * Quién quiere arrendar, y qué tan bien le da la plata.
 *
 * La precalificación viene primero porque es lo que decide: un candidato cuyo
 * canon supera la mitad de sus ingresos no se sostiene, por simpático que sea.
 */
export function Aplicaciones() {
  const { datos, error, aviso, ocupado, accion } =
    usePantalla(() => api.aplicaciones.paraMi.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const abiertas = datos.aplicaciones.filter(
    (a) => a.estado === "enviada" || a.estado === "en_verificacion" || a.estado === "en_negociacion",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Interesados"
        nota="Quién quiere arrendar tus unidades. El canon ofrecido lo calcula el servidor con los ajustes que configuraste, no lo escribe el candidato."
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <Cifras>
        <Cifra titulo="Sin resolver" valor={String(abiertas.length)}
          tono={abiertas.length > 0 ? "ojo" : "normal"} />
        <Cifra titulo="Con holgura" valor={String(datos.aplicaciones.filter((a) => a.nivel === "holgado").length)} tono="bien" />
        <Cifra titulo="En total" valor={String(datos.total)} />
      </Cifras>

      {datos.total === 0 ? (
        <Vacio titulo="Todavía no hay interesados">
          Llegan después de la visita: el sistema le manda a la persona un enlace para
          precalificarse, y si le da, queda como interesado en la unidad.
        </Vacio>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {datos.aplicaciones.map((a) => {
            const n = a.nivel === null ? null : NIVEL[a.nivel];
            const decidible = a.estado === "enviada" || a.estado === "en_verificacion";
            return (
              <article key={a.id} className="tarjeta" style={{ padding: "15px 18px", display: "grid", gap: 11 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600 }}>
                      {a.candidato} {a.candidatoApellido}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 2 }}>
                      {a.direccion}{a.complemento ? `, ${a.complemento}` : ""}
                      {" · "}{a.numOcupantes} {a.numOcupantes === 1 ? "persona" : "personas"}
                      {a.numMascotas > 0 && ` · ${a.numMascotas} mascota${a.numMascotas === 1 ? "" : "s"}`}
                    </div>
                  </div>

                  {a.score && <Score score={a.score} />}
                  {n && <span className={`pastilla ${n.clase}`}>{n.texto}</span>}
                  <span className="pastilla borrador">{ESTADO[a.estado] ?? a.estado}</span>

                  <div style={{ width: 150, textAlign: "right" }}>
                    <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>
                      {pesos(Number(a.canonOfrecido))}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>canon ofrecido</div>
                  </div>
                </div>

                {a.relacionPct !== null && (
                  <div style={{ fontSize: 13, color: "var(--tinta-2)" }}>
                    El canon es el <strong className="num">{Number(a.relacionPct).toFixed(1)}%</strong> de
                    sus ingresos demostrables.
                    {Number(a.relacionPct) > 50 && " Por encima del 50% no se sostiene sin codeudor."}
                  </div>
                )}

                {a.motivoRechazo && (
                  <div style={{ fontSize: 13, color: "var(--tinta-2)" }}>Motivo: {a.motivoRechazo}</div>
                )}

                {decidible && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                      disabled={ocupado === a.id}
                      onClick={() => void accion(a.id,
                        () => api.aplicaciones.decidir.mutate({
                          inmuebleId: a.inmuebleId, aplicacionId: a.id, decision: "aprobada",
                        }),
                        "Interesado aprobado. Ya podés generar el contrato.")}>
                      {ocupado === a.id ? "…" : "Aprobar"}
                    </button>
                    <button className="boton riesgo" style={{ height: 38, fontSize: 13.5 }}
                      disabled={ocupado === a.id}
                      onClick={() => void accion(a.id,
                        () => api.aplicaciones.decidir.mutate({
                          inmuebleId: a.inmuebleId, aplicacionId: a.id, decision: "rechazada",
                          motivo: "No se ajusta a lo que busco",
                        }),
                        "Interesado rechazado.")}>
                      Rechazar
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
