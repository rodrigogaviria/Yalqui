import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "../../lib/api";
import { Seccion } from "./piezas";
import { CatalogoEditable, type CampoCatalogo } from "./CatalogoEditable";
import { FormularioRegistro } from "./FormularioRegistro";

/** Envuelve el ciclo cargar → editar → recargar, que es idéntico en todos. */
function useCatalogo<T>(traer: () => Promise<T[]>, avisar: (m: string) => void) {
  const [filas, setFilas] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try { setFilas(await traer()); setError(null); }
    catch (e) { setError(mensajeDeError(e)); }
    // `traer` se recrea en cada render del padre; incluirlo en las dependencias
    // dispararía una recarga infinita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    try { await fn(); avisar(mensaje); await cargar(); }
    finally { setOcupado(false); }
  }

  return { filas, error, ocupado, cargar, accion };
}

// ---------------------------------------------------------------------------

export function ServiciosAdicionales({ avisar }: { avisar: (m: string) => void }) {
  const { filas, error, ocupado, accion } =
    useCatalogo(() => api.admin.operativos.servicios.query(), avisar);

  const campos: CampoCatalogo[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 150 },
    { clave: "nombre", titulo: "Servicio", tipo: "texto" },
    { clave: "categoria", titulo: "Categoría", tipo: "seleccion", diccionario: "categoriaAjuste", ancho: 150 },
    { clave: "tipoCalculo", titulo: "Cálculo", tipo: "seleccion", diccionario: "tipoCalculo", ancho: 150 },
    { clave: "periodicidad", titulo: "Periodicidad", tipo: "seleccion", diccionario: "periodicidad", ancho: 130 },
    { clave: "valorSugerido", titulo: "Valor sugerido", tipo: "dinero", ancho: 160, opcional: true },
  ];

  return (
    <Seccion
      titulo="Servicios adicionales"
      nota="Lo que se puede cobrar además del canon. El valor sugerido es un punto de partida para que el formulario no arranque en cero; el precio real de cada unidad se fija en la unidad, y queda congelado en el contrato al firmar."
    >
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <FormularioRegistro
        titulo="Registrar servicio"
        ocupado={ocupado}
        campos={[...campos, { clave: "permiteCantidad", titulo: "Permite varias unidades", tipo: "booleano" }]}
        alRegistrar={(v) => accion(
          () => api.admin.operativos.crearServicio.mutate(v as never),
          "Servicio registrado",
        )}
      />

      {filas && (
        <CatalogoEditable
          filas={filas}
          campos={campos}
          ocupado={ocupado}
          alGuardar={(id, cambios) => accion(
            () => api.admin.operativos.editarServicio.mutate({ servicioId: id, ...cambios }),
            "Servicio actualizado",
          )}
          alAnular={(id, activo) => accion(
            () => api.admin.operativos.anular.mutate({ catalogo: "servicio", id, activo }),
            activo ? "Servicio reactivado" : "Servicio anulado",
          )}
        />
      )}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------

export function IngresosEgresos({ avisar }: { avisar: (m: string) => void }) {
  const { filas, error, ocupado, accion } =
    useCatalogo(() => api.admin.operativos.movimientos.query(), avisar);

  const campos: CampoCatalogo[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 180 },
    { clave: "nombre", titulo: "Concepto", tipo: "texto" },
    { clave: "ambito", titulo: "Ámbito", tipo: "seleccion", diccionario: "ambitoGasto", ancho: 130 },
    { clave: "responsable", titulo: "Lo asume", tipo: "seleccion", diccionario: "responsable", ancho: 140 },
    { clave: "deducible", titulo: "Deducible", tipo: "booleano", ancho: 100 },
  ];

  const guardar = (id: number, cambios: Record<string, unknown>) => accion(
    () => api.admin.operativos.editarMovimiento.mutate({ movimientoId: id, ...cambios }),
    "Concepto actualizado",
  );
  const anular = (id: number, activo: boolean) => accion(
    () => api.admin.operativos.anular.mutate({ catalogo: "movimiento", id, activo }),
    activo ? "Concepto reactivado" : "Concepto anulado",
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <Seccion titulo="Tipos de ingreso" nota="Con qué conceptos entra dinero a un inmueble.">
        <FormularioRegistro
          titulo="Registrar tipo de ingreso"
          ocupado={ocupado}
          campos={campos.filter((c) => c.clave !== "deducible")}
          alRegistrar={(v) => accion(
            () => api.admin.operativos.crearMovimiento.mutate({ ...v, tipo: "ingreso" } as never),
            "Tipo de ingreso registrado",
          )}
        />
        {filas && (
          <CatalogoEditable filas={filas.filter((f) => f.tipo === "ingreso")}
            campos={campos.filter((c) => c.clave !== "deducible")}
            ocupado={ocupado} alGuardar={guardar} alAnular={anular} />
        )}
      </Seccion>

      <Seccion
        titulo="Tipos de egreso"
        nota="Un egreso de la edificación se prorratea entre sus unidades; uno de la unidad no. Es la diferencia entre pintar la fachada y arreglar un grifo. Lo deducible baja la renta del propietario."
      >
        <FormularioRegistro
          titulo="Registrar tipo de egreso"
          ocupado={ocupado}
          campos={campos}
          alRegistrar={(v) => accion(
            () => api.admin.operativos.crearMovimiento.mutate({ ...v, tipo: "egreso" } as never),
            "Tipo de egreso registrado",
          )}
        />
        {filas && (
          <CatalogoEditable filas={filas.filter((f) => f.tipo === "egreso")}
            campos={campos} ocupado={ocupado} alGuardar={guardar} alAnular={anular} />
        )}
      </Seccion>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TiposIncidencia({ avisar }: { avisar: (m: string) => void }) {
  const { filas, error, ocupado, accion } =
    useCatalogo(() => api.admin.operativos.incidencias.query(), avisar);

  const campos: CampoCatalogo[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto", editable: false, ancho: 160 },
    {
      clave: "nombre", titulo: "Tipo", tipo: "texto",
      detalle: (f) => (f["descripcion"] as string | null) ?? null,
    },
    { clave: "ambito", titulo: "Ámbito", tipo: "seleccion", diccionario: "ambitoIncidencia", ancho: 140 },
    { clave: "prioridadSugerida", titulo: "Prioridad", tipo: "seleccion", diccionario: "prioridad", ancho: 120 },
    { clave: "slaHoras", titulo: "SLA (horas)", tipo: "numero", ancho: 120, opcional: true },
    { clave: "responsableSugerido", titulo: "Lo asume", tipo: "seleccion", diccionario: "responsable", ancho: 140 },
  ];

  return (
    <Seccion
      titulo="Tipos de incidencia"
      nota="El SLA en horas calcula solo el vencimiento de cada incidencia, sin que nadie lo escriba a mano. Estos mismos tipos son el vocabulario de especialidades de los proveedores: uno atiende los que sabe resolver, y así no hay dos listas que se desincronicen."
    >
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <FormularioRegistro
        titulo="Registrar tipo de incidencia"
        ocupado={ocupado}
        campos={campos}
        alRegistrar={(v) => accion(
          () => api.admin.operativos.crearIncidencia.mutate(v as never),
          "Tipo registrado",
        )}
      />

      {filas && (
        <CatalogoEditable
          filas={filas}
          campos={campos}
          ocupado={ocupado}
          alGuardar={(id, cambios) => accion(
            () => api.admin.operativos.editarIncidencia.mutate({ incidenciaId: id, ...cambios }),
            "Tipo actualizado",
          )}
          alAnular={(id, activo) => accion(
            () => api.admin.operativos.anular.mutate({ catalogo: "incidencia", id, activo }),
            activo ? "Tipo reactivado" : "Tipo anulado",
          )}
        />
      )}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------

export function Proveedores({ avisar }: { avisar: (m: string) => void }) {
  const { filas, error, ocupado, accion } =
    useCatalogo(() => api.admin.operativos.proveedores.query(), avisar);

  const campos: CampoCatalogo[] = [
    { clave: "razonSocial", titulo: "Razón social", tipo: "texto" },
    { clave: "nit", titulo: "NIT", tipo: "texto", ancho: 150, opcional: true },
    { clave: "ciudad", titulo: "Ciudad", tipo: "texto", ancho: 160, opcional: true },
    { clave: "telefono", titulo: "Teléfono", tipo: "texto", ancho: 150, opcional: true },
    { clave: "email", titulo: "Correo", tipo: "texto", ancho: 220, opcional: true },
  ];

  return (
    <Seccion
      titulo="Proveedores"
      nota="Quiénes atienden las incidencias. Sus especialidades son códigos de tipos de incidencia."
    >
      {error && <div className="aviso malo" role="alert">{error}</div>}

      <FormularioRegistro
        titulo="Registrar proveedor"
        ocupado={ocupado}
        campos={campos}
        alRegistrar={(v) => accion(
          () => api.admin.operativos.crearProveedor.mutate(v as never),
          "Proveedor registrado",
        )}
      />

      {filas && filas.length === 0 && (
        <p style={{ color: "var(--tinta-3)", fontSize: 14, padding: "4px 0 14px" }}>
          Todavía no hay proveedores registrados. También se dan de alta solos desde el flujo
          de incidencias, cuando se asigna uno por primera vez.
        </p>
      )}
      {filas && filas.length > 0 && (
        <CatalogoEditable
          filas={filas}
          campos={campos}
          ocupado={ocupado}
          alGuardar={(id, cambios) => accion(
            () => api.admin.operativos.editarProveedor.mutate({ proveedorId: id, ...cambios }),
            "Proveedor actualizado",
          )}
          alAnular={(id, activo) => accion(
            () => api.admin.operativos.anular.mutate({ catalogo: "proveedor", id, activo }),
            activo ? "Proveedor reactivado" : "Proveedor anulado",
          )}
        />
      )}
    </Seccion>
  );
}
