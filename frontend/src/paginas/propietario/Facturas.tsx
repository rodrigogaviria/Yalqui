import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { Ventana } from "../../componentes/Ventana";
import { etiqueta } from "../../lib/etiquetas";
import { abrirArchivo } from "../../lib/archivos";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

type Factura = Awaited<ReturnType<typeof api.facturasPropiedad.mias.query>>["facturas"][number];
type Tipo = Awaited<ReturnType<typeof api.facturasPropiedad.tipos.query>>[number];
type Periodicidad = Tipo["periodicidad"];

const SITUACION = {
  pendiente: { texto: "Pendiente", clase: "pausado" },
  vencida: { texto: "Vencida", clase: "mora" },
  pagada: { texto: "Pagada", clase: "arrendado" },
  anulada: { texto: "Anulada", clase: "borrador" },
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

/** La unidad o la edificación a la que pertenece una factura. */
type Donde = { inmuebleId: number } | { edificacionId: number };

async function subir(donde: Donde, archivo: File): Promise<number> {
  const s = await api.archivos.solicitarSubidaFacturaPropiedad.mutate({
    ...donde, nombre: archivo.name,
    mime: archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
    bytes: archivo.size,
  });
  const r = await fetch(s.url, { method: "PUT", headers: { "content-type": archivo.type }, body: archivo });
  if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
  return s.archivoId;
}

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic";

/**
 * Las facturas que genera cada propiedad —agua, energía, gas, predial,
 * seguro— y su pago. Lo que Yalqui le factura al propietario aparece aparte,
 * al final: es otro flujo de plata.
 */
export function Facturas({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [edificaciones, setEdificaciones] = useState<Array<{ id: number; nombre: string }>>([]);
  useEffect(() => { void api.inmuebles.misEdificaciones.query().then(setEdificaciones).catch(() => setEdificaciones([])); }, []);
  const [registrando, setRegistrando] = useState(false);
  const [pagando, setPagando] = useState<Factura | null>(null);
  const [anulando, setAnulando] = useState<Factura | null>(null);
  const [editando, setEditando] = useState<Factura | null>(null);
  const [filtroUnidad, setFiltroUnidad] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const { datos, error, aviso, cargar, setAviso } = usePantalla(async () => {
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
  // Año y mes son los de la fecha de vencimiento: es lo único que toda factura
  // tiene con día exacto, mientras que el período de consumo puede ser un
  // bimestre o un año entero.
  const tiposUsados = tipos.filter((t) => mias.facturas.some((f) => f.tipo === t.nombre));
  const anios = [...new Set(mias.facturas.map((f) => String(f.fechaVencimiento).slice(0, 4)))].sort().reverse();
  const visibles = mias.facturas
    .filter((f) => filtroTipo === "" || f.tipo === filtroTipo)
    .filter((f) => filtroAnio === "" || String(f.fechaVencimiento).slice(0, 4) === filtroAnio)
    .filter((f) => filtroMes === "" || String(f.fechaVencimiento).slice(5, 7) === filtroMes)
    .filter((f) =>
    (filtroUnidad === "" || (filtroUnidad.startsWith("e") ? `e${f.edificacionId}` === filtroUnidad : String(f.inmuebleId) === filtroUnidad))
    && (filtroEstado === "" || f.situacion === filtroEstado))
    // La más reciente primero: por vencimiento y, a igual fecha, la última registrada.
    .sort((a, b) => String(b.fechaVencimiento).localeCompare(String(a.fechaVencimiento)) || b.id - a.id);

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
        <FormularioFactura unidades={unidades} edificaciones={edificaciones} tipos={tipos} anteriores={mias.facturas}
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
            {edificaciones.length > 0 && (
              <optgroup label="Edificaciones">
                {edificaciones.map((e) => <option key={`e${e.id}`} value={`e${e.id}`}>{e.nombre} (toda la edificación)</option>)}
              </optgroup>
            )}
            <optgroup label="Unidades">
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
            </optgroup>
          </select>
          <select aria-label="Tipo de factura" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Todos los tipos</option>
            {tiposUsados.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
          </select>
          <select aria-label="Año" value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos los años</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Mes" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} style={{ minWidth: 175 }}>
            <option value="">Todos los meses</option>
            {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
          </select>
          <select aria-label="Estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="vencida">Vencidas</option>
            <option value="pagada">Pagadas</option>
            <option value="anulada">Anuladas</option>
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
                borderLeft: `4px solid ${f.situacion === "vencida" ? "var(--mal)" : f.situacion === "pagada" ? "var(--bien)" : f.situacion === "anulada" ? "var(--linea)" : "var(--ojo)"}`,
                opacity: f.situacion === "anulada" ? 0.7 : 1,
              }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {f.tipo}
                    <span style={{ fontWeight: 400, color: "var(--tinta-2)", fontSize: 13 }}>
                      {" "}· {etiqueta("categoriaFactura", f.categoria)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                    {f.edificacion
                      ? `${f.edificacion} · toda la edificación (reparto ${f.prorrateo === "por_area" ? "por área" : f.prorrateo === "por_canon" ? "por canon" : "en partes iguales"})`
                      : `${f.direccion}${f.complemento ? `, ${f.complemento}` : ""}`} · {periodoTexto(f.periodicidad, f.periodo)}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-3)", marginTop: 2 }}>
                    Vence el {dia(f.fechaVencimiento)} · la paga {f.responsable === "inquilino" ? "el inquilino" : "el propietario"}
                    {f.numeroMedidor ? ` · medidor ${f.numeroMedidor}` : ""}
                    {f.referenciaPago ? ` · ref. ${f.referenciaPago}` : ""}
                    {f.fechaPago ? ` · pagada el ${dia(f.fechaPago)}` : ""}
                  </div>
                  {f.situacion === "anulada" && (
                    <div style={{ fontSize: 12.5, color: "var(--mal)", marginTop: 2 }}>
                      Anulada{f.anuladaAt ? ` el ${dia(f.anuladaAt)}` : ""}: {f.motivoAnulacion}
                    </div>
                  )}
                </div>
                <div className="num" style={{ width: 120, textAlign: "right", fontSize: 15.5, fontWeight: 600, textDecoration: f.situacion === "anulada" ? "line-through" : "none" }}>
                  {pesos(Number(f.valorPagado ?? f.valor))}
                </div>
                <span className={`pastilla ${s.clase}`} style={{ minWidth: 78, textAlign: "center" }}>{s.texto}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.situacion !== "pagada" && f.situacion !== "anulada" && (
                    <button className="boton" style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                      onClick={() => setPagando(f)}>
                      Registrar pago
                    </button>
                  )}
                  {f.archivoId !== null && (
                    <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                      onClick={() => abrirArchivo(f.archivoId!)}>Ver factura</button>
                  )}
                  {f.comprobanteArchivoId !== null && (
                    <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                      onClick={() => abrirArchivo(f.comprobanteArchivoId!)}>Ver comprobante</button>
                  )}
                  {f.situacion !== "anulada" && (
                    <button className="boton fantasma" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                      onClick={() => setEditando(f)}>
                      Editar
                    </button>
                  )}
                  {f.situacion !== "anulada" && (
                    <button className="boton riesgo" style={{ height: 34, fontSize: 13, padding: "0 10px" }}
                      onClick={() => setAnulando(f)}>
                      Anular
                    </button>
                  )}
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

      {editando && (
        <Ventana titulo={`Editar factura · ${editando.tipo} · ${editando.edificacion ?? `${editando.direccion}${editando.complemento ? `, ${editando.complemento}` : ""}`}`}
          alCerrar={() => setEditando(null)}>
          <FormularioEdicion factura={editando} tipo={tipos.find((t) => t.nombre === editando.tipo)}
            alTerminar={() => { setEditando(null); setAviso("Factura actualizada."); void cargar(); }} />
        </Ventana>
      )}

      {anulando && (
        <Ventana titulo={`Anular factura · ${anulando.tipo} · ${anulando.edificacion ?? `${anulando.direccion}${anulando.complemento ? `, ${anulando.complemento}` : ""}`}`}
          alCerrar={() => setAnulando(null)}>
          <FormularioAnulacion factura={anulando}
            alTerminar={() => { setAnulando(null); setAviso("Factura anulada."); void cargar(); }} />
        </Ventana>
      )}

      {pagando && (
        <Ventana titulo={`Registrar pago · ${pagando.tipo} · ${pagando.edificacion ?? `${pagando.direccion}${pagando.complemento ? `, ${pagando.complemento}` : ""}`}`}
          alCerrar={() => setPagando(null)}>
          <FormularioPago factura={pagando}
            alTerminar={() => { setPagando(null); setAviso("Pago registrado: la factura quedó pagada."); void cargar(); }} />
        </Ventana>
      )}
    </div>
  );
}

/** Le dice a la persona qué pasará con el gasto: se genera solo, o no si paga el inquilino. */
function NotaGasto({ responsable, pagada }: { responsable: "propietario" | "inquilino"; pagada: boolean }) {
  if (responsable === "inquilino") {
    return <p style={{ margin: 0, fontSize: 12.5, color: "var(--tinta-3)" }}>La paga el inquilino: no genera un gasto tuyo.</p>;
  }
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: "var(--tinta-3)" }}>
      {pagada ? "Al guardar se genera el gasto con el valor y la fecha del pago." : "Cuando la pagues, se genera el gasto solo en Mis Gastos."}
    </p>
  );
}

