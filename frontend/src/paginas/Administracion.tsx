import { useState } from "react";
import { SECCIONES_ADMIN } from "../lib/menu";
import { Geografia } from "./admin/Geografia";
import { TiposDeInmuebles, Comercial, Parametros } from "./admin/Catalogos";
import { ServiciosAdicionales, IngresosEgresos, TiposIncidencia, Proveedores } from "./admin/Operativos";
import { Requisitos } from "./admin/Requisitos";
import { Plantillas } from "./admin/Plantillas";
import { Usuarios } from "./admin/Usuarios";

/**
 * La configuración del sistema.
 *
 * Qué sección se ve lo decide el menú lateral, no esta pantalla: las diez
 * secciones se despliegan en vertical bajo «Configuración». Antes eran pestañas
 * horizontales y la última no cabía sin desplazar la barra.
 */
export function Administracion({ seccion }: { seccion: string }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const titulo = SECCIONES_ADMIN.find((s) => s.clave === seccion)?.titulo ?? "Configuración";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{
          fontSize: 11.5, letterSpacing: ".7px", textTransform: "uppercase",
          fontWeight: 700, color: "var(--tinta-3)",
        }}>
          Configuración
        </div>
        <h1 style={{ fontSize: 27, fontWeight: 600, margin: "3px 0 0" }}>{titulo}</h1>
      </div>

      {aviso && <div className="aviso bueno" role="status">{aviso}</div>}

      {seccion === "geografia" && <Geografia avisar={setAviso} />}
      {seccion === "tipos" && <TiposDeInmuebles avisar={setAviso} />}
      {seccion === "servicios" && <ServiciosAdicionales avisar={setAviso} />}
      {seccion === "movimientos" && <IngresosEgresos avisar={setAviso} />}
      {seccion === "incidencias" && <TiposIncidencia avisar={setAviso} />}
      {seccion === "requisitos" && <Requisitos avisar={setAviso} />}
      {seccion === "plantillas" && <Plantillas avisar={setAviso} />}
      {seccion === "proveedores" && <Proveedores avisar={setAviso} />}
      {seccion === "comercial" && <Comercial avisar={setAviso} />}
      {seccion === "parametros" && <Parametros avisar={setAviso} />}
      {seccion === "usuarios" && <Usuarios avisar={setAviso} />}
    </div>
  );
}
