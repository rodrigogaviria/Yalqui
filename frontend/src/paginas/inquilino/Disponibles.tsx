import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Vacio } from "../propietario/comun";

const ESTADO_PROMOCION: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pedido enviado", clase: "pausado" },
  aprobada: { texto: "Aprobada", clase: "arrendado" },
  rechazada: { texto: "Rechazada", clase: "mora" },
};

/** Las unidades sin alquilar: si conocés a alguien interesado, pedí promocionarla. */
export function Disponibles() {
  const { datos, error, aviso, ocupado, accion } = usePantalla(() => api.promociones.disponibles.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Disponibles"
        nota="Unidades de Yalqui sin alquilar. Si conocés a alguien interesado, pedí promocionarla: si se arrienda por tu intermedio, podés ganar una comisión."
      />
      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {datos.length === 0 && <Vacio titulo="No hay unidades disponibles por ahora" />}

      <div style={{ display: "grid", gap: 10 }}>
        {datos.map((u) => {
          const e = u.miEstado ? ESTADO_PROMOCION[u.miEstado] : undefined;
          return (
            <article key={u.id} className="tarjeta" style={{
              padding: "15px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {u.direccion}{u.complemento ? `, ${u.complemento}` : ""}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                  {u.barrio ? `${u.barrio}, ` : ""}{u.ciudad}
                </div>
              </div>
              <div style={{ width: 130, textAlign: "right" }}>
                <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(u.canonBase))}</div>
                <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>al mes</div>
              </div>
              {u.comisionPromotorPct !== null && (
                <span className="pastilla publicado" style={{ fontSize: 12 }}>
                  Comisión {Number(u.comisionPromotorPct)}%
                </span>
              )}
              {e ? (
                <span className={`pastilla ${e.clase}`}>{e.texto}</span>
              ) : (
                <button className="boton" style={{ height: 36, fontSize: 13.5 }}
                  disabled={ocupado === u.id}
                  onClick={() => void accion(u.id,
                    () => api.promociones.promocionar.mutate({ inmuebleId: u.id }),
                    "Pedido enviado. Tu arrendador lo va a revisar.")}>
                  {ocupado === u.id ? "…" : "Me interesa promocionarlo"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