/** El período guardado («2026-09», «2026-B3», «2026») desarmado en sus partes. */
function partesDePeriodo(periodo: string) {
  const [anio = "", resto = ""] = periodo.split("-");
  return {
    anio,
    mes: resto && !resto.startsWith("B") ? periodo : `${anio}-01`,
    bimestre: resto.startsWith("B") ? resto.slice(1) : "1",
  };
}

/**
 * Corrige una factura ya registrada. El tipo y a nombre de quién está no se
 * cambian —arrastran las reglas del tipo—: si se equivocó ahí, se anula y se
 * registra otra.
 */
function FormularioEdicion({ factura, tipo, alTerminar }: {
  factura: Factura; tipo: Tipo | undefined; alTerminar: () => void;
}) {
  const inicial = partesDePeriodo(factura.periodo);
  const donde: Donde = factura.inmuebleId !== null ? { inmuebleId: factura.inmuebleId } : { edificacionId: factura.edificacionId! };
  const [mes, setMes] = useState(inicial.mes);
  const [bimestre, setBimestre] = useState(inicial.bimestre);
  const [anio, setAnio] = useState(inicial.anio);
  const [vence, setVence] = useState(String(factura.fechaVencimiento).slice(0, 10));
  const [valor, setValor] = useState(String(Number(factura.valor)));
  const [estado, setEstado] = useState<"sin_pagar" | "pagado">(factura.estado === "pagado" ? "pagado" : "sin_pagar");
  const [responsable, setResponsable] = useState(factura.responsable);
  const [prorrateo, setProrrateo] = useState<"partes_iguales" | "por_area" | "por_canon">(factura.prorrateo === "ninguno" ? "partes_iguales" : factura.prorrateo);
  const [medidor, setMedidor] = useState(factura.numeroMedidor ?? "");
  const [referencia, setReferencia] = useState(factura.referenciaPago ?? "");
  const [fechaPago, setFechaPago] = useState(factura.fechaPago ? String(factura.fechaPago).slice(0, 10) : hoyISO());
  const [valorPagado, setValorPagado] = useState(String(Number(factura.valorPagado ?? factura.valor)));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodicidad = factura.periodicidad;
  const periodo = periodicidad === "mensual" ? mes : periodicidad === "bimensual" ? `${anio}-B${bimestre}` : anio;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const archivoId = archivo ? await subir(donde, archivo) : undefined;
      const comprobanteArchivoId = estado === "pagado" && comprobante ? await subir(donde, comprobante) : undefined;
      await api.facturasPropiedad.editar.mutate({
        facturaId: factura.id, periodo, fechaVencimiento: vence, valor: Number(valor), responsable, estado,
        ...(factura.edificacionId !== null ? { prorrateo } : {}),
        ...(tipo?.requiereMedidor ? { numeroMedidor: medidor.trim() } : {}),
        ...(tipo?.requiereReferencia ? { referenciaPago: referencia.trim() } : {}),
        ...(archivoId !== undefined ? { archivoId } : {}),
        ...(estado === "pagado" ? { fechaPago, valorPagado: Number(valorPagado) } : {}),
        ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
      });
      alTerminar();
    } catch (err) {
      const { mensajeDeError } = await import("../../lib/api");
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        {periodicidad === "mensual" && (
          <Campo etiqueta="Mes de consumo"><input type="month" required value={mes} onChange={(e) => setMes(e.target.value)} /></Campo>
        )}
        {periodicidad === "bimensual" && (
          <>
            <Campo etiqueta="Bimestre de consumo">
              <select value={bimestre} onChange={(e) => setBimestre(e.target.value)}>
                {BIMESTRES.map((b, i) => <option key={b} value={i + 1}>Bimestre {i + 1} · {b}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Año"><input type="number" required min={2000} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} /></Campo>
          </>
        )}
        {periodicidad === "anual" && (
          <Campo etiqueta="Año de consumo"><input type="number" required min={2000} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} /></Campo>
        )}
        <Campo etiqueta="Fecha de vencimiento"><input type="date" required value={vence} onChange={(e) => setVence(e.target.value)} /></Campo>
        <Campo etiqueta="Valor"><input type="number" required min={1} step="any" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        {tipo?.requiereMedidor && (
          <Campo etiqueta="# Medidor"><input required maxLength={40} value={medidor} onChange={(e) => setMedidor(e.target.value)} /></Campo>
        )}
        {tipo?.requiereReferencia && (
          <Campo etiqueta="Referencia de pago"><input required maxLength={60} value={referencia} onChange={(e) => setReferencia(e.target.value)} /></Campo>
        )}
        <Campo etiqueta="Responsable del pago">
          <select value={responsable} onChange={(e) => setResponsable(e.target.value as typeof responsable)}>
            <option value="propietario">Propietario</option>
            <option value="inquilino">Inquilino</option>
          </select>
        </Campo>
        <Campo etiqueta="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="sin_pagar">Sin pagar</option>
            <option value="pagado">Pagado</option>
          </select>
        </Campo>
        {factura.edificacionId !== null && (
          <Campo etiqueta="Reparto entre las unidades">
            <select value={prorrateo} onChange={(e) => setProrrateo(e.target.value as typeof prorrateo)}>
              <option value="partes_iguales">Partes iguales</option>
              <option value="por_area">Por área</option>
              <option value="por_canon">Por canon</option>
            </select>
          </Campo>
        )}
        <Campo etiqueta="Factura (archivo)" ayuda={factura.archivoId !== null ? "Ya tiene uno: elegir otro lo reemplaza" : "Opcional"}>
          <input type="file" accept={ACEPTA} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </Campo>
      </div>

      {estado === "pagado" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, paddingTop: 4 }}>
          <Campo etiqueta="Fecha del pago"><input type="date" required value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} /></Campo>
          <Campo etiqueta="Valor pagado"><input type="number" required min={1} step="any" value={valorPagado} onChange={(e) => setValorPagado(e.target.value)} /></Campo>
          <Campo etiqueta="Comprobante" ayuda={factura.comprobanteArchivoId !== null ? "Ya tiene uno: elegir otro lo reemplaza" : "Opcional"}>
            <input type="file" accept={ACEPTA} onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
          </Campo>
        </div>
      )}
      {estado === "sin_pagar" && factura.estado === "pagado" && (
        <div className="aviso ojo">Al dejarla sin pagar se borran la fecha, el valor y el comprobante del pago, y su gasto.</div>
      )}
      <NotaGasto responsable={responsable} pagada={estado === "pagado"} />

      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div><button type="submit" className="boton" disabled={enviando}>{enviando ? "Guardando…" : "Guardar cambios"}</button></div>
    </form>
  );
}

