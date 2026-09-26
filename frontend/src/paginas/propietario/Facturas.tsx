import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { Ventana } from "../../componentes/Ventana";
import { etiqueta } from "../../lib/etiquetas";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

type Factura = Awaited<ReturnType<typeof api.facturasPropiedad.mias.query>>["facturas"][number];
type Tipo = Awaited<ReturnType<typeof api.facturasPropiedad.tipos.query>>[number];
type Periodicidad = Tipo["periodicidad"];

const SITUACION = {
  pendiente: { texto: "Pendiente", clase: "pausado" },
  vencida: { texto: "Vencida", clase: "mora" },
  pagada: { texto: "Pagada", clase: "arrendado" },
} as const;

const BIMESTRES = [
  "Enero – Febrero", "Marzo – Abril", "Mayo – Junio",
  "Julio – Agosto", "Septiembre – Octubre", "Noviembre – Diciembre",
];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
  "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** El período de consumo escrito para leerse: un mes, un bimestre o un año. */
function periodoTexto(p: Periodicidad, periodo: string): string {
  const [anio, resto] = periodo.split("-");
  if (p === "mensual") return `${MESES[Number(resto) - 1] ?? resto} ${anio}`;
  if (p === "bimensual") {
    const n = Number(resto?.replace("B", ""));
    return `Bimestre ${n} (${BIMESTRES[n - 1] ?? ""}) ${anio}`;
  }
  return anio ?? periodo;
}

const dia = (f: string | Date) => new Date(f).toLocaleDateString("es-CO", { timeZone: "UTC" });
const hoyISO = () => new Date().toISOString().slice(0, 10);

