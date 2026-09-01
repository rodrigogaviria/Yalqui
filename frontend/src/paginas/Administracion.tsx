import { useState } from "react";
import { Geografia } from "./admin/Geografia";
import { TiposDeInmuebles, Comercial, Parametros } from "./admin/Catalogos";
import { ServiciosAdicionales, IngresosEgresos, TiposIncidencia, Proveedores } from "./admin/Operativos";
import { Requisitos } from "./admin/Requisitos";
import { Usuarios } from "./admin/Usuarios";

const PESTANAS = [
  ["geografia", "Geografía"],
  ["tipos", "Tipos de inmuebles"],
  ["servicios", "Servicios adicionales"],
  ["movimientos", "Ingresos y egresos"],
  ["incidencias", "Incidencias"],
  ["requisitos", "Requisitos y documentos"],
  ["proveedores", "Proveedores"],
  ["comercial", "Planes y servicios"],
  ["parametros", "Parámetros"],
  ["usuarios", "Usuarios y roles"],
] as const;

type Pestana = (typeof PESTANAS)[number][0];

export function Administracion() {
  const [pestana, setPestana] = useState<Pestana>("geografia");
  const [aviso, setAviso] = useState<string | null>(null);

  // El aviso se limpia al cambiar de pestaña: «Barrio agregado» sobre la tabla
  // de parámetros no le dice nada a nadie.
  function ir(p: Pestana) {
    setAviso(null);
    setPestana(p);
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 27, fontWeight: 600 }}>Administración</h1>
        <p style={{ color: "var(--tinta-2)", margin: "5px 0 0", fontSize: 14.5 }}>
          Lo que configura el sistema sin necesidad de un despliegue.
        </p>
      </div>

      <nav style={{
        display: "flex", gap: 4, borderBottom: "1px solid var(--linea)",
        overflowX: "auto", scrollbarWidth: "thin",
      }}>
        {PESTANAS.map(([v, t]) => (
          <button
            key={v}
            onClick={() => ir(v)}
            aria-current={pestana === v ? "page" : undefined}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "9px 12px",
              fontSize: 14, fontWeight: pestana === v ? 600 : 500, whiteSpace: "nowrap",
              color: pestana === v ? "var(--violeta-hondo)" : "var(--tinta-2)",
              borderBottom: `2px solid ${pestana === v ? "var(--violeta)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {pestana === "geografia" && <Geografia avisar={setAviso} />}
      {pestana === "tipos" && <TiposDeInmuebles avisar={setAviso} />}
      {pestana === "servicios" && <ServiciosAdicionales avisar={setAviso} />}
      {pestana === "movimientos" && <IngresosEgresos avisar={setAviso} />}
      {pestana === "incidencias" && <TiposIncidencia avisar={setAviso} />}
      {pestana === "requisitos" && <Requisitos avisar={setAviso} />}
      {pestana === "proveedores" && <Proveedores avisar={setAviso} />}
      {pestana === "comercial" && <Comercial avisar={setAviso} />}
      {pestana === "parametros" && <Parametros avisar={setAviso} />}
      {pestana === "usuarios" && <Usuarios avisar={setAviso} />}
    </div>
  );
}
