import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { SubirPago } from "../../componentes/SubirPago";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

type Factura = Awaited<ReturnType<typeof api.facturacion.misFacturas.query>>["facturas"][number];

/**
 * Los colores del calendario, que son la razón de ser de esta pantalla: se
 * entiende de un vistazo qué está vencido, qué está pago y qué todavía no llega.
 */
const TONO: Record<string, { fondo: string; borde: string; texto: string; nombre: string }> = {
  vencida:   { fondo: "var(--mal-tenue)",  borde: "#f7d3d3", texto: "#7d211d", nombre: "Vencida" },
  pagada:    { fondo: "var(--bien-tenue)", borde: "#bfe9d3", texto: "#0e3b24", nombre: "Pagada" },
  porVencer: { fondo: "var(--ojo-tenue)",  borde: "#f2e2b2", texto: "#4a3405", nombre: "Por vencer" },
};

export function Pagos() {
  const [vista, setVista] = useState<"lista" | "calendario">("calendario");
  const [mes, setMes] = useState(() => ({ anio: new Date().getFullYear(), mes: new Date().getMonth() }));
  const [subiendo, setSubiendo] = useState<{ unidad: string; inmuebleId: number; fecha: string } | null>(null);
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

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Pagos"
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
        {vista === "calendario" && (
          <>
            <Cifra titulo="Total previsto" valor={pesos(delMes.previsto)} />
            <Cifra titulo="Pagado" valor={pesos(delMes.pagado)} tono={delMes.pagado > 0 ? "bien" : "normal"} />
          </>
        )}
        <Cifra titulo={"Por cobrar"}
          valor={pesos(vista === "calendario" ? delMes.porCobrar : cuenta.porCobrar)}
          tono={(vista === "calendario" ? delMes.porCobrar : cuenta.porCobrar) > 0 ? "ojo" : "normal"} />
        <Cifra titulo="Vencido"
          valor={pesos(vista === "calendario" ? delMes.vencido : cuenta.vencido)}
          tono={(vista === "calendario" ? delMes.vencido : cuenta.vencido) > 0 ? "mal" : "bien"} />
      </Cifras>

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
                    onClick={() => void verComprobante(p.comprobanteArchivoId!)}>
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

      {vista === "calendario" ? (
        <Calendario facturas={cuenta.facturas} unidades={unidades} pagosUnidad={pagosUnidad} mes={mes} setMes={setMes}
          alElegir={(u, dia) => setSubiendo({
            unidad: `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`,
            inmuebleId: u.id,
            fecha: `${periodoDe(mes)}-${String(dia).padStart(2, "0")}`,
          })} />
      ) : cuenta.total === 0 ? (
        <Vacio titulo="Todavía no hay facturas">
          Las facturas nacen del contrato: cuando una unidad quede arrendada, acá vas a
          ver el canon de cada mes con su estado.
        </Vacio>
      ) : (
        <Lista facturas={cuenta.facturas} accion={accion} ocupado={ocupado} />
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

function situacionDelMes(unidades: Unidad[], facturas: Factura[], pagos: PagoUnidad[], m: Mes) {
  const hoy = new Date();
  const ultimo = new Date(m.anio, m.mes + 1, 0).getDate();
  const periodo = periodoDe(m);
  return unidades.filter((u) => u.estado === "arrendado").map((u) => {
    const dia = Math.min(u.diaPago, ultimo);
    // Pago si hay factura pagada o un pago registrado sobre la unidad ese mes.
    const pagada = facturas.some(
      (f) => f.inmuebleId === u.id && f.periodo === periodo && f.situacion === "pagada",
    ) || pagos.some((p) => p.inmuebleId === u.id && p.periodo === periodo);
    const limite = new Date(m.anio, m.mes, dia + u.diasGracia, 23, 59, 59);
    const tono: keyof typeof TONO = pagada ? "pagada" : hoy > limite ? "vencida" : "porVencer";
    return { u, dia, tono };
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

  const porDia = new Map<number, Array<{ u: Unidad; tono: keyof typeof TONO }>>();
  for (const { u, dia, tono } of situacionDelMes(unidades, facturas, pagosUnidad, mes)) {
    porDia.set(dia, [...(porDia.get(dia) ?? []), { u, tono }]);
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
                    {(porDia.get(dia) ?? []).map(({ u, tono }) => {
                      const t = TONO[tono]!;
                      return (
                        <button key={u.id} type="button"
                          disabled={tono === "pagada"}
                          onClick={() => alElegir(u, dia)}
                          title={`${u.direccion}${u.complemento ? `, ${u.complemento}` : ""} · ${t.nombre}${tono === "pagada" ? "" : ` · gracia ${u.diasGracia} d · tocá para subir el pago`}`}
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

async function verComprobante(archivoId: number) {
  const { url } = await api.archivos.urlDescarga.query({ archivoId });
  window.open(url, "_blank", "noopener");
}

type Accion = (clave: number | string, fn: () => Promise<unknown>, mensaje: string) => Promise<void>;

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
