import { useEffect, useState, useCallback } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Dinero, pesos } from "../componentes/Dinero";

type Unidad = Awaited<ReturnType<typeof api.inmuebles.mias.query>>["unidades"][number];
type Factura = Awaited<ReturnType<typeof api.facturacion.misFacturas.query>>["facturas"][number];

const BOTON = { height: 38, fontSize: 13.5, padding: "0 10px" } as const;

/** Dirección y complemento, que es como se nombra una unidad en todos lados. */
function titulo(u: { direccion: string; complemento: string | null }): string {
  return `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`;
}

/** Una cifra chica, para vivir varias juntas dentro de un mismo bloque en vez
 *  de cada una en su propia tarjeta. */
function MiniCifra({ titulo, valor, tono = "normal" }: {
  titulo: string; valor: string; tono?: "normal" | "bien" | "mal" | "ojo";
}) {
  const color = tono === "bien" ? "var(--bien)" : tono === "mal" ? "var(--mal)"
    : tono === "ojo" ? "var(--ojo)" : "var(--tinta)";
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--tinta-2)" }}>{titulo}</div>
      <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 3, color }}>{valor}</div>
    </div>
  );
}

const NOMBRE_TIPO: Record<string, string> = {
  apartamento: "Apartamento", casa: "Casa", habitacion: "Habitación",
  local: "Local", oficina: "Oficina", parqueadero: "Parqueadero",
  bodega: "Bodega", lote: "Lote",
};

