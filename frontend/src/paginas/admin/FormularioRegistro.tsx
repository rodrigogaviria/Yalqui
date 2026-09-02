import { useState } from "react";
import { mensajeDeError } from "../../lib/api";
import { Entrada, type CampoCatalogo } from "./CatalogoEditable";
import { opciones } from "../../lib/etiquetas";

/**
 * El formulario de alta de cualquier catálogo, plegado bajo un botón.
 *
 * Usa la misma especificación de campos que la edición (`CampoCatalogo`): la
 * diferencia entre dar de alta un tipo de incidencia y uno de documento son los
 * campos, no la mecánica de abrir el formulario, validar y enviar. Definir el
 * catálogo una vez y obtener alta y edición juntas es lo que evita que una de
 * las dos quede atrás cuando se agrega un campo.
 */
export function FormularioRegistro({
  titulo, campos, alRegistrar, ocupado = false,
}: {
  /** Lo que dice el botón plegado, p. ej. «Registrar servicio». */
  titulo: string;
  campos: CampoCatalogo[];
  alRegistrar: (valores: Record<string, unknown>) => Promise<void>;
  ocupado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, unknown>>(() => iniciales(campos));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // `editable: false` en la especificación dice «no se toca después de creado»,
  // no «no se pide al crear» — el código de un catálogo se escribe una vez,
  // acá, y por eso el alta ignora esa marca y pide todos los campos.
  const obligatorios = campos.filter((c) => c.tipo !== "booleano" && !c.opcional);
  const completo = obligatorios.every((c) => {
    const v = valores[c.clave];
    return v !== undefined && v !== null && v !== "";
  });

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      // Los campos vacíos se omiten en vez de mandarse como "": un backend que
      // espera un número opcional ausente rechaza una cadena vacía, y omitir
      // es justamente lo que «no lo llené» significa.
      const limpio = Object.fromEntries(
        Object.entries(valores).filter(([, v]) => v !== "" && v !== null),
      );
      await alRegistrar(limpio);
      setValores(iniciales(campos));
      setAbierto(false);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }} onClick={() => setAbierto(true)}>
        + {titulo}
      </button>
    );
  }

  return (
    <div style={{
      border: "1px solid var(--violeta)", borderRadius: 11, padding: 16,
      background: "var(--violeta-tenue)", display: "grid", gap: 12,
    }}>
      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{titulo}</div>

      {error && <div className="aviso malo" role="alert">{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        {campos.map((c) => (
          <label key={c.clave} className="campo" style={{ gap: 4 }}>
            <span className="campo-etiqueta" style={{ fontSize: 12 }}>{c.titulo}</span>
            <Entrada campo={c} valor={valores[c.clave]}
              alCambiar={(v) => setValores((val) => ({ ...val, [c.clave]: v }))} />
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="boton" style={{ height: 38, fontSize: 13.5 }}
          disabled={enviando || ocupado || !completo}
          onClick={() => void enviar()}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        <button className="boton fantasma" style={{ height: 38, fontSize: 13.5 }}
          disabled={enviando}
          onClick={() => { setAbierto(false); setError(null); setValores(iniciales(campos)); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Los booleanos arrancan en falso y el resto vacío, salvo un `seleccion`: ese
 * arranca en su primera opción, porque el `<select>` del navegador ya la
 * muestra elegida aunque el estado dijera vacío — sin esto, enviar sin tocar
 * el campo mandaría el valor visible, no el que React creía tener.
 */
function iniciales(campos: CampoCatalogo[]): Record<string, unknown> {
  return Object.fromEntries(campos.map((c) => {
    if (c.tipo === "booleano") return [c.clave, false];
    if (c.tipo === "seleccion" && c.diccionario) return [c.clave, opciones(c.diccionario)[0]?.[0] ?? ""];
    return [c.clave, ""];
  }));
}
