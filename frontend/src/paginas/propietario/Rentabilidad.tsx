import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Campo } from "../../componentes/Campo";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

type Socio = Awaited<ReturnType<typeof api.rentabilidad.misSociosInversionistas.query>>[number];
type Extracto = Awaited<ReturnType<typeof api.extractos.mios.query>>[number];
type DuenoUnidad = Awaited<ReturnType<typeof api.inmuebles.sociosDe.query>>[number];

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
        tipoDocumento, numeroDocumento: numeroDocumento.trim(), porcentaje: Number(porcentaje),
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
 * Qué entra y qué sale de cada unidad.
 *
 * El neto es ingresos menos egresos, sin más: es caja, no contabilidad. No
 * descuenta impuestos ni amortizaciones, y decir «rentabilidad» de otra forma
 * exigiría datos que el sistema no tiene.
 */
export function Rentabilidad({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [registrando, setRegistrando] = useState(false);
  const [gestionandoSocios, setGestionandoSocios] = useState(false);
  const [verComo, setVerComo] = useState("");
  const { datos, error, aviso, ocupado, accion, cargar } = usePantalla(async () => {
    const [resumen, tipos, proveedores, socios] = await Promise.all([
      api.rentabilidad.resumen.query({ ...(verComo ? { verComoSocioId: Number(verComo) } : {}) }),
      api.rentabilidad.tipos.query(),
      api.rentabilidad.proveedores.query(),
      api.rentabilidad.misSociosInversionistas.query(),
    ]);
    return { resumen, tipos, proveedores, socios };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  // El resumen cambia según a quién se está viendo: se recarga aparte, no en
  // el montaje único de usePantalla (ese ignora a propósito los re-renders).
  useEffect(() => { void cargar(); }, [verComo, cargar]);

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const { resumen, tipos, proveedores, socios } = datos;

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
            <button className="boton" onClick={() => setRegistrando((v) => !v)}>
              {registrando ? "Cancelar" : "Registrar movimiento"}
            </button>
          </div>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {gestionandoSocios && (
        <GestionSocios unidades={unidades} alCambiar={() => void cargar()} />
      )}

      {socios.length > 0 && <ExtractosSocio socios={socios} />}

      {registrando && (
        <Formulario
          unidades={unidades}
          tipos={tipos}
          proveedores={proveedores}
          ocupado={ocupado === "nuevo"}
          alRegistrar={(entrada) => void accion("nuevo",
            () => api.rentabilidad.registrar.mutate(entrada),
            "Movimiento registrado.").then(() => setRegistrando(false))}
        />
      )}

      <Cifras>
        <Cifra titulo="Ingresos" valor={pesos(resumen.ingresos)} tono="bien" />
        <Cifra titulo="Egresos" valor={pesos(resumen.egresos)} tono="mal" />
        <Cifra titulo="Neto" valor={pesos(resumen.neto)}
          tono={resumen.neto >= 0 ? "bien" : "mal"} />
      </Cifras>

      {resumen.movimientos.length === 0 ? (
        <Vacio titulo="Todavía no hay movimientos">
          Los ingresos por canon van a aparecer solos cuando se verifiquen los pagos.
          Los gastos —administración, predial, reparaciones— se registran acá.
        </Vacio>
      ) : (
        <>
          <section className="tarjeta" style={{ padding: "18px 20px", display: "grid", gap: 11 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Por unidad</h2>
            {resumen.porUnidad.map((u) => (
              <Barra key={u.clave} titulo={u.titulo} ingresos={u.ingresos} egresos={u.egresos} neto={u.neto} />
            ))}
          </section>

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

function Formulario({ unidades, tipos, proveedores, ocupado, alRegistrar }: {
  unidades: Array<{ id: number; titulo: string }>;
  tipos: Awaited<ReturnType<typeof api.rentabilidad.tipos.query>>;
  proveedores: Awaited<ReturnType<typeof api.rentabilidad.proveedores.query>>;
  ocupado: boolean;
  alRegistrar: (e: {
    inmuebleId: number; tipoMovimientoId: number; monto: number; fecha: string;
    proveedorId?: number; nota?: string;
  }) => void;
}) {
  const [inmuebleId, setInmuebleId] = useState(String(unidades[0]?.id ?? ""));
  const [tipoId, setTipoId] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [proveedorId, setProveedorId] = useState("");
  const [nota, setNota] = useState("");

  if (unidades.length === 0) {
    return <div className="aviso ojo">Registrá una unidad antes de anotar movimientos.</div>;
  }

  const ingresos = tipos.filter((t) => t.tipo === "ingreso");
  const egresos = tipos.filter((t) => t.tipo === "egreso");
  const esEgreso = egresos.some((t) => String(t.id) === tipoId);

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Registrar un movimiento</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <Campo etiqueta="Unidad">
          <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Concepto" ayuda="El concepto decide si suma o resta">
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Elegí uno…</option>
            <optgroup label="Ingresos">
              {ingresos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </optgroup>
            <optgroup label="Egresos">
              {egresos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </optgroup>
          </select>
        </Campo>
        <Campo etiqueta="Monto">
          <input type="number" min={0} step={1000} value={monto}
            onChange={(e) => setMonto(e.target.value)} placeholder="320000" />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        {esEgreso && (
          <Campo etiqueta="Proveedor" ayuda="A quién se le pagó">
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Elegí uno…</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razonSocial}</option>)}
            </select>
          </Campo>
        )}
      </div>

      <Campo etiqueta="Nota" ayuda="Opcional">
        <input value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>

      <div>
        <button className="boton"
          disabled={ocupado || tipoId === "" || Number(monto) <= 0 || (esEgreso && proveedorId === "")}
          onClick={() => alRegistrar({
            inmuebleId: Number(inmuebleId),
            tipoMovimientoId: Number(tipoId),
            monto: Number(monto),
            fecha,
            ...(esEgreso ? { proveedorId: Number(proveedorId) } : {}),
            ...(nota.trim() === "" ? {} : { nota: nota.trim() }),
          })}>
          {ocupado ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </section>
  );
}
