import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { Ventana } from "../../componentes/Ventana";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

type Socio = Awaited<ReturnType<typeof api.rentabilidad.misSociosInversionistas.query>>[number];
type Extracto = Awaited<ReturnType<typeof api.extractos.mios.query>>[number];
type DuenoUnidad = Awaited<ReturnType<typeof api.inmuebles.sociosDe.query>>[number];
type EdificacionPropia = Awaited<ReturnType<typeof api.rentabilidad.edificacionesPropias.query>>[number];
type ResumenEdificacion = Awaited<ReturnType<typeof api.rentabilidad.resumenEdificacion.query>>;
type MedioPago = "efectivo" | "transferencia" | "cheque" | "otro";
const MEDIOS_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo", transferencia: "Transferencia", cheque: "Cheque", otro: "Otro",
};

/** A quién pertenece cada unidad —el principal y sus socios—, y el alta de uno nuevo. */
function GestionSocios({ unidades, alCambiar }: {
  unidades: Array<{ id: number; titulo: string }>; alCambiar: () => void;
}) {
  const [inmuebleId, setInmuebleId] = useState(String(unidades[0]?.id ?? ""));
  const [duenos, setDuenos] = useState<DuenoUnidad[] | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [ocupado, setOcupado] = useState<number | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function cargar() {
    if (inmuebleId === "") return;
    void api.inmuebles.sociosDe.query({ inmuebleId: Number(inmuebleId) })
      .then(setDuenos).catch((e) => setError(mensajeDeError(e)));
  }
  useEffect(cargar, [inmuebleId]);

  async function quitar(fila: DuenoUnidad) {
    setOcupado(fila.id); setError(null);
    try {
      await api.inmuebles.quitarSocio.mutate({ inmuebleId: Number(inmuebleId), inmueblePropietarioId: fila.id });
      setAviso("Socio retirado.");
      cargar(); alCambiar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally { setOcupado(null); }
  }

  if (unidades.length === 0) {
    return <div className="aviso ojo">Registrá una unidad antes de agregar un socio.</div>;
  }

  return (
    <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Socios de la unidad</h2>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <Campo etiqueta="Unidad">
        <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)}>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
        </select>
      </Campo>

      {duenos === null ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Cargando…</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {duenos.map((d) => (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "10px 12px", borderRadius: 10, border: "1px solid var(--linea)",
            }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {d.nombre} {d.apellido}
                  <span className="pastilla publicado" style={{ marginLeft: 8, fontSize: 11 }}>
                    {d.rol === "principal" ? "Principal" : "Socio"}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>{d.email}</div>
              </div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{Number(d.porcentaje)}%</div>
              {d.rol === "socio" && (
                <button type="button" className="boton riesgo" style={{ height: 32, fontSize: 12.5 }}
                  disabled={ocupado === d.id} onClick={() => void quitar(d)}>
                  {ocupado === d.id ? "…" : "Quitar"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <button className="boton fantasma" onClick={() => setAgregando((v) => !v)}>
          {agregando ? "Cancelar" : "Agregar socio"}
        </button>
      </div>

      {agregando && (
        <FormularioSocio inmuebleId={Number(inmuebleId)} alAgregar={() => {
          setAgregando(false); setAviso("Socio agregado."); cargar(); alCambiar();
        }} />
      )}
    </section>
  );
}

function FormularioSocio({ inmuebleId, alAgregar }: { inmuebleId: number; alAgregar: () => void }) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [celular, setCelular] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<"CC" | "CE" | "NIT" | "PA">("CC");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      await api.inmuebles.agregarSocio.mutate({
        inmuebleId, email: email.trim(), nombre: nombre.trim(), apellido: apellido.trim(),
        tipoDocumento, numeroDocumento: numeroDocumento.trim(),
        ...(celular.trim() ? { telefono: celular.trim() } : {}),
        porcentaje: Number(porcentaje),
      });
      alAgregar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12, padding: 14, borderRadius: 10, border: "1px solid var(--linea)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Campo etiqueta="Correo"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo etiqueta="Nombre"><input required value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
        <Campo etiqueta="Apellido"><input required value={apellido} onChange={(e) => setApellido(e.target.value)} /></Campo>
        <Campo etiqueta="Celular"><input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="300 123 4567" /></Campo>
        <Campo etiqueta="Tipo de documento">
          <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as typeof tipoDocumento)}>
            <option value="CC">CC</option><option value="CE">CE</option><option value="NIT">NIT</option><option value="PA">PA</option>
          </select>
        </Campo>
        <Campo etiqueta="Número de documento">
          <input required value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} />
        </Campo>
        <Campo etiqueta="% de participación">
          <input type="number" required min={1} max={99} step="0.01" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
        </Campo>
      </div>
      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div>
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? "Agregando…" : "Agregar socio"}
        </button>
      </div>
    </form>
  );
}

