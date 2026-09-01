import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { etiqueta } from "../../lib/etiquetas";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

/**
 * Lo que el propietario le paga a Yalqui.
 *
 * Es el otro flujo de dinero, el que nunca se mezcla con el arriendo: acá el
 * propietario paga y Yalqui cobra. La suscripción va por inmueble porque es
 * cada unidad la que usa el servicio, no la cuenta.
 */
export function Plan() {
  const { datos, error, aviso, ocupado, accion } = usePantalla(async () => {
    const [mio, planes, servicios] = await Promise.all([
      api.plan.mio.query(),
      api.plan.disponibles.query(),
      api.plan.servicios.query(),
    ]);
    return { mio, planes, servicios };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { mio, planes, servicios } = datos;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mi plan Yalqui"
        nota="La suscripción se cobra por inmueble. En Básico, que es gratis, igual podés comprar servicios a la carta."
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <Cifras>
        <Cifra titulo="Le pagás a Yalqui" valor={pesos(mio.totalMes)} pie="al mes, por todo el portafolio" />
        <Cifra titulo="Unidades" valor={String(mio.unidades.length)} />
      </Cifras>

      {mio.unidades.length === 0 ? (
        <Vacio titulo="Todavía no tenés unidades">
          El plan se contrata por inmueble, así que primero hay que registrar uno.
        </Vacio>
      ) : (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Por unidad</h2>

          {mio.unidades.map((u) => (
            <div key={u.inmuebleId} style={{
              padding: "13px 15px", borderRadius: 10, border: "1px solid var(--linea)",
              display: "grid", gap: 9,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {u.direccion}{u.complemento ? `, ${u.complemento}` : ""}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    Plan {u.plan}
                    {u.planCodigo === "basico" && " · gratis"}
                    {u.proximaFacturacionAt && ` · próximo cobro ${new Date(u.proximaFacturacionAt).toLocaleDateString("es-CO")}`}
                  </div>
                </div>
                <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>
                  {pesos(u.totalMes)}
                </div>
              </div>

              {u.servicios.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {u.servicios.map((s) => (
                    <span key={s.id} style={{
                      fontSize: 12.5, background: "var(--violeta-tenue)", color: "var(--violeta-hondo)",
                      borderRadius: 999, padding: "3px 10px", fontWeight: 600,
                    }}>
                      {s.servicio}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {servicios
                  .filter((s) => !u.servicios.some((c) => c.servicio === s.nombre))
                  .map((s) => (
                    <button
                      key={s.id}
                      className="boton fantasma"
                      style={{ height: 32, fontSize: 12.5, padding: "0 11px" }}
                      disabled={ocupado === `${u.inmuebleId}-${s.id}`}
                      onClick={() => void accion(`${u.inmuebleId}-${s.id}`,
                        () => api.plan.contratarServicio.mutate({
                          inmuebleId: u.inmuebleId, servicioId: s.id,
                        }),
                        `${s.nombre} solicitado. Yalqui lo activa.`)}
                    >
                      + {s.nombre}
                      {s.precioBase !== null && Number(s.precioBase) > 0 && (
                        <span className="num" style={{ color: "var(--tinta-3)" }}>
                          {" "}{pesos(Number(s.precioBase))}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Los planes</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            Cambiar de plan todavía no se hace desde acá: la facturación de suscripciones
            está sin construir. Los precios son los vigentes.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          {planes.map((p) => (
            <div key={p.id} style={{
              padding: "14px 16px", borderRadius: 10, border: "1px solid var(--linea)",
            }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.nombre}</div>
              <div className="num" style={{
                fontFamily: '"Kufam",sans-serif', fontSize: 21, fontWeight: 600, marginTop: 4,
              }}>
                {Number(p.precioMes) === 0 ? "Gratis" : pesos(Number(p.precioMes))}
              </div>
              {p.descripcion && (
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 5 }}>{p.descripcion}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 10 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Servicios a la carta</h2>
        {servicios.map((s) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            paddingBottom: 9, borderBottom: "1px solid var(--linea)",
          }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.nombre}</div>
              {s.descripcion && (
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 1 }}>{s.descripcion}</div>
              )}
            </div>
            <span style={{ fontSize: 12.5, color: "var(--tinta-3)" }}>
              {etiqueta("modeloCobro", s.modeloCobro)}
            </span>
            <span className="num" style={{ fontSize: 14, fontWeight: 600, width: 120, textAlign: "right" }}>
              {s.precioBase !== null && Number(s.precioBase) > 0
                ? pesos(Number(s.precioBase))
                : s.porcentaje !== null ? `${Number(s.porcentaje)}%` : "A convenir"}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