async function subir(inmuebleId: number, archivo: File): Promise<number> {
  const s = await api.archivos.solicitarSubidaFacturaPropiedad.mutate({
    inmuebleId, nombre: archivo.name,
    mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
    bytes: archivo.size,
  });
  const r = await fetch(s.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
  if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
  return s.archivoId;
}

async function abrir(archivoId: number) {
  const { url } = await api.archivos.urlDescarga.query({ archivoId });
  window.open(url, "_blank", "noopener");
}

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic";

/**
 * Las facturas que genera cada propiedad —agua, energía, gas, predial,
 * seguro— y su pago. Lo que Yalqui le factura al propietario aparece aparte,
 * al final: es otro flujo de plata.
 */
export function Facturas({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [registrando, setRegistrando] = useState(false);
  const [pagando, setPagando] = useState<Factura | null>(null);
  const [filtroUnidad, setFiltroUnidad] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const { datos, error, aviso, ocupado, accion, cargar, setAviso } = usePantalla(async () => {
    const [mias, tipos, yalqui] = await Promise.all([
      api.facturasPropiedad.mias.query(),
      api.facturasPropiedad.tipos.query(),
      api.plan.misFacturas.query(),
    ]);
    return { mias, tipos, yalqui };
  });

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { mias, tipos, yalqui } = datos;
  const visibles = mias.facturas.filter((f) =>
    (filtroUnidad === "" || String(f.inmuebleId) === filtroUnidad)
    && (filtroEstado === "" || f.situacion === filtroEstado));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Facturas"
        nota="Agua, energía, gas, internet, predial, seguro: lo que genera cada propiedad y quién lo paga."
        accion={unidades.length > 0
          ? <button className="boton" onClick={() => setRegistrando((v) => !v)}>{registrando ? "Cancelar" : "Registrar factura"}</button>
          : undefined}
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {registrando && (
        <FormularioFactura unidades={unidades} tipos={tipos}
          alTerminar={() => { setRegistrando(false); setAviso("Factura registrada."); void cargar(); }} />
      )}

      <Cifras>
        <Cifra titulo="Sin pagar" valor={pesos(mias.sinPagar)} tono={mias.sinPagar > 0 ? "ojo" : "normal"} />
        <Cifra titulo="Vencido" valor={pesos(mias.vencido)} tono={mias.vencido > 0 ? "mal" : "bien"} />
        <Cifra titulo="Pagado" valor={pesos(mias.pagado)} tono={mias.pagado > 0 ? "bien" : "normal"} />
      </Cifras>

      {mias.total > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select aria-label="Propiedad" value={filtroUnidad} onChange={(e) => setFiltroUnidad(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">Todas las propiedades</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
          </select>
          <select aria-label="Estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="vencida">Vencidas</option>
            <option value="pagada">Pagadas</option>
          </select>
        </div>
      )}

      {mias.total === 0 ? (
        <Vacio titulo="Todavía no registraste facturas">
          Registrá la factura del agua, la energía o el predial de una propiedad y te
          avisamos qué está pendiente y qué venció.
        </Vacio>
      ) : visibles.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Ninguna factura con ese filtro.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visibles.map((f) => {
            const s = SITUACION[f.situacion];
            return (
              <article key={f.id} className="tarjeta" style={{
                padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                borderLeft: `4px solid ${f.situacion === "vencida" ? "var(--mal)" : f.situacion === "pagada" ? "var(--bien)" : "var(--ojo)"}`,
              }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {f.tipo}
                    <span style={{ fontWeight: 400, color: "var(--tinta-2)", fontSize: 13 }}>
                      {" "}· {etiqueta("categoriaFactura", f.categoria)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {f.direccion}{f.complemento ? `, ${f.complemento}` : ""} · {periodoTexto(f.periodicidad, f.periodo)}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-3)", marginTop: 2 }}>
                    Vence el {dia(f.fechaVencimiento)} · la paga {f.responsable === "inquilino" ? "el inquilino" : "el propietario"}
                    {f.fechaPago ? ` · pagada el ${dia(f.fechaPago)}` : ""}
                  </div>
                </div>
                <div className="num" style={{ width: 120, textAlign: "right", fontSize: 15.5, fontWeight: 600 }}>
                  {pesos(Number(f.valorPagado ?? f.valor))}
                </div>
                <span className={`pastilla ${s.clase}`} style={{ minWidth: 78, textAlign: "center" }}>{s.texto}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.situacion !== "pagada" && (
                    <button className="boton" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                      onClick={() => setPagando(f)}>
                      Registrar pago
                    </button>
                  )}
                  {f.archivoId !== null && (
                    <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                      onClick={() => void abrir(f.archivoId!)}>Ver factura</button>
                  )}
                  {f.comprobanteArchivoId !== null && (
                    <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                      onClick={() => void abrir(f.comprobanteArchivoId!)}>Ver comprobante</button>
                  )}
                  <button className="boton riesgo" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                    disabled={ocupado === `e-${f.id}`}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar la factura de ${f.tipo}? No se puede deshacer.`)) {
                        void accion(`e-${f.id}`, () => api.facturasPropiedad.eliminar.mutate({ facturaId: f.id }), "Factura eliminada.");
                      }
                    }}>
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {yalqui.total > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0 }}>Facturas de Yalqui</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--tinta-2)" }}>
            Lo que Yalqui te factura por tu plan y tus servicios. El arriendo no aparece: va directo de tu inquilino a vos.
          </p>
          {yalqui.facturas.map((f) => (
            <div key={f.id} className="tarjeta" style={{ padding: "13px 16px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 240px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>Factura {f.numero}</div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>
                  Período {f.periodo} · vence el {dia(f.fechaVencimiento)} · {f.estado}
                </div>
              </div>
              <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(f.total))}</div>
            </div>
          ))}
        </section>
      )}

      {pagando && (
        <Ventana titulo={`Registrar pago · ${pagando.tipo} · ${pagando.direccion}${pagando.complemento ? `, ${pagando.complemento}` : ""}`}
          alCerrar={() => setPagando(null)}>
          <FormularioPago factura={pagando}
            alTerminar={() => { setPagando(null); setAviso("Pago registrado: la factura quedó pagada."); void cargar(); }} />
        </Ventana>
      )}
    </div>
  );
}

/** Fecha, valor y comprobante. Al guardar, la factura pasa a pagada. */
function FormularioPago({ factura, alTerminar }: { factura: Factura; alTerminar: () => void }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [valor, setValor] = useState(String(Number(factura.valor)));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const comprobanteArchivoId = archivo ? await subir(factura.inmuebleId, archivo) : undefined;
      await api.facturasPropiedad.registrarPago.mutate({
        facturaId: factura.id, fechaPago: fecha, valor: Number(valor),
        ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
      });
      alTerminar();
    } catch (err) {
      const { mensajeDeError } = await import("../../lib/api");
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <Campo etiqueta="Fecha del pago">
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo etiqueta="Valor pagado">
        <input type="number" required min={1} step="any" value={valor} style={{ width: 150 }}
          onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo etiqueta="Comprobante (opcional)" ayuda="Foto o PDF, hasta 10 MB">
        <input type="file" accept={ACEPTA} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </Campo>
      <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }} disabled={enviando}>
        {enviando ? "Guardando…" : "Registrar pago"}
      </button>
      {error && <div className="aviso malo" role="alert" style={{ flexBasis: "100%" }}>{error}</div>}
    </form>
  );
}

/** El período de consumo se pide según cada cuánto llega esa factura. */
function FormularioFactura({ unidades, tipos, alTerminar }: {
  unidades: Array<{ id: number; titulo: string }>; tipos: Tipo[]; alTerminar: () => void;
}) {
  const ahora = new Date();
  const [unidad, setUnidad] = useState(String(unidades[0]?.id ?? ""));
  const [tipoId, setTipoId] = useState("");
  const [mes, setMes] = useState(ahora.toISOString().slice(0, 7));
  const [bimestre, setBimestre] = useState(String(Math.floor(ahora.getMonth() / 2) + 1));
  const [anio, setAnio] = useState(String(ahora.getFullYear()));
  const [vence, setVence] = useState("");
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<"sin_pagar" | "pagado">("sin_pagar");
  const [responsable, setResponsable] = useState<"propietario" | "inquilino">("propietario");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tipo = tipos.find((t) => String(t.id) === tipoId);
  const categorias = [...new Set(tipos.map((t) => t.categoria))];

  const periodo = !tipo ? "" : tipo.periodicidad === "mensual" ? mes
    : tipo.periodicidad === "bimensual" ? `${anio}-B${bimestre}` : anio;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setEnviando(true); setError(null);
    try {
      const archivoId = archivo ? await subir(Number(unidad), archivo) : undefined;
      await api.facturasPropiedad.registrar.mutate({
        inmuebleId: Number(unidad), tipoFacturaId: tipo.id, periodo,
        fechaVencimiento: vence, valor: Number(valor), estado, responsable,
        ...(archivoId !== undefined ? { archivoId } : {}),
      });
      alTerminar();
    } catch (err) {
      const { mensajeDeError } = await import("../../lib/api");
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Registrar una factura</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <Campo etiqueta="Propiedad">
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Factura" ayuda={tipo ? `Se paga ${etiqueta("periodoFactura", tipo.periodicidad).toLowerCase()}` : undefined}>
          <select required value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Elegí una…</option>
            {categorias.map((c) => (
              <optgroup key={c} label={etiqueta("categoriaFactura", c)}>
                {tipos.filter((t) => t.categoria === c).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </optgroup>
            ))}
          </select>
        </Campo>

        {tipo?.periodicidad === "mensual" && (
          <Campo etiqueta="Mes de consumo">
            <input type="month" required value={mes} onChange={(e) => setMes(e.target.value)} />
          </Campo>
        )}
        {tipo?.periodicidad === "bimensual" && (
          <>
            <Campo etiqueta="Bimestre de consumo">
              <select value={bimestre} onChange={(e) => setBimestre(e.target.value)}>
                {BIMESTRES.map((b, i) => <option key={b} value={i + 1}>Bimestre {i + 1} · {b}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Año">
              <input type="number" required min={2000} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} />
            </Campo>
          </>
        )}
        {tipo?.periodicidad === "anual" && (
          <Campo etiqueta="Año de consumo">
            <input type="number" required min={2000} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} />
          </Campo>
        )}
        {!tipo && (
          <Campo etiqueta="Período de consumo" ayuda="Elegí primero la factura">
            <input disabled placeholder="—" />
          </Campo>
        )}

        <Campo etiqueta="Fecha de vencimiento">
          <input type="date" required value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
        <Campo etiqueta="Valor">
          <input type="number" required min={1} step="any" value={valor} placeholder="85000"
            onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo etiqueta="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="sin_pagar">Sin pagar</option>
            <option value="pagado">Pagado</option>
          </select>
        </Campo>
        <Campo etiqueta="Responsable del pago">
          <select value={responsable} onChange={(e) => setResponsable(e.target.value as typeof responsable)}>
            <option value="propietario">Propietario</option>
            <option value="inquilino">Inquilino</option>
          </select>
        </Campo>
        <Campo etiqueta="Factura (archivo)" ayuda="Opcional · foto o PDF, hasta 10 MB">
          <input type="file" accept={ACEPTA} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </Campo>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton" disabled={enviando || !tipo || !vence || Number(valor) <= 0}>
          {enviando ? "Guardando…" : "Guardar factura"}
        </button>
      </div>
    </form>
  );
}