/** Genera el extracto mensual de un socio y arma el enlace para compartirlo. */
function ExtractosSocio({ socios }: { socios: Socio[] }) {
  const [extractos, setExtractos] = useState<Extracto[] | null>(null);
  const [socioId, setSocioId] = useState(String(socios[0]?.id ?? ""));
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [generando, setGenerando] = useState(false);
  const [enlace, setEnlace] = useState<{ socio: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    void api.extractos.mios.query().then(setExtractos).catch((e) => setError(mensajeDeError(e)));
  }
  useEffect(cargar, []);

  async function generar() {
    setGenerando(true); setError(null); setEnlace(null); setCopiado(false);
    try {
      const r = await api.extractos.generar.mutate({ socioId: Number(socioId), periodo });
      const socio = socios.find((s) => String(s.id) === socioId);
      setEnlace({ socio: socio ? `${socio.nombre} ${socio.apellido}` : "", url: `${window.location.origin}${r.enlace}` });
      cargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally { setGenerando(false); }
  }

  return (
    <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Extracto para un socio</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
          Una foto del mes —ingresos, recaudo, gastos y la utilidad que le corresponde según su %—
          con un enlace para compartirle, sin que necesite entrar a Yalqui.
        </p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Campo etiqueta="Socio">
          <select value={socioId} onChange={(e) => setSocioId(e.target.value)}>
            {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Mes">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </Campo>
        <button className="boton" disabled={generando || socioId === ""} onClick={() => void generar()}>
          {generando ? "Generando…" : "Generar extracto"}
        </button>
      </div>

      {enlace && (
        <div style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--linea)" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Enlace para {enlace.socio}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input readOnly value={enlace.url} onFocus={(e) => e.target.select()}
              style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12.5 }} />
            <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
              onClick={() => {
                void navigator.clipboard.writeText(enlace.url).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                });
              }}>
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {extractos !== null && extractos.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tinta-2)" }}>Generados antes</div>
          {extractos.map((e) => (
            <div key={e.id} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "8px 0", borderBottom: "1px solid var(--linea)", fontSize: 13.5,
            }}>
              <span style={{ flex: "1 1 200px" }}>
                {e.periodo} · {e.socioNombre} {e.socioApellido}
                <span style={{ color: "var(--tinta-3)" }}> · {Number(e.porcentajeSocio)}%</span>
              </span>
              <span className="num" style={{ fontWeight: 600 }}>{pesos(Number(e.utilidadSocio))}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * El formulario para anotar que se le pagó a un socio su utilidad: la fecha,
 * y una o varias partes —cada una con su medio, su monto y, si fue
 * transferencia, el comprobante—. Es el mismo patrón que subir un pago de
 * unidad, para que no haya que aprender una forma distinta de cargarlo.
 */
function RegistrarPagoSocio({ socioId, edificacionId, periodo, alTerminar, alCancelar }: {
  socioId: number; edificacionId: number; periodo: string;
  alTerminar: () => void; alCancelar: () => void;
}) {
  type Parte = { monto: string; medio: MedioPago; archivo: File | null };
  const parteVacia = (): Parte => ({ monto: "", medio: "transferencia", archivo: null });
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [partes, setPartes] = useState<Parte[]>([parteVacia()]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (i: number, cambios: Partial<Parte>) =>
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambios } : p)));
  const total = partes.reduce((t, p) => t + (Number(p.monto) || 0), 0);
  const puedeEnviar = partes.every((p) => Number(p.monto) > 0 && (p.medio !== "transferencia" || p.archivo !== null));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const partesEnviadas = await Promise.all(partes.map(async (p) => {
        let comprobanteArchivoId: number | undefined;
        if (p.archivo) {
          const subida = await api.archivos.solicitarSubidaPagoSocio.mutate({
            socioId, nombre: p.archivo.name,
            mime: p.archivo.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic",
            bytes: p.archivo.size,
          });
          const r = await fetch(subida.url, { method: "PUT", headers: { "content-type": p.archivo.type }, body: p.archivo });
          if (!r.ok) throw new Error("No se pudo subir el archivo. Probá de nuevo.");
          comprobanteArchivoId = subida.archivoId;
        }
        return {
          monto: Number(p.monto), medio: p.medio,
          ...(comprobanteArchivoId !== undefined ? { comprobanteArchivoId } : {}),
        };
      }));
      await api.rentabilidad.registrarPagoSocio.mutate({ socioId, edificacionId, periodo, fecha, partes: partesEnviadas });
      alTerminar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <Campo etiqueta="Fecha del pago">
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>

      <div style={{ display: "grid", gap: 10 }}>
        {partes.map((p, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
            padding: partes.length > 1 ? "10px 12px" : 0,
            border: partes.length > 1 ? "1px solid var(--linea)" : "none",
            borderRadius: partes.length > 1 ? 10 : 0,
          }}>
            {partes.length > 1 && (
              <div style={{ flexBasis: "100%", fontSize: 12.5, fontWeight: 600, color: "var(--tinta-2)" }}>
                Parte {i + 1}
              </div>
            )}
            <Campo etiqueta="Medio de pago">
              <select value={p.medio} onChange={(e) => cambiar(i, { medio: e.target.value as MedioPago })}>
                {Object.entries(MEDIOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Valor">
              <input type="number" min={1} step="any" required value={p.monto} placeholder="320000"
                onChange={(e) => cambiar(i, { monto: e.target.value })} />
            </Campo>
            <Campo etiqueta={p.medio === "transferencia" ? "Comprobante" : "Comprobante (opcional)"}
              ayuda="Foto o PDF, hasta 10 MB">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                required={p.medio === "transferencia"}
                onChange={(e) => cambiar(i, { archivo: e.target.files?.[0] ?? null })} />
            </Campo>
            {partes.length > 1 && (
              <button type="button" className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))}>
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
          disabled={partes.length >= 6}
          onClick={() => setPartes((ps) => [...ps, parteVacia()])}>
          + Pagó con otro medio
        </button>
        {partes.length > 1 && (
          <span style={{ fontSize: 13.5, color: "var(--tinta-2)" }}>
            Total: <strong className="num">{pesos(total)}</strong>
          </span>
        )}
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="boton" style={{ height: 38, fontSize: 13.5, padding: "0 16px" }}
          disabled={enviando || !puedeEnviar}>
          {enviando ? "Guardando…" : "Guardar pago"}
        </button>
        <button type="button" className="boton fantasma" style={{ height: 38, fontSize: 13.5 }} onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * El resumen del mes para una edificación entera, con la utilidad repartida
 * entre sus socios según su %. Reemplaza mirar unidad por unidad: con varias
 * unidades bajo el mismo propietario, lo que importa es el edificio completo.
 */
function RendimientosEdificacion({ edificaciones }: { edificaciones: EdificacionPropia[] }) {
  const [edificacionId, setEdificacionId] = useState(String(edificaciones[0]?.id ?? ""));
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [resumen, setResumen] = useState<ResumenEdificacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState<{ socioId: number; nombre: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function cargar() {
    if (edificacionId === "") return;
    setError(null);
    void api.rentabilidad.resumenEdificacion.query({ edificacionId: Number(edificacionId), periodo })
      .then(setResumen).catch((e) => setError(mensajeDeError(e)));
  }
  useEffect(cargar, [edificacionId, periodo]);

  return (
    <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Rendimientos de la edificación</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {edificaciones.length > 1 && (
            <Campo etiqueta="Edificación">
              <select value={edificacionId} onChange={(e) => setEdificacionId(e.target.value)}>
                {edificaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Mes">
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </Campo>
        </div>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {resumen === null ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Cargando…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
            <Dato t="Unidades" v={String(resumen.unidades)} />
            <Dato t="Ingresos totales" v={pesos(resumen.ingresosTotales)} />
            <Dato t="Recaudo" v={pesos(resumen.recaudo)} />
            <Dato t="Utilidad" v={pesos(resumen.utilidad)} />
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Gastos por tipo</div>
            {resumen.gastosPorTipo.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Sin gastos este mes.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {resumen.gastosPorTipo.map((g) => (
                  <div key={g.concepto} style={{
                    display: "flex", justifyContent: "space-between", fontSize: 13.5,
                    padding: "4px 0", borderBottom: "1px solid var(--linea)",
                  }}>
                    <span>{g.concepto}</span>
                    <span className="num" style={{ fontWeight: 600 }}>{pesos(g.monto)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, paddingTop: 4 }}>
                  <span>Total gastos</span>
                  <span className="num">{pesos(resumen.gastosTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {resumen.socios.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Utilidad por socio</div>
              <div style={{ display: "grid", gap: 8 }}>
                {resumen.socios.map((s) => (
                  <div key={s.usuarioId} style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "9px 0", borderBottom: "1px solid var(--linea)", fontSize: 14,
                  }}>
                    <span style={{ flex: "1 1 160px", minWidth: 0 }}>{s.nombre} {s.apellido}</span>
                    <span className="num" style={{ width: 60, color: "var(--tinta-2)" }}>{s.porcentaje.toFixed(1)}%</span>
                    <span className="num" style={{ width: 130, fontWeight: 600 }}>{pesos(s.utilidad)}</span>
                    <button type="button" className="boton fantasma" style={{ height: 32, fontSize: 12.5 }}
                      onClick={() => setPagando({ socioId: s.usuarioId, nombre: `${s.nombre} ${s.apellido}` })}>
                      Registrar pago
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {pagando && (
        <Ventana titulo={`Registrar pago a ${pagando.nombre}`} alCerrar={() => setPagando(null)}>
          <RegistrarPagoSocio
            socioId={pagando.socioId} edificacionId={Number(edificacionId)} periodo={periodo}
            alTerminar={() => { setPagando(null); setAviso("Pago registrado."); cargar(); }}
            alCancelar={() => setPagando(null)}
          />
        </Ventana>
      )}
    </section>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--tinta-2)" }}>{t}</div>
      <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{v}</div>
    </div>
  );
}

/**
 * Qué entra y qué sale de cada unidad.
 *
 * El neto es ingresos menos egresos, sin más: es caja, no contabilidad. No
 * descuenta impuestos ni amortizaciones, y decir «rentabilidad» de otra forma
 * exigiría datos que el sistema no tiene.
 */
export function Rentabilidad({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [gestionandoSocios, setGestionandoSocios] = useState(false);
  const [verComo, setVerComo] = useState("");
  const { datos, error, aviso, cargar } = usePantalla(async () => {
    const [resumen, socios, edificaciones] = await Promise.all([
      api.rentabilidad.resumen.query({ ...(verComo ? { verComoSocioId: Number(verComo) } : {}) }),
      api.rentabilidad.misSociosInversionistas.query(),
      api.rentabilidad.edificacionesPropias.query(),
    ]);
    return { resumen, socios, edificaciones };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  // El resumen cambia según a quién se está viendo: se recarga aparte, no en
  // el montaje único de usePantalla (ese ignora a propósito los re-renders).
  useEffect(() => { void cargar(); }, [verComo, cargar]);

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { resumen, socios, edificaciones } = datos;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Rendimientos"
        nota="Ingresos menos egresos. Es caja, no contabilidad: no descuenta impuestos ni amortizaciones."
        accion={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {socios.length > 0 && (
              <select value={verComo} onChange={(e) => setVerComo(e.target.value)} style={{ height: 38 }}>
                <option value="">Ver como: Yo</option>
                {socios.map((s) => <option key={s.id} value={s.id}>Ver como: {s.nombre} {s.apellido}</option>)}
              </select>
            )}
            <button className="boton fantasma" onClick={() => setGestionandoSocios((v) => !v)}>
              {gestionandoSocios ? "Cancelar" : "Socios"}
            </button>
          </div>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {edificaciones.length > 0 && <RendimientosEdificacion edificaciones={edificaciones} />}

      {gestionandoSocios && (
        <GestionSocios unidades={unidades} alCambiar={() => void cargar()} />
      )}

      {socios.length > 0 && <ExtractosSocio socios={socios} />}

      <Cifras>
        <Cifra titulo="Ingresos" valor={pesos(resumen.ingresos)} tono="bien" />
        <Cifra titulo="Egresos" valor={pesos(resumen.egresos)} tono="mal" />
        <Cifra titulo="Neto" valor={pesos(resumen.neto)}
          tono={resumen.neto >= 0 ? "bien" : "mal"} />
      </Cifras>

      {resumen.movimientos.length === 0 ? (
        <Vacio titulo="Todavía no hay movimientos">
          Los ingresos por canon van a aparecer solos cuando se verifiquen los pagos.
          Los gastos —administración, predial, reparaciones— se registran en Mis Gastos.
        </Vacio>
      ) : (
        <>
          <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 11 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Por concepto</h2>
            {resumen.porConcepto.map((c) => (
              <Barra key={c.clave} titulo={c.titulo} ingresos={c.ingresos} egresos={c.egresos} neto={c.neto} />
            ))}
          </section>

          <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Movimientos</h2>
            {resumen.movimientos.map((m) => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "9px 0", borderBottom: "1px solid var(--linea)", fontSize: 14,
              }}>
                <span className="num" style={{ width: 96, color: "var(--tinta-2)", fontSize: 13 }}>
                  {String(m.fecha)}
                </span>
                <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                  {m.concepto ?? "Sin clasificar"}
                  <span style={{ color: "var(--tinta-3)", fontSize: 12.5 }}>
                    {" "}· {m.direccion}{m.proveedor ? ` · ${m.proveedor}` : ""}
                  </span>
                </span>
                <span className="num" style={{
                  fontWeight: 600, color: m.tipo === "ingreso" ? "var(--bien)" : "var(--mal)",
                }}>
                  {m.tipo === "ingreso" ? "+" : "−"} {pesos(Number(m.monto))}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/** Una línea con las dos mitades a escala, para comparar de un vistazo. */
function Barra({ titulo, ingresos, egresos, neto }: {
  titulo: string; ingresos: number; egresos: number; neto: number;
}) {
  const total = Math.max(ingresos, egresos, 1);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo}
        </span>
        <span className="num" style={{ fontWeight: 600, color: neto >= 0 ? "var(--bien)" : "var(--mal)" }}>
          {pesos(neto)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 7 }}>
        <div style={{ width: `${(ingresos / total) * 50}%`, background: "var(--bien)", borderRadius: 3 }} />
        <div style={{ width: `${(egresos / total) * 50}%`, background: "var(--mal)", borderRadius: 3 }} />
      </div>
    </div>
  );
}