export function Portafolio({
  alCrearUnidad, alEditarUnidad, alConfigurarUnidad, alAlquilar, alVerInquilinos, alActuar,
}: {
  alCrearUnidad: () => void;
  alEditarUnidad: (inmuebleId: number) => void;
  alConfigurarUnidad: (inmuebleId: number, direccion: string) => void;
  alAlquilar: (inmuebleId: number, direccion: string, canonBase: number) => void;
  alVerInquilinos: (inmuebleId: number, direccion: string) => void;
  /** Se llama cuando el estado cambia, para que el aviso anterior no quede
   *  contradiciendo lo que la persona acaba de hacer. */
  alActuar: () => void;
}) {
  const [unidades, setUnidades] = useState<Unidad[] | null>(null);
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  /** La unidad cuyo intento de publicación falló, para ofrecerle completarla
   *  ahí mismo en vez de dejar a la persona buscando dónde se edita. */
  const [incompleta, setIncompleta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([
        api.inmuebles.mias.query(),
        api.facturacion.misFacturas.query(),
      ]);
      setUnidades(r.unidades);
      setFacturas(f.facturas);
      setError(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Devuelve la unidad a disponible. El servidor rechaza si hay contrato vivo. */
  async function liberar(id: number) {
    setOcupada(id);
    setError(null);
    setIncompleta(null);
    try {
      await api.inmuebles.liberar.mutate({ inmuebleId: id });
      alActuar();
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupada(null);
    }
  }

  async function publicar(id: number) {
    setOcupada(id);
    setError(null);
    setIncompleta(null);
    try {
      await api.inmuebles.publicar.mutate({ inmuebleId: id });
      alActuar();
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e));
      setIncompleta(id);
    } finally {
      setOcupada(null);
    }
  }

  if (error && unidades === null) {
    return <div className="aviso malo" role="alert">{error}</div>;
  }
  if (unidades === null) {
    return <p style={{ color: "var(--tinta-2)" }}>Cargando tus unidades…</p>;
  }

  const arrendadas = unidades.filter((u) => u.estado === "arrendado");
  const disponibles = unidades.length - arrendadas.length;

  // Potenciales es el techo: lo que rentarían las unidades si estuvieran
  // todas ocupadas. Actuales es lo que de verdad se está cobrando hoy — la
  // distancia entre los dos números es lo que vale ir a ocupar.
  const arrendamientosPotenciales = unidades.reduce((t, u) => t + Number(u.canonBase), 0);
  const arrendamientosActuales = arrendadas.reduce((t, u) => t + Number(u.canonBase), 0);

  // Lo esperado del mes se reparte en tres estados según la factura: ya
  // llegó el pago y se verificó, todavía no vence, o venció sin pagarse.
  // `saldo` y no `total` para lo pendiente y lo vencido: es lo que
  // efectivamente falta cobrar, no el valor completo de la factura si ya
  // hubo un abono parcial.
  const recaudado = (facturas ?? [])
    .filter((f) => f.situacion === "pagada")
    .reduce((t, f) => t + Number(f.total), 0);
  const pendiente = (facturas ?? [])
    .filter((f) => f.situacion === "porVencer")
    .reduce((t, f) => t + Number(f.saldo), 0);
  const vencido = (facturas ?? [])
    .filter((f) => f.situacion === "vencida")
    .reduce((t, f) => t + Number(f.saldo), 0);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 600 }}>Portafolio</h1>
          <p style={{ color: "var(--tinta-2)", margin: "5px 0 0", fontSize: 14.5 }}>
            {unidades.length === 0
              ? "Todavía no tenés unidades"
              : `${unidades.length} ${unidades.length === 1 ? "unidad" : "unidades"} · ${arrendadas.length} arrendada${arrendadas.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button className="boton" onClick={alCrearUnidad}>Registrar unidad</button>
      </header>

      {error && (
        <div className="aviso malo" role="alert" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{error}</span>
          {incompleta !== null && (
            <button className="boton fantasma" style={{ height: 34, fontSize: 13.5, padding: "0 12px" }}
              onClick={() => alEditarUnidad(incompleta)}>
              Completar la unidad
            </button>
          )}
        </div>
      )}

      {unidades.length > 0 && (
        // Flex y no grid: el bloque de unidades es chico a propósito y no
        // debería crecer para igualar al de dinero. Con grid de columnas
        // iguales quedaba estirado a la mitad de la fila sin necesitarlo, y
        // le quitaba a la tarjeta de dinero el ancho que sus cinco cifras
        // necesitan antes de tener que partirse en dos filas.
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className="tarjeta" style={{ padding: "14px 17px", flex: "0 1 200px" }}>
            <div style={{ fontSize: 12, color: "var(--tinta-2)" }}># Unidades</div>
            <div className="num" style={{ fontFamily: '"Kufam",sans-serif', fontSize: 22, fontWeight: 600, marginTop: 3 }}>
              {unidades.length}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 12.5, color: "var(--tinta-2)" }}>
              <span>Ocupadas <strong className="num" style={{ color: "var(--tinta)" }}>{arrendadas.length}</strong></span>
              <span>Disponibles <strong className="num" style={{ color: "var(--tinta)" }}>{disponibles}</strong></span>
            </div>
          </div>

          <div className="tarjeta" style={{ padding: "17px 19px", flex: "1 1 420px" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
              gap: 14, rowGap: 12,
            }}>
              <MiniCifra titulo="Potenciales" valor={pesos(arrendamientosPotenciales)} />
              <MiniCifra titulo="Actuales" valor={pesos(arrendamientosActuales)} />
              <MiniCifra titulo="Recaudado" valor={pesos(recaudado)} tono="bien" />
              <MiniCifra titulo="Pendiente" valor={pesos(pendiente)} tono={pendiente > 0 ? "ojo" : "normal"} />
              <MiniCifra titulo="Vencido" valor={pesos(vencido)} tono={vencido > 0 ? "mal" : "normal"} />
            </div>
          </div>
        </div>
      )}

      {unidades.length === 0 ? (
        <div className="tarjeta vacio">
          <p style={{ margin: "0 0 6px", fontSize: 17, color: "var(--tinta)", fontWeight: 600 }}>
            Empezá registrando tu primera unidad
          </p>
          <p style={{ margin: "0 0 20px" }}>
            En el plan Básico no pagás nada: podés publicar, precalificar y firmar el contrato.
          </p>
          <button className="boton" onClick={alCrearUnidad}>Registrar unidad</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {unidades.map((u) => (
            <article key={u.id} className="tarjeta"
              style={{ padding: "15px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 600 }}>
                  {u.direccion}{u.complemento ? `, ${u.complemento}` : ""}
                </div>
                <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 2 }}>
                  {NOMBRE_TIPO[u.tipo] ?? u.tipo} · {u.ciudad} · <span className="num">{u.codigoPublico}</span>
                </div>
              </div>

              {/* El botón dice en qué estado está y, al tocarlo, ofrece el
                  cambio. Un rótulo aparte más un botón dirían lo mismo dos
                  veces y ocuparían el doble. */}
              <button
                className={u.estado === "arrendado" ? "boton" : "boton fantasma"}
                style={{ height: 40, fontSize: 14, minWidth: 118 }}
                disabled={ocupada === u.id}
                title={u.estado === "arrendado"
                  ? "Está alquilada. Tocá para liberarla."
                  : "Está disponible. Tocá para registrar al inquilino."}
                onClick={() => u.estado === "arrendado"
                  ? void liberar(u.id)
                  : alAlquilar(u.id, titulo(u), Number(u.canonBase))}
              >
                {ocupada === u.id ? "…" : u.estado === "arrendado" ? "Alquilado" : "Disponible"}
              </button>

              <div style={{ width: 150, textAlign: "right" }}>
                <Dinero valor={u.canonBase} className="" />
                <div style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 1 }}>canon base</div>
              </div>

              {/* Los mismos cuatro botones en el mismo orden y ancho en todas
                  las filas. Antes «Publicar» solo aparecía en borrador, así que
                  cada tarjeta tenía una distribución distinta y la vista
                  saltaba de una a otra. Lo que no aplica va deshabilitado. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 116px)", gap: 8 }}>
                <button className="boton fantasma" style={BOTON}
                  onClick={() => alConfigurarUnidad(u.id, titulo(u))}>
                  Precio
                </button>
                <button className="boton fantasma" style={BOTON}
                  onClick={() => alEditarUnidad(u.id)}>
                  Editar
                </button>
                <button className="boton fantasma" style={BOTON}
                  disabled={u.estado !== "borrador" || ocupada === u.id}
                  title={u.estado !== "borrador" ? "Solo se publica una unidad en borrador" : undefined}
                  onClick={() => publicar(u.id)}>
                  {ocupada === u.id ? "…" : "Publicar"}
                </button>
                <button className="boton fantasma" style={BOTON}
                  onClick={() => alVerInquilinos(u.id, titulo(u))}>
                  Inquilinos
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