/** Anular pide el motivo: la factura queda a la vista, tachada, con la razón. */
function FormularioAnulacion({ factura, alTerminar }: { factura: Factura; alTerminar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.facturasPropiedad.anular.mutate({ facturaId: factura.id, motivo });
      alTerminar();
    } catch (err) {
      const { mensajeDeError } = await import("../../lib/api");
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>
        La factura no se borra: queda visible como anulada, con este motivo, y deja
        de contar en los totales.
      </p>
      <Campo etiqueta="Motivo de anulación">
        <textarea required minLength={4} maxLength={500} rows={3} value={motivo}
          placeholder="Se registró dos veces / valor mal digitado / ya no aplica"
          onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton riesgo" disabled={enviando || motivo.trim().length < 4}>
          {enviando ? "Anulando…" : "Anular factura"}
        </button>
      </div>
    </form>
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
      const comprobanteArchivoId = archivo
        ? await subir(factura.inmuebleId !== null ? { inmuebleId: factura.inmuebleId } : { edificacionId: factura.edificacionId! }, archivo)
        : undefined;
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
      <div style={{ flexBasis: "100%" }}><NotaGasto responsable={factura.responsable} pagada /></div>
      {error && <div className="aviso malo" role="alert" style={{ flexBasis: "100%" }}>{error}</div>}
    </form>
  );
}

