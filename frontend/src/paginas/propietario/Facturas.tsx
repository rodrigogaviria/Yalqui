import { api } from "../../lib/api";
import { pesos } from "../../componentes/Dinero";
import { usePantalla, Encabezado, Cifra, Cifras, Vacio } from "./comun";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  emitida: { texto: "Por pagar", clase: "pausado" },
  parcial: { texto: "Pago parcial", clase: "pausado" },
  pagada: { texto: "Pagada", clase: "arrendado" },
  vencida: { texto: "Vencida", clase: "mora" },
  anulada: { texto: "Anulada", clase: "borrador" },
};

const dia = (f: string | Date) => new Date(f).toLocaleDateString("es-CO", { timeZone: "UTC" });

/**
 * Lo que Yalqui te factura por tu plan y tus servicios.
 *
 * Es otro flujo de plata que el arriendo: el canon va del inquilino a vos
 * sin pasar por Yalqui, y esto es lo único que le pagás a Yalqui.
 */
export function Facturas() {
  const { datos, error } = usePantalla(() => api.plan.misFacturas.query());

  if (error) return <div className="aviso malo" role="alert">{error}</div>;
  if (datos === null) return <p style={{ color: "var(--tinta-2)" }}>Cargando…</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Encabezado
        titulo="Mis Facturas"
        nota="Lo que Yalqui te factura por tu plan y tus servicios. El arriendo no aparece acá: va directo de tu inquilino a vos."
      />

      <Cifras>
        <Cifra titulo="Facturas" valor={String(datos.total)} />
        <Cifra titulo="Por pagar" valor={pesos(datos.pendiente)} tono={datos.pendiente > 0 ? "ojo" : "bien"} />
      </Cifras>

      {datos.total === 0 ? (
        <Vacio titulo="Yalqui todavía no te ha facturado">
          Con el plan Básico no hay cobro. Cuando contrates un plan o un servicio, cada
          factura aparece acá con su detalle.
        </Vacio>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {datos.facturas.map((f) => {
            const e = ESTADO[f.estado] ?? { texto: f.estado, clase: "borrador" };
            return (
              <article key={f.id} className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Factura {f.numero}</div>
                    <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                      Período {f.periodo} · emitida el {dia(f.fechaEmision)} · vence el {dia(f.fechaVencimiento)}
                    </div>
                  </div>
                  <span className={`pastilla ${e.clase}`}>{e.texto}</span>
                  <div style={{ width: 140, textAlign: "right" }}>
                    <div className="num" style={{ fontSize: 15.5, fontWeight: 600 }}>{pesos(Number(f.total))}</div>
                    {Number(f.saldo) > 0 && f.estado !== "anulada" && (
                      <div style={{ fontSize: 12, color: "var(--tinta-3)" }}>saldo {pesos(Number(f.saldo))}</div>
                    )}
                  </div>
                </div>
                {f.conceptos.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--tinta-2)" }}>
                    {f.conceptos.map((c, i) => (
                      <li key={i}>{c.descripcion}{c.cantidad > 1 ? ` × ${c.cantidad}` : ""} · {pesos(Number(c.total))}</li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
