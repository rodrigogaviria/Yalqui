import { useEffect, useState, useCallback } from "react";
import { api, mensajeDeError } from "../lib/api";
import { Dinero, pesos } from "../componentes/Dinero";

type Unidad = Awaited<ReturnType<typeof api.inmuebles.mias.query>>["unidades"][number];

const BOTON = { height: 38, fontSize: 13.5, padding: "0 10px" } as const;

/** Dirección y complemento, que es como se nombra una unidad en todos lados. */
function titulo(u: { direccion: string; complemento: string | null }): string {
  return `${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`;
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
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  /** La unidad cuyo intento de publicación falló, para ofrecerle completarla
   *  ahí mismo en vez de dejar a la persona buscando dónde se edita. */
  const [incompleta, setIncompleta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.inmuebles.mias.query();
      setUnidades(r.unidades);
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

  // El canon del mes cuenta solo lo arrendado: lo publicado todavía no produce.
  const arrendadas = unidades.filter((u) => u.estado === "arrendado");
  const canonMes = arrendadas.reduce((t, u) => t + Number(u.canonBase), 0);

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          <div className="tarjeta" style={{ padding: "17px 19px" }}>
            <div style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>Canon del mes</div>
            <div className="num" style={{ fontFamily: '"Kufam",sans-serif', fontSize: 26, fontWeight: 600, marginTop: 5 }}>
              {pesos(canonMes)}
            </div>
          </div>
          <div className="tarjeta" style={{ padding: "17px 19px" }}>
            <div style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>Publicadas</div>
            <div className="num" style={{ fontFamily: '"Kufam",sans-serif', fontSize: 26, fontWeight: 600, marginTop: 5 }}>
              {unidades.filter((u) => u.estado === "publicado").length}
            </div>
          </div>
          <div className="tarjeta" style={{ padding: "17px 19px" }}>
            <div style={{ fontSize: 12.5, color: "var(--tinta-2)" }}>En borrador</div>
            <div className="num" style={{ fontFamily: '"Kufam",sans-serif', fontSize: 26, fontWeight: 600, marginTop: 5 }}>
              {unidades.filter((u) => u.estado === "borrador").length}
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
