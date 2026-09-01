import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { etiqueta } from "../lib/etiquetas";
import { pesos } from "../componentes/Dinero";

type Canon = Awaited<ReturnType<typeof api.configuracion.canon.query>>;
type Ajuste = Awaited<ReturnType<typeof api.configuracion.ajustes.query>>[number];
type Requisito = Awaited<ReturnType<typeof api.configuracion.requisitos.query>>[number];

/**
 * Lo que el propietario decide sobre una unidad suya: cuánto vale, qué cobra
 * aparte del canon y qué le exige a quien quiera arrendar.
 *
 * Las tres cosas viven en una sola pantalla porque son una sola decisión: el
 * precio no se entiende sin ver qué servicios lo componen, y los requisitos son
 * la otra mitad de a quién se le está ofreciendo.
 */
export function ConfigurarUnidad({
  inmuebleId, direccion, alVolver,
}: {
  inmuebleId: number;
  direccion: string;
  alVolver: () => void;
}) {
  const [canon, setCanon] = useState<Canon | null>(null);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [requisitos, setRequisitos] = useState<Requisito[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [precios, setPrecios] = useState<Record<number, string>>({});

  const cargar = useCallback(async () => {
    try {
      const [c, a, r] = await Promise.all([
        api.configuracion.canon.query({ inmuebleId }),
        api.configuracion.ajustes.query({ inmuebleId }),
        api.configuracion.requisitos.query({ inmuebleId }),
      ]);
      setCanon(c);
      setAjustes(a);
      setRequisitos(r);
      // El campo de precio arranca con lo configurado, y si no hay nada, con el
      // sugerido del catálogo: es lo que evita que el propietario tenga que
      // inventar un número de cero.
      setPrecios(Object.fromEntries(a.map((x) => [
        x.ajusteId,
        x.disponible && Number(x.valor) > 0
          ? String(Number(x.valor))
          : x.valorSugerido !== null ? String(Number(x.valorSugerido)) : "",
      ])));
      setError(null);
    } catch (e) { setError(mensajeDeError(e)); }
  }, [inmuebleId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(clave: number, fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(clave);
    setError(null);
    try {
      await fn();
      setAviso(mensaje);
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e));
      setAviso(null);
    } finally { setOcupado(null); }
  }

  function guardarAjuste(a: Ajuste, disponible: boolean) {
    const precio = Number(precios[a.ajusteId] ?? "");
    return accion(
      a.ajusteId,
      () => api.configuracion.configurarAjuste.mutate({
        inmuebleId,
        ajusteId: a.ajusteId,
        disponible,
        obligatorio: a.obligatorio,
        ...(a.tipoCalculo === "porcentaje"
          ? { porcentaje: precio }
          : { valor: precio }),
        ...(a.permiteCantidad && a.cantidadMaxima ? { cantidadMaxima: a.cantidadMaxima } : {}),
      }),
      disponible ? `${a.nombre} activado` : `${a.nombre} retirado`,
    );
  }

  if (canon === null) {
    return <p style={{ color: "var(--tinta-2)" }}>Cargando la configuración…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <button className="boton fantasma" style={{ height: 34, fontSize: 13.5, padding: "0 12px", marginBottom: 12 }}
          onClick={alVolver}>
          ← Volver al portafolio
        </button>
        <h1 style={{ fontSize: 27, fontWeight: 600 }}>Configurar la unidad</h1>
        <p style={{ color: "var(--tinta-2)", margin: "5px 0 0", fontSize: 14.5 }}>{direccion}</p>
      </div>

      {error && <div className="aviso malo" role="alert">{error}</div>}
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Lo que va a pagar el inquilino</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            Los servicios obligatorios entran en el canon. Los opcionales los elige el
            inquilino, así que marcan el techo pero no el punto de partida.
          </p>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <Renglon etiqueta="Canon base" valor={canon.base} />
          {!canon.administracionIncluida && canon.administracion > 0 && (
            <Renglon etiqueta="Administración" valor={canon.administracion} />
          )}
          {canon.administracionIncluida && canon.administracion > 0 && (
            <Renglon etiqueta="Administración (ya incluida en el canon)" valor={0} tenue />
          )}
          {canon.obligatorios.map((o) => (
            <Renglon key={o.nombre} etiqueta={o.nombre} valor={o.valor} />
          ))}

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            gap: 12, borderTop: "1px solid var(--linea)", paddingTop: 10, marginTop: 4,
          }}>
            <strong style={{ fontSize: 15.5 }}>Desde</strong>
            <strong className="num" style={{ fontFamily: '"Kufam",sans-serif', fontSize: 25, fontWeight: 600 }}>
              {pesos(canon.desdeElMes)}
            </strong>
          </div>

          {canon.sumaOpcionales > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--tinta-2)" }}>
              <span>Con todos los opcionales ({canon.opcionales.map((o) => o.nombre).join(", ")})</span>
              <span className="num">hasta {pesos(canon.hastaElMes)}</span>
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 12.5, color: "var(--tinta-3)" }}>
          El canon base y la administración se cambian en «Editar» de la unidad.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Servicios adicionales</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            El valor viene sugerido para que no arranques de cero, pero el precio es tuyo.
            Queda congelado en el contrato al firmar, así que cambiarlo después no afecta
            a ningún arriendo vigente.
          </p>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {ajustes.map((a) => (
            <div key={a.ajusteId} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "11px 13px", borderRadius: 10,
              border: `1px solid ${a.disponible ? "var(--violeta)" : "var(--linea)"}`,
              background: a.disponible ? "var(--violeta-tenue)" : "transparent",
            }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.nombre}</div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 1 }}>
                  {etiqueta("categoriaAjuste", a.categoria)} · {etiqueta("periodicidad", a.periodicidad)}
                  {a.disponible && (a.obligatorio ? " · entra en el canon" : " · lo elige el inquilino")}
                </div>
              </div>

              <label className="campo" style={{ width: 150, gap: 3 }}>
                <span className="campo-etiqueta" style={{ fontSize: 12 }}>
                  {a.tipoCalculo === "porcentaje" ? "Porcentaje" : "Valor al mes"}
                </span>
                <input
                  type="number"
                  min={0}
                  step={a.tipoCalculo === "porcentaje" ? 0.5 : 1000}
                  value={precios[a.ajusteId] ?? ""}
                  onChange={(e) => setPrecios((p) => ({ ...p, [a.ajusteId]: e.target.value }))}
                />
              </label>

              <button
                className={a.disponible ? "boton riesgo" : "boton"}
                style={{ height: 38, fontSize: 13.5, padding: "0 14px" }}
                disabled={ocupado === a.ajusteId}
                onClick={() => void guardarAjuste(a, !a.disponible)}
              >
                {ocupado === a.ajusteId ? "…" : a.disponible ? "Retirar" : "Ofrecer"}
              </button>

              {a.disponible && (
                <button
                  className="boton fantasma"
                  style={{ height: 38, fontSize: 13.5, padding: "0 12px" }}
                  disabled={ocupado === a.ajusteId}
                  onClick={() => void accion(
                    a.ajusteId,
                    () => api.configuracion.configurarAjuste.mutate({
                      inmuebleId,
                      ajusteId: a.ajusteId,
                      disponible: true,
                      obligatorio: !a.obligatorio,
                      ...(a.tipoCalculo === "porcentaje"
                        ? { porcentaje: Number(precios[a.ajusteId] ?? "") }
                        : { valor: Number(precios[a.ajusteId] ?? "") }),
                    }),
                    a.obligatorio ? `${a.nombre} pasa a opcional` : `${a.nombre} entra en el canon`,
                  )}
                >
                  {a.obligatorio ? "Hacerlo opcional" : "Incluirlo en el canon"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Requisitos para arrendar</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--tinta-2)" }}>
            Lo que le vas a pedir a quien quiera esta unidad. Cada requisito se cumple con
            alguno de sus documentos, no con todos: es lo que evita que arrendar se vuelva
            un trámite.
          </p>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {requisitos.map((r) => (
            <div key={r.requisitoId} style={{
              display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
              padding: "11px 13px", borderRadius: 10, border: "1px solid var(--linea)",
              opacity: r.exigido ? 1 : 0.55,
            }}>
              <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {r.nombre}
                  <span style={{ fontWeight: 400, color: "var(--tinta-2)", fontSize: 13 }}>
                    {" "}· {etiqueta("aplicaA", r.aplicaA)}
                  </span>
                </div>
                {r.descripcion && (
                  <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>{r.descripcion}</div>
                )}
                <div style={{ fontSize: 12.5, color: "var(--tinta-3)", marginTop: 3 }}>
                  {etiqueta("modoRequisito", r.modo)}: {r.documentos.join(", ") || "sin documentos definidos"}
                </div>
              </div>

              <button
                className={r.exigido ? "boton riesgo" : "boton"}
                style={{ height: 38, fontSize: 13.5, padding: "0 14px" }}
                disabled={ocupado === r.requisitoId}
                onClick={() => void accion(
                  r.requisitoId,
                  () => api.configuracion.configurarRequisito.mutate({
                    inmuebleId, requisitoId: r.requisitoId, exigido: !r.exigido,
                  }),
                  r.exigido ? `Ya no vas a pedir ${r.nombre.toLowerCase()}` : `${r.nombre} agregado`,
                )}
              >
                {ocupado === r.requisitoId ? "…" : r.exigido ? "No pedirlo" : "Pedirlo"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Renglon({ etiqueta: texto, valor, tenue = false }: {
  etiqueta: string; valor: number; tenue?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12,
      fontSize: 14.5, color: tenue ? "var(--tinta-3)" : "var(--tinta)",
    }}>
      <span>{texto}</span>
      <span className="num">{tenue ? "—" : pesos(valor)}</span>
    </div>
  );
}
