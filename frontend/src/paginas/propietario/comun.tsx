import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { mensajeDeError } from "../../lib/api";

/**
 * El ciclo cargar → actuar → recargar, que es el mismo en las ocho pantallas
 * del propietario. Escribirlo una vez evita ocho copias que se van separando.
 */
export function usePantalla<T>(traer: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | string | null>(null);

  const cargar = useCallback(async () => {
    try { setDatos(await traer()); setError(null); }
    catch (e) { setError(mensajeDeError(e)); }
    // `traer` se recrea en cada render; incluirlo dispararía recargas sin fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(clave: number | string, fn: () => Promise<unknown>, mensaje: string) {
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

  return { datos, error, aviso, ocupado, cargar, accion, setAviso, setError };
}

export function Encabezado({ titulo, nota, accion }: {
  titulo: string; nota?: string; accion?: ReactNode;
}) {
  return (
    <header style={{
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 16, flexWrap: "wrap",
    }}>
      <div>
        <h1 style={{ fontSize: 27, fontWeight: 600, margin: 0 }}>{titulo}</h1>
        {nota && (
          <p style={{ color: "var(--tinta-2)", margin: "5px 0 0", fontSize: 14.5, maxWidth: "72ch" }}>
            {nota}
          </p>
        )}
      </div>
      {accion}
    </header>
  );
}

export function Cifra({ titulo, valor, tono = "normal", pie }: {
  titulo: string; valor: string; tono?: "normal" | "bien" | "mal" | "ojo"; pie?: string;
}) {
  const color = tono === "bien" ? "var(--bien)" : tono === "mal" ? "var(--mal)"
    : tono === "ojo" ? "var(--ojo)" : "var(--tinta)";
  return (
    <div className="tarjeta" style={{ padding: "17px 19px" }}>
      <div style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>{titulo}</div>
      <div className="num" style={{
        fontFamily: '"Kufam",sans-serif', fontSize: 26, fontWeight: 600, marginTop: 5, color,
      }}>
        {valor}
      </div>
      {pie && <div style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 2 }}>{pie}</div>}
    </div>
  );
}

export function Cifras({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
      {children}
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="tarjeta vacio">
      <p style={{ margin: "0 0 6px", fontSize: 17, color: "var(--tinta)", fontWeight: 600 }}>{titulo}</p>
      {children && <p style={{ margin: "0 auto", maxWidth: "54ch" }}>{children}</p>}
    </div>
  );
}
