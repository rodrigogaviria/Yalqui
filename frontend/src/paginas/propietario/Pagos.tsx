import { useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { SubirPago } from "../../componentes/SubirPago";
import { Ventana } from "../../componentes/Ventana";
import { abrirArchivo } from "../../lib/archivos";
import { usePantalla, Encabezado, Cifra, Cifras } from "./comun";

type Factura = Awaited<ReturnType<typeof api.facturacion.misFacturas.query>>["facturas"][number];

/**
 * Los colores del calendario, que son la razón de ser de esta pantalla: se
 * entiende de un vistazo qué está vencido, qué está pago y qué todavía no llega.
 */
const TONO: Record<string, { fondo: string; borde: string; texto: string; nombre: string }> = {
  vencida:   { fondo: "var(--mal-tenue)",  borde: "#f7d3d3", texto: "#7d211d", nombre: "Vencida" },
  pagada:    { fondo: "var(--bien-tenue)", borde: "#bfe9d3", texto: "#0e3b24", nombre: "Pagada" },
  parcial:   { fondo: "#f6c343",           borde: "#d4a017", texto: "#4a3500", nombre: "Pago parcial" },
  porVencer: { fondo: "var(--ojo-tenue)",  borde: "#f2e2b2", texto: "#4a3405", nombre: "Por vencer" },
};

export function Pagos() {
  const [vista, setVista] = useState<"lista" | "calendario">("calendario");
  const [mes, setMes] = useState(() => ({ anio: new Date().getFullYear(), mes: new Date().getMonth() }));
  const [subiendo, setSubiendo] = useState<{ unidad: string; inmuebleId: number; fecha: string } | null>(null);
  const [editando, setEditando] = useState<PagoUnidad | null>(null);
  const [anulando, setAnulando] = useState<PagoUnidad | null>(null);
  const { datos, error, aviso, ocupado, accion, cargar, setAviso } = usePantalla(async () => {
    const [facturas, porVerificar, unidades, pagosUnidad] = await Promise.all([
      api.facturacion.misFacturas.query(),
      api.facturacion.porVerificar.query(),
      api.inmuebles.mias.query(),
      api.facturacion.misPagosUnidad.query(),
    ]);
    return { facturas, porVerificar, unidades: unidades.unidades, pagosUnidad };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  // `cuenta` y no `facturas` para que no quede `facturas.facturas` más abajo.
  const { facturas: cuenta, porVerificar, unidades, pagosUnidad } = datos;
  const delMes = resumenDelMes(unidades, cuenta.facturas, pagosUnidad, mes);
  const elegir = (u: Unidad, dia: number) => setSubiendo({
    unidad: `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`,
    inmuebleId: u.id,
    fecha: `${periodoDe(mes)}-${String(dia).padStart(2, "0")}`,
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Ingresos"
        nota="Yalqui no recauda: el arriendo va directo del inquilino a vos. Acá se lleva la trazabilidad del comprobante, y solo un pago verificado baja el saldo."
        accion={
          <div style={{ display: "flex", gap: 6 }}>
            {(["calendario", "lista"] as const).map((v) => (
              <button
                key={v}
                className={vista === v ? "boton" : "boton fantasma"}
                style={{ height: 38, fontSize: 13.5, padding: "0 13px" }}
                onClick={() => setVista(v)}
              >
                {v === "calendario" ? "Calendario" : "Lista"}
              </button>
            ))}
          </div>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <Cifras>
        <Cifra titulo="Total previsto" valor={pesos(delMes.previsto)} />
        <Cifra titulo="Pagado" valor={pesos(delMes.pagado)} tono={delMes.pagado > 0 ? "bien" : "normal"} />
        <Cifra titulo="Por cobrar" valor={pesos(delMes.porCobrar)} tono={delMes.porCobrar > 0 ? "ojo" : "normal"} />
        <Cifra titulo="Vencido" valor={pesos(delMes.vencido)} tono={delMes.vencido > 0 ? "mal" : "bien"} />
      </Cifras>

      {pagosUnidad.some((p) => p.estado === "pendiente") && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Pagos subidos por inquilinos</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
              Hasta que los confirmes no cuentan como pagados en el calendario.
            </p>
          </div>
          {pagosUnidad.filter((p) => p.estado === "pendiente").map((p) => {
            const u = unidades.find((x) => x.id === p.inmuebleId);
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                padding: "12px 14px", borderRadius: 10, border: "1px solid var(--linea)",
              }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {u ? `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}` : `Unidad ${p.inmuebleId}`}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    Pago del {new Date(p.fechaPago).toLocaleDateString("es-CO", { timeZone: "UTC" })} · {p.medio === "efectivo" ? "efectivo" : "transferencia"}
                    {p.monto !== null && ` · ${pesos(Number(p.monto))}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {p.comprobanteArchivoId !== null && (
                    <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                      onClick={() => abrirArchivo(p.comprobanteArchivoId!)}>
                      Ver comprobante
                    </button>
                  )}
                  <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                    disabled={ocupado === `pu-${p.id}`}
                    onClick={() => void accion(`pu-${p.id}`,
                      () => api.facturacion.decidirPagoUnidad.mutate({ pagoId: p.id, decision: "confirmado" }),
                      "Pago confirmado.")}>
                    Confirmar
                  </button>
                  <button className="boton riesgo" style={{ height: 38, fontSize: 13.5 }}
                    disabled={ocupado === `pu-${p.id}`}
                    onClick={() => {
                      const motivo = window.prompt("¿Por qué lo rechazás? Se lo mostramos al inquilino.");
                      if (motivo?.trim()) {
                        void accion(`pu-${p.id}`,
                          () => api.facturacion.decidirPagoUnidad.mutate({ pagoId: p.id, decision: "rechazado", motivo: motivo.trim() }),
                          "Pago rechazado.");
                      }
                    }}>
                    Rechazar
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {porVerificar.total > 0 && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Pagos reportados</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
              El inquilino dice que pagó. Hasta que lo verifiques, el saldo sigue en pie:
              un comprobante no es un pago hasta que vos lo confirmás.
            </p>
          </div>

          {porVerificar.pagos.map((p) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              padding: "12px 14px", borderRadius: 10, border: "1px solid var(--linea)",
            }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.direccion}</div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  Período {p.periodo} · reportado el {new Date(p.createdAt).toLocaleDateString("es-CO")}
                  {p.canal ? ` · ${p.canal}` : ""}
                </div>
              </div>
              <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(p.monto))}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {p.comprobanteArchivoId !== null && (
                  <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                    onClick={() => abrirArchivo(p.comprobanteArchivoId!)}>
                    Ver comprobante
                  </button>
                )}
                <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                  disabled={ocupado === p.id}
                  onClick={() => void accion(p.id,
                    () => api.facturacion.verificarPago.mutate({ pagoId: p.id, decision: "verificado" }),
                    "Pago verificado. El saldo bajó.")}>
                  {ocupado === p.id ? "…" : "Verificar"}
                </button>
                <button className="boton riesgo" style={{ height: 38, fontSize: 13.5 }}
                  disabled={ocupado === p.id}
                  onClick={() => void accion(p.id,
                    () => api.facturacion.verificarPago.mutate({ pagoId: p.id, decision: "rechazado" }),
                    "Pago rechazado.")}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {vista === "lista" && pagosUnidad.some((p) => p.estado !== "pendiente") && (
        <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Pagos registrados</h2>
          {pagosUnidad.filter((p) => p.estado !== "pendiente")
            .sort((a, b) => +new Date(b.fechaPago) - +new Date(a.fechaPago))
            .map((p) => {
              const u = unidades.find((x) => x.id === p.inmuebleId);
              const anulado = p.estado === "anulado";
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                  padding: "12px 14px", borderRadius: 10, border: "1px solid var(--linea)",
                  opacity: anulado ? 0.6 : 1,
                }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                      {u ? `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}` : `Unidad ${p.inmuebleId}`}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                      Pago del {new Date(p.fechaPago).toLocaleDateString("es-CO", { timeZone: "UTC" })} · {p.medio === "efectivo" ? "efectivo" : "transferencia"}
                      {p.monto !== null && ` · ${pesos(Number(p.monto))}`}
                      {anulado && p.motivoRechazo ? ` · Anulado: ${p.motivoRechazo}` : ""}
                      {p.estado === "rechazado" && p.motivoRechazo ? ` · Rechazado: ${p.motivoRechazo}` : ""}
                    </div>
                  </div>
                  <span className={`pastilla ${anulado ? "borrador" : p.estado === "rechazado" ? "mora" : "arrendado"}`}>
                    {anulado ? "Anulado" : p.estado === "rechazado" ? "Rechazado" : "Confirmado"}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {p.comprobanteArchivoId !== null && (
                      <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                        onClick={() => abrirArchivo(p.comprobanteArchivoId!)}>
                        Ver comprobante
                      </button>
                    )}
                    {!anulado && (
                      <>
                        <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                          onClick={() => setEditando(p)}>
                          Editar
                        </button>
                        <button className="boton riesgo" style={{ height: 38, fontSize: 13.5 }}
                          onClick={() => setAnulando(p)}>
                          Anular
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </section>
      )}

      {vista === "calendario" ? (
        <Calendario facturas={cuenta.facturas} unidades={unidades} pagosUnidad={pagosUnidad} mes={mes} setMes={setMes}
          alElegir={elegir} />
      ) : (
        <>
          <ListaMes facturas={cuenta.facturas} unidades={unidades} pagosUnidad={pagosUnidad} mes={mes} setMes={setMes}
            alElegir={elegir} />
          {cuenta.total > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0 }}>Facturas de contratos</h2>
              <Lista facturas={cuenta.facturas} accion={accion} ocupado={ocupado} />
            </div>
          )}
        </>
      )}

      {subiendo && (
        <Ventana titulo={`Subir pago · ${subiendo.unidad}`} alCerrar={() => setSubiendo(null)}>
          <SubirPago inmuebleId={subiendo.inmuebleId} fechaInicial={subiendo.fecha}
            alTerminar={(periodo) => {
              setSubiendo(null);
              setAviso(`Pago de ${subiendo.unidad} registrado (${periodo}).`);
              void cargar();
            }} />
        </Ventana>
      )}

      {editando && (
        <Ventana titulo="Editar pago" alCerrar={() => setEditando(null)}>
          <FormularioEditarPago pago={editando} alTerminar={() => {
            setEditando(null);
            setAviso("Pago actualizado.");
            void cargar();
          }} />
        </Ventana>
      )}

      {anulando && (
        <Ventana titulo="Anular pago" alCerrar={() => setAnulando(null)}>
          <FormularioAnularPago pago={anulando} alTerminar={() => {
            setAnulando(null);
            setAviso("Pago anulado.");
            void cargar();
          }} />
        </Ventana>
      )}
    </div>
  );
}

type Unidad = Awaited<ReturnType<typeof api.inmuebles.mias.query>>["unidades"][number];

/**
 * El mes en cuadrícula, con cada unidad arrendada puesta en su día previsto de
 * pago. Verde si el mes ya está pago, rojo si pasó el día más la gracia de la
 * unidad sin que haya un pago registrado, ámbar si todavía está a tiempo.
 */
type Mes = { anio: number; mes: number };

const periodoDe = (m: Mes) => `${m.anio}-${String(m.mes + 1).padStart(2, "0")}`;

/** Cada unidad arrendada en su día del mes, con su situación: la fuente de la
 *  cuadrícula y de los totales de arriba, para que nunca se contradigan. */
type PagoUnidad = Awaited<ReturnType<typeof api.facturacion.misPagosUnidad.query>>[number];

/** Si la unidad tiene fecha de inicio (o fin) de contrato, el mes solo cuenta
 *  dentro de ese rango: antes de empezar, o después de terminar, no hay pago
 *  previsto que mostrar. Sin fechas puestas, se usa el estado como hasta ahora. */
function dentroDelContrato(u: Unidad, m: Mes): boolean {
  const periodo = periodoDe(m);
  if (u.contratoFechaInicio && periodo < String(u.contratoFechaInicio).slice(0, 7)) return false;
  if (u.contratoFechaFin && periodo > String(u.contratoFechaFin).slice(0, 7)) return false;
  return true;
}

/** Lo que ya se pagó de la unidad en ese período: las facturas de contrato
 *  (total menos saldo) más los pagos directos confirmados. Un pago de antes
 *  de que existiera el monto —puro «sí o no»— cuenta como el canon completo,
 *  para no volver «parcial» lo que ya se había marcado como pago. */
function montoPagadoDelMes(u: Unidad, facturas: Factura[], pagos: PagoUnidad[], periodo: string): number {
  let total = 0;
  for (const f of facturas) {
    if (f.inmuebleId === u.id && f.periodo === periodo) total += Number(f.total) - Number(f.saldo);
  }
  for (const p of pagos) {
    if (p.inmuebleId === u.id && p.periodo === periodo && p.estado === "confirmado") {
      total += p.monto !== null ? Number(p.monto) : Number(u.canonBase);
    }
  }
  return total;
}

function situacionDelMes(unidades: Unidad[], facturas: Factura[], pagos: PagoUnidad[], m: Mes) {
  const hoy = new Date();
  const ultimo = new Date(m.anio, m.mes + 1, 0).getDate();
  const periodo = periodoDe(m);
  return unidades.filter((u) => u.estado === "arrendado" && dentroDelContrato(u, m)).map((u) => {
    const dia = Math.min(u.diaPago, ultimo);
    const previsto = Number(u.canonBase);
    const pagadoMonto = montoPagadoDelMes(u, facturas, pagos, periodo);
    const limite = new Date(m.anio, m.mes, dia + u.diasGracia, 23, 59, 59);
    const tono: keyof typeof TONO =
      pagadoMonto >= previsto ? "pagada"
      : pagadoMonto > 0 ? "parcial"
      : hoy > limite ? "vencida" : "porVencer";
    // Días corridos desde que venció el plazo (con gracia), solo tiene sentido si está vencida.
    const diasVencido = tono === "vencida" ? Math.floor((+hoy - +limite) / 86_400_000) : 0;
    return { u, dia, tono, diasVencido, pagadoMonto, previsto };
  });
}

function resumenDelMes(unidades: Unidad[], facturas: Factura[], pagos: PagoUnidad[], m: Mes) {
  const filas = situacionDelMes(unidades, facturas, pagos, m);
  const suma = (f: (t: keyof typeof TONO) => boolean) =>
    filas.filter((x) => f(x.tono)).reduce((t, x) => t + Number(x.u.canonBase), 0);
  return {
    previsto: suma(() => true),
    pagado: suma((t) => t === "pagada"),
    porCobrar: suma((t) => t !== "pagada"),
    vencido: suma((t) => t === "vencida"),
  };
}

function Calendario({ facturas, unidades, pagosUnidad, mes, setMes, alElegir }: {
  facturas: Factura[]; unidades: Unidad[]; pagosUnidad: PagoUnidad[]; mes: Mes; setMes: (m: Mes) => void;
  alElegir: (u: Unidad, dia: number) => void;
}) {
  const arrendadas = unidades.filter((u) => u.estado === "arrendado");
  const ultimo = new Date(mes.anio, mes.mes + 1, 0).getDate();
  const primerDiaSemana = (new Date(mes.anio, mes.mes, 1).getDay() + 6) % 7; // lunes = 0
  const periodo = periodoDe(mes);

  const porDia = new Map<number, Array<{
    u: Unidad; tono: keyof typeof TONO; diasVencido: number; pagadoMonto: number; previsto: number;
  }>>();
  for (const { u, dia, tono, diasVencido, pagadoMonto, previsto } of situacionDelMes(unidades, facturas, pagosUnidad, mes)) {
    porDia.set(dia, [...(porDia.get(dia) ?? []), { u, tono, diasVencido, pagadoMonto, previsto }]);
  }

  const celdas: Array<number | null> = [
    ...Array<null>(primerDiaSemana).fill(null),
    ...Array.from({ length: ultimo }, (_, i) => i + 1),
  ];
  const mover = (d: number) => {
    const f = new Date(mes.anio, mes.mes + d, 1);
    setMes({ anio: f.getFullYear(), mes: f.getMonth() });
  };

  return (
    <section className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="boton fantasma" style={{ height: 34, padding: "0 12px" }}
            aria-label="Mes anterior" onClick={() => mover(-1)}>←</button>
          <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0, minWidth: 150, textAlign: "center" }}>
            {nombreMes(periodo)}
          </h2>
          <button className="boton fantasma" style={{ height: 34, padding: "0 12px" }}
            aria-label="Mes siguiente" onClick={() => mover(1)}>→</button>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--tinta-2)" }}>
          {Object.entries(TONO).map(([k, t]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: k === "vencida" ? "var(--mal)" : t.fondo, border: `1px solid ${t.borde}` }} />
              {t.nombre}
            </span>
          ))}
        </div>
      </div>

      {arrendadas.length === 0 && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>
          Cuando haya unidades arrendadas, cada una aparece en su día previsto de pago.
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(92px, 1fr))", gap: 6, minWidth: 660 }}>
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} style={{ fontSize: 12, fontWeight: 600, color: "var(--tinta-3)", textAlign: "center" }}>{d}</div>
          ))}
          {celdas.map((dia, i) => (
            <div key={i} style={{
              minHeight: 78, borderRadius: 8, padding: 6,
              border: dia === null ? "none" : "1px solid var(--linea)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              {dia !== null && (
                <>
                  <span className="num" style={{ fontSize: 12, color: "var(--tinta-3)" }}>{dia}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(porDia.get(dia) ?? []).map(({ u, tono, diasVencido, pagadoMonto, previsto }) => {
                      const t = TONO[tono]!;
                      const titulo = [
                        `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`,
                        u.inquilino ?? "Sin inquilino registrado",
                        t.nombre,
                        tono === "parcial" ? `pagó ${pesos(pagadoMonto)} de ${pesos(previsto)}` : null,
                        tono === "vencida" ? `${diasVencido} día${diasVencido === 1 ? "" : "s"} de vencido` : null,
                        tono === "pagada" ? null : "tocá para subir el pago",
                      ].filter(Boolean).join(" · ");
                      return (
                        <button key={u.id} type="button"
                          disabled={tono === "pagada"}
                          onClick={() => alElegir(u, dia)}
                          title={titulo}
                          style={{
                            fontSize: 11.5, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
                            background: tono === "vencida" ? "var(--mal)" : t.fondo,
                            color: tono === "vencida" ? "#fff" : t.texto,
                            border: `1px solid ${t.borde}`, cursor: tono === "pagada" ? "default" : "pointer", fontFamily: "inherit",
                          }}>
                          {u.complemento || u.direccion}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


type Accion = (clave: number | string, fn: () => Promise<unknown>, mensaje: string) => Promise<void>;

/**
 * Las mismas entradas del calendario, en lista: cada unidad arrendada del mes
 * con su valor de arriendo y su estado. Las que faltan por pagar se pueden
 * pagar desde acá igual que desde el calendario.
 */
function ListaMes({ facturas, unidades, pagosUnidad, mes, setMes, alElegir }: {
  facturas: Factura[]; unidades: Unidad[]; pagosUnidad: PagoUnidad[]; mes: Mes; setMes: (m: Mes) => void;
  alElegir: (u: Unidad, dia: number) => void;
}) {
  const filas = situacionDelMes(unidades, facturas, pagosUnidad, mes)
    .sort((a, b) => a.dia - b.dia || (a.u.complemento ?? "").localeCompare(b.u.complemento ?? "", "es", { numeric: true }));
  const mover = (d: number) => {
    const f = new Date(mes.anio, mes.mes + d, 1);
    setMes({ anio: f.getFullYear(), mes: f.getMonth() });
  };

  return (
    <section className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="boton fantasma" style={{ height: 34, padding: "0 12px" }}
          aria-label="Mes anterior" onClick={() => mover(-1)}>←</button>
        <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0, minWidth: 150, textAlign: "center" }}>
          {nombreMes(periodoDe(mes))}
        </h2>
        <button className="boton fantasma" style={{ height: 34, padding: "0 12px" }}
          aria-label="Mes siguiente" onClick={() => mover(1)}>→</button>
      </div>

      {filas.length === 0 && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>
          Cuando haya unidades arrendadas, cada una aparece acá con su día de pago.
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {filas.map(({ u, dia, tono }) => {
          const t = TONO[tono]!;
          return (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              padding: "11px 14px", borderRadius: 10, border: "1px solid var(--linea)",
              borderLeft: `4px solid ${tono === "vencida" ? "var(--mal)" : t.borde}`,
            }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {u.direccion}{u.complemento ? `, ${u.complemento}` : ""}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  Paga el día {dia} · {u.diasGracia} días de gracia
                </div>
              </div>
              <div className="num" style={{ width: 130, textAlign: "right", fontSize: 15.5, fontWeight: 600 }}>
                {pesos(Number(u.canonBase))}
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, minWidth: 82, textAlign: "center",
                background: tono === "vencida" ? "var(--mal)" : t.fondo,
                color: tono === "vencida" ? "#fff" : t.texto, border: `1px solid ${t.borde}`,
              }}>
                {t.nombre}
              </span>
              {tono !== "pagada" ? (
                <button className="boton" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                  onClick={() => alElegir(u, dia)}>
                  Subir pago
                </button>
              ) : <span style={{ width: 96 }} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Lista({ facturas, accion, ocupado }: {
  facturas: Factura[]; accion: Accion; ocupado: number | string | null;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {facturas.map((f) => {
        const t = TONO[f.situacion] ?? TONO["porVencer"]!;
        return (
          <article key={f.id} className="tarjeta" style={{
            padding: "14px 17px", display: "grid", gap: 12,
            borderLeft: `4px solid ${t.borde}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {f.direccion}{f.complemento ? `, ${f.complemento}` : ""}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  {nombreMes(f.periodo)} · vence el {new Date(f.fechaVencimiento).toLocaleDateString("es-CO", { timeZone: "UTC" })}
                </div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 999,
                background: t.fondo, color: t.texto, border: `1px solid ${t.borde}`,
              }}>
                {t.nombre}
              </span>
              <div style={{ width: 140, textAlign: "right" }}>
                <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(f.total))}</div>
                {Number(f.saldo) > 0 && (
                  <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>saldo {pesos(Number(f.saldo))}</div>
                )}
              </div>
              {Number(f.saldo) > 0 && (
                <button className="boton fantasma" style={{ height: 36, fontSize: 13.5 }}
                  onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                  {abierta === f.id ? "Cerrar" : "Registrar pago"}
                </button>
              )}
            </div>
            {abierta === f.id && (
              <RegistrarPago factura={f} accion={accion} ocupado={ocupado}
                alTerminar={() => setAbierta(null)} />
            )}
          </article>
        );
      })}
    </div>
  );
}