/** El período de consumo se pide según cada cuánto llega esa factura. */
function FormularioFactura({ unidades, edificaciones, tipos, anteriores, alTerminar }: {
  unidades: Array<{ id: number; titulo: string }>; edificaciones: Array<{ id: number; nombre: string }>;
  tipos: Tipo[]; anteriores: Factura[]; alTerminar: () => void;
}) {
  const ahora = new Date();
  // «e12» es la edificación 12; un número solo es una unidad.
  const [unidad, setUnidad] = useState(edificaciones[0] ? `e${edificaciones[0].id}` : String(unidades[0]?.id ?? ""));
  const [tipoId, setTipoId] = useState("");
  const [mes, setMes] = useState(ahora.toISOString().slice(0, 7));
  const [bimestre, setBimestre] = useState(String(Math.floor(ahora.getMonth() / 2) + 1));
  const [anio, setAnio] = useState(String(ahora.getFullYear()));
  const [vence, setVence] = useState("");
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<"sin_pagar" | "pagado">("sin_pagar");
  const [responsable, setResponsable] = useState<"propietario" | "inquilino">("propietario");
  const [medidor, setMedidor] = useState("");
  const [medidorTocado, setMedidorTocado] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [referenciaTocada, setReferenciaTocada] = useState(false);
  const [prorrateo, setProrrateo] = useState<"partes_iguales" | "por_area" | "por_canon">("partes_iguales");
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [valorPagado, setValorPagado] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tipo = tipos.find((t) => String(t.id) === tipoId);

  // El medidor de una propiedad casi nunca cambia: se ofrece el de la última
  // factura del mismo tipo en el mismo sitio, para no volver a escribirlo.
  const sugerido = tipo?.requiereMedidor
    ? anteriores.find((f) => f.tipo === tipo.nombre && f.numeroMedidor
        && (unidad.startsWith("e") ? `e${f.edificacionId}` === unidad : String(f.inmuebleId) === unidad))?.numeroMedidor ?? ""
    : "";
  const medidorFinal = medidorTocado ? medidor : sugerido;

  // La referencia de pago de un servicio tampoco cambia de un mes a otro.
  const referenciaSugerida = tipo?.requiereReferencia
    ? anteriores.find((f) => f.tipo === tipo.nombre && f.referenciaPago
        && (unidad.startsWith("e") ? `e${f.edificacionId}` === unidad : String(f.inmuebleId) === unidad))?.referenciaPago ?? ""
    : "";
  const referenciaFinal = referenciaTocada ? referencia : referenciaSugerida;
  const categorias = [...new Set(tipos.map((t) => t.categoria))];

  const periodo = !tipo ? "" : tipo.periodicidad === "mensual" ? mes
    : tipo.periodicidad === "bimensual" ? `${anio}-B${bimestre}` : anio;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setEnviando(true); setError(null);
    try {
      const donde: Donde = unidad.startsWith("e") ? { edificacionId: Number(unidad.slice(1)) } : { inmuebleId: Number(unidad) };
      const archivoId = archivo ? await subir(donde, archivo) : undefined;
      await api.facturasPropiedad.registrar.mutate({
        ...donde, tipoFacturaId: tipo.id, periodo,
        fechaVencimiento: vence, valor: Number(valor), estado, responsable,
        ...(tipo.requiereMedidor ? { numeroMedidor: medidorFinal.trim() } : {}),
        ...(tipo.requiereReferencia ? { referenciaPago: referenciaFinal.trim() } : {}),
        ...(donde && "edificacionId" in donde ? { prorrateo } : {}),
        ...(estado === "pagado" ? { fechaPago, valorPagado: Number(valorPagado || valor) } : {}),
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
        <Campo etiqueta="A nombre de" ayuda="Una unidad o toda la edificación">
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {edificaciones.length > 0 && (
              <optgroup label="Edificación (toda)">
                {edificaciones.map((e) => <option key={`e${e.id}`} value={`e${e.id}`}>{e.nombre}</option>)}
              </optgroup>
            )}
            <optgroup label="Unidad">
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
            </optgroup>
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

        {tipo?.requiereMedidor && (
          <Campo etiqueta="# Medidor" ayuda={sugerido && !medidorTocado ? "El de la última factura" : "Está impreso en la factura"}>
            <input required value={medidorFinal} maxLength={40} placeholder="123456789"
              onChange={(e) => { setMedidor(e.target.value); setMedidorTocado(true); }} />
          </Campo>
        )}
        {tipo?.requiereReferencia && (
          <Campo etiqueta="Referencia de pago" ayuda={referenciaSugerida && !referenciaTocada ? "La de la última factura" : "Es la que se digita para pagar"}>
            <input required value={referenciaFinal} maxLength={60} placeholder="Ej. 1234567890"
              onChange={(e) => { setReferencia(e.target.value); setReferenciaTocada(true); }} />
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
        {unidad.startsWith("e") && (
          <Campo etiqueta="Reparto entre las unidades" ayuda="Cómo se divide el gasto cuando se pague">
            <select value={prorrateo} onChange={(e) => setProrrateo(e.target.value as typeof prorrateo)}>
              <option value="partes_iguales">Partes iguales</option>
              <option value="por_area">Por área</option>
              <option value="por_canon">Por canon</option>
            </select>
          </Campo>
        )}
        <Campo etiqueta="Factura (archivo)" ayuda="Opcional · foto o PDF, hasta 10 MB">
          <input type="file" accept={ACEPTA} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </Campo>
      </div>

      {estado === "pagado" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <Campo etiqueta="Fecha del pago"><input type="date" required value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} /></Campo>
          <Campo etiqueta="Valor pagado" ayuda="Si lo dejás vacío, el de la factura">
            <input type="number" min={1} step="any" value={valorPagado} placeholder={valor} onChange={(e) => setValorPagado(e.target.value)} />
          </Campo>
        </div>
      )}
      <NotaGasto responsable={responsable} pagada={estado === "pagado"} />

      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton" disabled={enviando || !tipo || !vence || Number(valor) <= 0 || (tipo.requiereMedidor && medidorFinal.trim() === "") || (tipo.requiereReferencia && referenciaFinal.trim() === "")}>
          {enviando ? "Guardando…" : "Guardar factura"}
        </button>
      </div>
    </form>
  );
}
