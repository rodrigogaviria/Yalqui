import { useState } from "react";
import { api } from "../../lib/api";
import { Campo } from "../../componentes/Campo";
import { usePantalla, Encabezado, Vacio } from "./comun";

const TIPOS: Array<[string, string]> = [
  ["aviso", "Aviso"],
  ["mantenimiento", "Mantenimiento"],
  ["incremento_canon", "Incremento de canon"],
  ["recordatorio", "Recordatorio"],
  ["emergencia", "Emergencia"],
  ["normativo", "Normativo"],
];

const CANALES: Array<[string, string]> = [
  ["app", "En la aplicación"],
  ["whatsapp", "WhatsApp"],
  ["email", "Correo"],
];

/**
 * Los avisos que el propietario le manda a sus inquilinos.
 *
 * Se guarda como borrador y se envía aparte, a propósito: un aviso de aumento
 * de canon merece releerse al día siguiente, y enviar al guardar no deja
 * arrepentirse.
 */
export function Comunicados({ unidades }: { unidades: Array<{ id: number; titulo: string }> }) {
  const [redactando, setRedactando] = useState(false);
  const { datos, error, aviso, ocupado, accion } = usePantalla(() => api.comunicados.mios.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Comunicados"
        nota="Se guardan como borrador y se envían cuando vos decidas. Nada sale al escribirlo."
        accion={
          <button className="boton" onClick={() => setRedactando((v) => !v)}>
            {redactando ? "Cancelar" : "Redactar"}
          </button>
        }
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <div className="aviso ojo">
        El envío por WhatsApp y correo todavía no está conectado: la Lambda no tiene salida
        a internet. Enviar deja el comunicado registrado como enviado para que el historial
        quede correcto, pero <strong>nadie lo recibe todavía</strong>.
      </div>

      {redactando && (
        <Formulario
          unidades={unidades}
          ocupado={ocupado === "nuevo"}
          alRedactar={(entrada) => void accion("nuevo",
            () => api.comunicados.redactar.mutate(entrada),
            "Comunicado guardado en borrador.").then(() => setRedactando(false))}
        />
      )}

      {datos.total === 0 ? (
        <Vacio titulo="Todavía no escribiste ninguno">
          Sirven para avisar de un mantenimiento, recordar una fecha de pago o notificar
          un incremento con la antelación que exige la ley.
        </Vacio>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {datos.comunicados.map((c) => (
            <article key={c.id} className="tarjeta" style={{ padding: "15px 18px", display: "grid", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{c.titulo}</div>
                  <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 2 }}>
                    {c.direccion}{c.complemento ? `, ${c.complemento}` : ""}
                    {" · "}{TIPOS.find(([v]) => v === c.tipo)?.[1] ?? c.tipo}
                  </div>
                </div>
                <span className={`pastilla ${c.estado === "enviado" ? "arrendado" : "borrador"}`}>
                  {c.estado === "enviado" ? "Enviado" : "Borrador"}
                </span>
              </div>

              <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)", whiteSpace: "pre-wrap" }}>
                {c.cuerpo.length > 260 ? `${c.cuerpo.slice(0, 260)}…` : c.cuerpo}
              </p>

              {c.estado !== "enviado" && (
                <div>
                  <button className="boton" style={{ height: 36, fontSize: 13.5 }}
                    disabled={ocupado === c.id}
                    onClick={() => void accion(c.id,
                      () => api.comunicados.enviar.mutate({ comunicadoId: c.id }),
                      "Comunicado marcado como enviado.")}>
                    {ocupado === c.id ? "…" : "Enviar"}
                  </button>
                </div>
              )}

              {c.enviadoAt && (
                <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>
                  Enviado el {new Date(c.enviadoAt).toLocaleDateString("es-CO")}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Formulario({ unidades, ocupado, alRedactar }: {
  unidades: Array<{ id: number; titulo: string }>;
  ocupado: boolean;
  alRedactar: (e: {
    inmuebleId: number; titulo: string; cuerpo: string;
    tipo: "aviso"; canales: Array<"app" | "whatsapp" | "email">;
  }) => void;
}) {
  const [inmuebleId, setInmuebleId] = useState(String(unidades[0]?.id ?? ""));
  const [tipo, setTipo] = useState("aviso");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [canales, setCanales] = useState<string[]>(["app"]);

  if (unidades.length === 0) {
    return <div className="aviso ojo">Registrá una unidad antes de escribir un comunicado.</div>;
  }

  return (
    <section className="tarjeta" style={{ padding: 22, display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Redactar</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <Campo etiqueta="Unidad">
          <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
      </div>

      <Campo etiqueta="Asunto">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
          placeholder="Corte de agua el jueves" />
      </Campo>

      <Campo etiqueta="Mensaje">
        <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={5} />
      </Campo>

      <div className="campo">
        <span className="campo-etiqueta">Por dónde</span>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {CANALES.map(([v, t]) => (
            <label key={v} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={canales.includes(v)}
                onChange={(e) => setCanales((c) =>
                  e.target.checked ? [...c, v] : c.filter((x) => x !== v))}
                style={{ width: 17, height: 17 }}
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div>
        <button className="boton"
          disabled={ocupado || titulo.trim().length < 4 || cuerpo.trim().length < 10 || canales.length === 0}
          onClick={() => alRedactar({
            inmuebleId: Number(inmuebleId),
            titulo: titulo.trim(),
            cuerpo: cuerpo.trim(),
            tipo: tipo as "aviso",
            canales: canales as Array<"app" | "whatsapp" | "email">,
          })}>
          {ocupado ? "Guardando…" : "Guardar en borrador"}
        </button>
      </div>
    </section>
  );
}
