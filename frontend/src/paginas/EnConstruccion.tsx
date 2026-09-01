import type { Opcion, Perspectiva } from "../lib/menu";

/**
 * Qué se ve al abrir una opción que todavía no existe.
 *
 * Aparece solo si alguien llega por teclado o por un estado guardado, porque el
 * botón del menú está deshabilitado. Dice qué falta en vez de mostrar una
 * pantalla vacía que parezca un error.
 */
export function EnConstruccion({ opcion, perspectiva }: {
  opcion: Opcion;
  perspectiva: Perspectiva;
}) {
  return (
    <div className="tarjeta vacio">
      <p style={{ margin: "0 0 6px", fontSize: 18, color: "var(--tinta)", fontWeight: 600 }}>
        {opcion.titulo}
      </p>
      <p style={{ margin: "0 auto", maxWidth: "52ch" }}>
        Está en el menú de {perspectiva.titulo.toLowerCase()} porque es parte del producto,
        pero la pantalla todavía no está construida.
      </p>
    </div>
  );
}