/**
 * Registrar un pago con su comprobante. Lo puede hacer quien tenga acceso al
 * contrato —el inquilino, el propietario o el administrador—, y queda
 * «reportado» hasta que el propietario lo verifique.
 */
function RegistrarPago({ factura, accion, ocupado, alTerminar }: {
  factura: Factura; accion: Accion; ocupado: number | string | null; alTerminar: () => void;
}) {
  const [monto, setMonto] = useState(String(Number(factura.saldo)));
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [canal, setCanal] = useState<"transferencia" | "consignacion" | "efectivo" | "otro">("transferencia");
  const [banco, setBanco] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const clave = `pago-${factura.id}`;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    void accion(clave, async () => {
      let comprobanteArchivoId: number | undefined;
      if (archivo) {
        const subida = await api.archivos.solicitarSubidaComprobante.mutate({
          contratoId: factura.contratoId,
          nombre: archivo.name,
          mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
          bytes: archivo.size,
        });
        const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
        if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
        comprobanteArchivoId = subida.archivoId;
      }
      await api.facturacion.reportarPago.mutate({
        facturaId: factura.id,
        monto: Number(monto),
        fechaPagoDeclarada: new Date(fecha),
        canal,
        ...(banco.trim() ? { bancoOrigen: banco.trim() } : {}),
        ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
      });
    }, "Pago registrado: queda por verificar.").then(alTerminar);
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <Campo etiqueta="Monto">
        <input type="number" min={1} step={1000} required value={monto} style={{ width: 130 }}
          onChange={(e) => setMonto(e.target.value)} />
      </Campo>
      <Campo etiqueta="Fecha del pago">
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo etiqueta="Medio">
        <select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)}>
          <option value="transferencia">Transferencia</option>
          <option value="consignacion">Consignación</option>
          <option value="efectivo">Efectivo</option>
          <option value="otro">Otro</option>
        </select>
      </Campo>
      <Campo etiqueta="Banco (opcional)">
        <input value={banco} onChange={(e) => setBanco(e.target.value)} />
      </Campo>
      <Campo etiqueta={canal === "efectivo" || canal === "otro" ? "Comprobante (opcional)" : "Comprobante"}
        ayuda="PDF o imagen, hasta 10 MB">
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          required={canal === "transferencia" || canal === "consignacion"}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </Campo>
      <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }}
        disabled={ocupado === clave}>
        {ocupado === clave ? "Subiendo…" : "Registrar"}
      </button>
    </form>
  );
}

