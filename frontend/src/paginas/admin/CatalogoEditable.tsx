import { useState } from "react";
import { mensajeDeError } from "../../lib/api";
import { etiqueta, opciones, type Diccionario } from "../../lib/etiquetas";
import { Tabla, Celda, Interruptor } from "./piezas";
import { pesos } from "../../componentes/Dinero";

/**
 * Un campo del catálogo, tal como se ve y como se edita.
 *
 * La especificación es lo que evita escribir diez formularios casi iguales: la
 * diferencia real entre editar un tipo de incidencia y un tipo de documento son
 * los campos, no la mecánica de entrar en edición, guardar y anular.
 */
export interface CampoCatalogo {
  clave: string;
  titulo: string;
  tipo: "texto" | "numero" | "dinero" | "seleccion" | "booleano";
  /** Traduce el código a texto legible, y llena el `<select>` al editar. */
  diccionario?: Diccionario;
  ancho?: number;
  /** El código de un catálogo no se edita: es la llave con la que el código lo
   *  referencia. Renombrar lo que se lee es otra cosa y sí se puede. */
  editable?: boolean;
  /** Al registrar, no bloquea el botón de guardar si queda vacío. */
  opcional?: boolean;
  /** Texto bajo el valor, para explicar sin ocupar otra columna. */
  detalle?: (fila: Record<string, unknown>) => string | null;
}

type Fila = Record<string, unknown> & { id: number; activo: boolean };

export function CatalogoEditable({
  filas, campos, alGuardar, alAnular, ocupado = false,
}: {
  filas: Fila[];
  campos: CampoCatalogo[];
  alGuardar: (id: number, cambios: Record<string, unknown>) => Promise<void>;
  alAnular: (id: number, activo: boolean) => Promise<void>;
  ocupado?: boolean;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function empezar(fila: Fila) {
    setError(null);
    setEditando(fila.id);
    setBorrador(Object.fromEntries(
      campos.filter((c) => c.editable !== false).map((c) => [c.clave, fila[c.clave]]),
    ));
  }

  async function guardar(fila: Fila) {
    setGuardando(true);
    setError(null);
    try {
      // Solo lo que cambió de verdad: mandar el registro entero haría que
      // cualquier edición pareciera tocar todos los campos.
      const cambios: Record<string, unknown> = {};
      for (const c of campos) {
        if (c.editable === false) continue;
        const nuevo = borrador[c.clave];
        if (nuevo !== fila[c.clave] && nuevo !== "" && nuevo !== null) cambios[c.clave] = nuevo;
      }
      if (Object.keys(cambios).length > 0) await alGuardar(fila.id, cambios);
      setEditando(null);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {error && <div className="aviso malo" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <Tabla columnas={[...campos.map((c) => c.titulo), "Activo", "Acciones"]}>
        {filas.map((fila) => {
          const enEdicion = editando === fila.id;
          return (
            <tr key={fila.id} style={{ opacity: fila.activo ? 1 : 0.5 }}>
              {campos.map((c) => (
                <Celda key={c.clave} ancho={c.ancho}>
                  {enEdicion && c.editable !== false
                    ? <Entrada campo={c} valor={borrador[c.clave]}
                        alCambiar={(v) => setBorrador((b) => ({ ...b, [c.clave]: v }))} />
                    : <Valor campo={c} fila={fila} />}
                </Celda>
              ))}

              <Celda ancho={70}>
                <Interruptor
                  activo={fila.activo}
                  ocupado={ocupado || guardando}
                  onChange={(v) => void alAnular(fila.id, v)}
                />
              </Celda>

              <Celda ancho={150}>
                {enEdicion ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="boton" style={BOTON} disabled={guardando}
                      onClick={() => void guardar(fila)}>
                      {guardando ? "…" : "Guardar"}
                    </button>
                    <button className="boton fantasma" style={BOTON} disabled={guardando}
                      onClick={() => { setEditando(null); setError(null); }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className="boton fantasma" style={BOTON} onClick={() => empezar(fila)}>
                    Editar
                  </button>
                )}
              </Celda>
            </tr>
          );
        })}
      </Tabla>
    </>
  );
}

const BOTON = { height: 32, fontSize: 13, padding: "0 11px" } as const;

function Valor({ campo, fila }: { campo: CampoCatalogo; fila: Fila }) {
  const v = fila[campo.clave];
  const detalle = campo.detalle?.(fila) ?? null;

  let texto: string;
  if (v === null || v === undefined || v === "") texto = "—";
  else if (campo.tipo === "booleano") texto = v ? "Sí" : "No";
  else if (campo.tipo === "dinero") texto = pesos(Number(v));
  else if (campo.diccionario) texto = etiqueta(campo.diccionario, String(v));
  else texto = String(v);

  return (
    <>
      <span className={campo.tipo === "dinero" || campo.tipo === "numero" ? "num" : undefined}>
        {texto}
      </span>
      {detalle && (
        <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2, maxWidth: 380 }}>
          {detalle}
        </div>
      )}
    </>
  );
}

export function Entrada({ campo, valor, alCambiar }: {
  campo: CampoCatalogo;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  if (campo.tipo === "booleano") {
    return (
      <input type="checkbox" checked={Boolean(valor)}
        onChange={(e) => alCambiar(e.target.checked)}
        style={{ width: 18, height: 18 }} />
    );
  }

  if (campo.tipo === "seleccion" && campo.diccionario) {
    return (
      <select value={String(valor ?? "")} onChange={(e) => alCambiar(e.target.value)}>
        {opciones(campo.diccionario).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    );
  }

  if (campo.tipo === "numero" || campo.tipo === "dinero") {
    return (
      <input
        type="number"
        min={0}
        step={campo.tipo === "dinero" ? 1000 : 1}
        value={valor === null || valor === undefined ? "" : String(Number(valor))}
        // Vacío es «sin valor», no cero: un documento sin vigencia no caduca,
        // y no es lo mismo que uno que caduca en cero días.
        onChange={(e) => alCambiar(e.target.value === "" ? null : Number(e.target.value))}
        style={{ width: campo.tipo === "dinero" ? 130 : 90 }}
      />
    );
  }

  return (
    <input value={String(valor ?? "")} onChange={(e) => alCambiar(e.target.value)} />
  );
}
