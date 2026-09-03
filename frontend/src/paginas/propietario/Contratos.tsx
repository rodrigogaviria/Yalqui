import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "borrador" },
  pendiente_firma: { texto: "Esperando firmas", clase: "pausado" },
  vigente: { texto: "Vigente", clase: "arrendado" },
  en_mora: { texto: "En mora", clase: "mora" },
  en_terminacion: { texto: "En terminación", clase: "pausado" },
  terminado: { texto: "Terminado", clase: "borrador" },
};

export function Contratos() {
  const { datos, error, aviso, ocupado, accion } = usePantalla(() => api.contratos.mios.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  const vigentes = datos.contratos.filter((c) => c.estado === "vigente");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Contratos"
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

                {c.estado === "borrador" && (
                  <button className="boton" style={{ height: 38, fontSize: 13.5 }}
                    disabled={ocupado === c.id}
                    onClick={() => void accion(c.id,
                      () => api.contratos.enviarAFirmar.mutate({ inmuebleId: c.inmuebleId, contratoId: c.id }),
                      "Enviado a firmar. Cada firmante recibe su enlace.")}>
                    {ocupado === c.id ? "…" : "Enviar a firmar"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
