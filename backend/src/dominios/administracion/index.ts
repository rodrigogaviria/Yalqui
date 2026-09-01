import { router } from "../../trpc/base.js";
import { geografiaRouter } from "./geografia.js";
import { catalogosRouter } from "./catalogos.js";
import { usuariosRouter } from "./usuarios.js";
import { operativosRouter } from "./operativos.js";

/**
 * Administración: todo lo que configura el sistema sin necesidad de un
 * despliegue. Geografía, tipos de inmueble, catálogos comerciales, parámetros
 * y la asignación de roles.
 *
 * Salvo las lecturas de geografía, que el formulario de alta de una unidad
 * necesita antes de que exista rol alguno, todo exige `admin_yalqui`.
 */
export const administracionRouter = router({
  geografia: geografiaRouter,
  catalogos: catalogosRouter,
  operativos: operativosRouter,
  usuarios: usuariosRouter,
});
