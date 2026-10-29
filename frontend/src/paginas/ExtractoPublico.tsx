import { useEffect, useState } from "react";
import { api, mensajeDeError } from "../lib/api";
import { pesos } from "../componentes/Dinero";

type Extracto = Awaited<ReturnType<typeof api.extractos.verPublico.query>>;

function nombreMes(periodo: string): string {
  const [ano, mes] = periodo.split("-");
  const fecha = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El extracto mensual que un socio inversionista recibe por enlace, sin necesitar cuenta en Yalqui. */
export function ExtractoPublico({ token }: { token: string }) {
  const [datos, setDatos] = useState<Extracto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.extractos.verPublico.query({ token }).then(setDatos).catch((e) => setError(mensajeDeError(e)));
  }, [token]);

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 20 }}>
        <div className="aviso malo" role="alert" style={{ maxWidth: 420 }}>{error}</div>
      </div>
    );
  }
  if (datos === null) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "var(--tinta-2)" }}>
        Cargando…
      </div>
    );
  }

  const gastosPorTipo = datos.gastosPorTipo as Array<{ concepto: string; monto: number }>;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: "32px 16px", background: "var(--papel-2)" }}>
      <div className="tarjeta" style={{ width: "100%", maxWidth: 560, padding: 0, overflow: "hidden" }}>
        <div style={{ background: "var(--violeta)", color: "#fff", padding: "20px 24px" }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Extracto de {datos.propietarioNombre} {datos.propietarioApellido}</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{nombreMes(datos.periodo)}</div>
        </div>

        <div style={{ padding: 24, display: "grid", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
            <Dato t="Unidades totales" v={String(datos.unidadesTotales)} />
            <Dato t="Unidades ocupadas" v={String(datos.unidadesOcupadas)} />
            <Dato t="Ingresos" v={pesos(Number(datos.ingresos))} />
            <Dato t="Recaudo" v={pesos(Number(datos.recaudo))} />
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Gastos por tipo</div>
            {gastosPorTipo.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--tinta-3)" }}>Sin gastos este mes.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {gastosPorTipo.map((g) => (
                  <div key={g.concepto} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "4px 0", borderBottom: "1px solid var(--linea)" }}>
                    <span>{g.concepto}</span>
                    <span className="num" style={{ fontWeight: 600 }}>{pesos(Number(g.monto))}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, paddingTop: 6 }}>
                  <span>Total gastos</span>
                  <span className="num">{pesos(Number(datos.gastosTotal))}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 8, paddingTop: 10, borderTop: "1px solid var(--linea)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
              <span>Utilidad de la propiedad</span>
              <span className="num" style={{ fontWeight: 600 }}>{pesos(Number(datos.utilidadPropiedad))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, color: "var(--violeta-hondo)" }}>
              <span>Mi utilidad ({Number(datos.porcentajeSocio).toFixed(1)}%)</span>
              <span className="num">{pesos(Number(datos.utilidadSocio))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
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
