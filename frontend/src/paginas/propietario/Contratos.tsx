import { useState } from "react";
import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { Ventana } from "../../componentes/Ventana";
import { abrirArchivo } from "../../lib/archivos";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "borrador" },
  pendiente_firma: { texto: "Esperando firmas", clase: "pausado" },
  vigente: { texto: "Vigente", clase: "arrendado" },
  en_mora: { texto: "En mora", clase: "mora" },
  en_terminacion: { texto: "En terminación", clase: "pausado" },
  terminado: { texto: "Terminado", clase: "borrador" },
};

const ESTADO_FIRMA: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Sin enviar", clase: "borrador" },
  enviado: { texto: "Enlace enviado", clase: "pausado" },
  visto: { texto: "Abrió el enlace", clase: "pausado" },
  firmado: { texto: "Firmó", clase: "arrendado" },
  rechazado: { texto: "Rechazó", clase: "mora" },
  expirado: { texto: "Enlace vencido", clase: "mora" },
};

type Contrato = Awaited<ReturnType<typeof api.contratos.mios.query>>["contratos"][number];

export function Contratos() {
  const { datos, error, aviso, ocupado, accion } = usePantalla(() => api.contratos.mios.query());
  const [viendo, setViendo] = useState<Contrato | null>(null);
  const [enlaces, setEnlaces] = useState<{ contrato: Contrato; lista: Array<{ nombre: string; enlace: string }> } | null>(null);

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const vigentes = datos.contratos.filter((c) => c.estado === "vigente");

  async function enviar(c: Contrato) {
    await accion(c.id,
      async () => {
        const r = await api.contratos.enviarAFirmar.mutate({ inmuebleId: c.inmuebleId, contratoId: c.id });
        setEnlaces({ contrato: c, lista: r.enlaces });
      },
      "Enlaces generados.");
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Contratos"
        nota="El contrato congela el canon y sus ajustes al momento de firmar: cambiar un precio después no altera ningún arriendo vigente."
      />

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      <Cifras>
        <Cifra titulo="Vigentes" valor={String(vigentes.length)} />
        <Cifra titulo="Canon comprometido"
          valor={pesos(vigentes.reduce((t, c) => t + Number(c.canonMensual), 0))} />
        <Cifra titulo="Esperando firmas"
          valor={String(datos.contratos.filter((c) => c.estado === "pendiente_firma").length)}
          tono={datos.contratos.some((c) => c.estado === "pendiente_firma") ? "ojo" : "normal"} />
      </Cifras>

      {datos.total === 0 ? (
        <Vacio titulo="Todavía no hay contratos">
          El contrato se genera cuando aprobás a un interesado. El sistema arma el marco
          legal según el tipo de unidad — en vivienda urbana rige la Ley 820.
        </Vacio>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {datos.contratos.map((c) => {
            const e = ESTADO[c.estado] ?? { texto: c.estado, clase: "borrador" };
            return (
              <article key={c.id} className="tarjeta" style={{
                padding: "15px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
              }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{c.direccion}</div>
                  <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 2 }}>
                    <span className="num">{c.numero}</span> · {c.ciudad} · paga el día{" "}
                    <span className="num">{c.diaPago}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tinta-3)", marginTop: 2 }}>
                    {new Date(c.fechaInicio).toLocaleDateString("es-CO")} —{" "}
                    {new Date(c.fechaFin).toLocaleDateString("es-CO")}
                  </div>
                </div>

                <span className={`pastilla ${e.clase}`}>{e.texto}</span>

                <div style={{ width: 150, textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>
                    {pesos(Number(c.canonMensual))}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>al mes</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
                    onClick={() => setViendo(c)}>
                    Ver contrato
                  </button>
                  {(c.estado === "borrador" || c.estado === "pendiente_firma") && (
                    <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                      disabled={ocupado === c.id}
                      onClick={() => void enviar(c)}>
                      {ocupado === c.id ? "…" : c.estado === "borrador" ? "Enviar a firmar" : "Ver enlaces"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {viendo && (
        <Ventana titulo={`Contrato ${viendo.numero}`} alCerrar={() => setViendo(null)}>
          <DetalleContrato contratoId={viendo.id} />
        </Ventana>
      )}

      {enlaces && (
        <Ventana titulo={`Enlaces para firmar · ${enlaces.contrato.numero}`} alCerrar={() => setEnlaces(null)}>
          <div className="aviso ojo" style={{ marginBottom: 12 }}>
            El envío por WhatsApp y correo todavía no está conectado: nadie los recibe solo.
            Copiá cada enlace y compartiselo vos mismo a quien corresponda.
          </div>
          {enlaces.lista.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>
              No hay firmantes pendientes: ya firmaron todos, o rechazaron.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {enlaces.lista.map((f) => (
                <EnlaceFirma key={f.nombre + f.enlace} nombre={f.nombre} enlace={f.enlace} />
              ))}
            </div>
          )}
        </Ventana>
      )}
    </div>
  );
}

function EnlaceFirma({ nombre, enlace }: { nombre: string; enlace: string }) {
  const [copiado, setCopiado] = useState(false);
  const url = `${window.location.origin}${enlace}`;
  return (
    <div style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--linea)" }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{nombre}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input readOnly value={url} onFocus={(e) => e.target.select()}
          style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12.5 }} />
        <button type="button" className="boton fantasma" style={{ height: 34, fontSize: 13 }}
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            });
          }}>
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function DetalleContrato({ contratoId }: { contratoId: number }) {
  const { datos, error } = usePantalla(() => api.contratos.ver.query({ contratoId }));

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Quién falta por firmar</div>
        <div style={{ display: "grid", gap: 6 }}>
          {datos.firmantes.map((f, i) => {
            const e = ESTADO_FIRMA[f.estado] ?? { texto: f.estado, clase: "borrador" };
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                <span style={{ flex: 1 }}>{f.nombre}</span>
                <span className={`pastilla ${e.clase}`} style={{ fontSize: 11 }}>{e.texto}</span>
              </div>
            );
          })}
        </div>
      </div>

      {datos.archivoId !== null ? (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Documento</div>
          <button className="boton" style={{ height: 38, fontSize: 13.5 }}
            onClick={() => abrirArchivo(datos.archivoId!)}>
            Ver archivo
          </button>
        </div>
      ) : datos.texto ? (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Texto del contrato</div>
          <div style={{
            whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, maxHeight: "50vh", overflowY: "auto",
            border: "1px solid var(--linea)", borderRadius: 10, padding: 14, fontFamily: "ui-monospace, monospace",
          }}>
            {datos.texto}
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-2)" }}>Este contrato no tiene texto ni archivo.</p>
      )}
    </div>
  );
}