function nombreMes(periodo: string): string {
  const [ano, mes] = periodo.split("-");
  const fecha = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Corrige fecha, medio, valor o comprobante de un pago ya registrado. */
function FormularioEditarPago({ pago, alTerminar }: { pago: PagoUnidad; alTerminar: () => void }) {
  const [fecha, setFecha] = useState(String(pago.fechaPago).slice(0, 10));
  const [medio, setMedio] = useState<"efectivo" | "transferencia">(pago.medio);
  const [monto, setMonto] = useState(pago.monto !== null ? String(Number(pago.monto)) : "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      let comprobanteArchivoId: number | undefined;
      if (archivo) {
        const subida = await api.archivos.solicitarSubidaPagoUnidad.mutate({
          inmuebleId: pago.inmuebleId,
          nombre: archivo.name,
          mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
          bytes: archivo.size,
        });
        const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
        if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
        comprobanteArchivoId = subida.archivoId;
      }
      await api.facturacion.editarPagoUnidad.mutate({
        pagoId: pago.id, fechaPago: new Date(fecha), medio,
        ...(monto.trim() !== "" ? { monto: Number(monto) } : {}),
        ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
      });
      alTerminar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Campo etiqueta="Fecha del pago">
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo etiqueta="Medio de pago">
          <select value={medio} onChange={(e) => setMedio(e.target.value as typeof medio)}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </Campo>
        <Campo etiqueta="Valor">
          <input type="number" min={1} step="any" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Reemplazar comprobante" ayuda="Opcional · foto o PDF, hasta 10 MB">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </Campo>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

/** Anula un pago sin borrarlo: queda de historial, fuera del calendario y los totales. */
function FormularioAnularPago({ pago, alTerminar }: { pago: PagoUnidad; alTerminar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.facturacion.anularPagoUnidad.mutate({ pagoId: pago.id, motivo });
      alTerminar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>
        El pago no se borra: queda visible como anulado, con este motivo, y deja de
        contar en el calendario y en los totales.
      </p>
      <Campo etiqueta="Motivo de anulación">
        <textarea required minLength={4} maxLength={500} rows={3} value={motivo}
          placeholder="Se registró dos veces / valor mal digitado / unidad equivocada"
          onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton riesgo" disabled={enviando || motivo.trim().length < 4}>
          {enviando ? "Anulando…" : "Anular pago"}
        </button>
      </div>
    </form>
  );
}
