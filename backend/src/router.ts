import { router } from "./trpc/base.js";
import { saludRouter } from "./dominios/salud.js";
import { administracionRouter } from "./dominios/administracion/index.js";
import { authRouter } from "./dominios/auth.js";
import { inmueblesRouter } from "./dominios/inmuebles.js";
import { configuracionRouter } from "./dominios/configuracion.js";
import { visitasRouter } from "./dominios/visitas.js";
import { precalificacionRouter } from "./dominios/precalificacion.js";
import { aplicacionesRouter } from "./dominios/aplicaciones.js";
import { contratosRouter } from "./dominios/contratos.js";
import { facturacionRouter } from "./dominios/facturacion.js";

/**
 * Un router por dominio, con procedimientos explícitos.
 * Nada de updateAnything, changeStatus ni saveForm.
 *
 * El orden es el del ciclo: registrar la unidad, mostrarla, precalificar,
 * aplicar, firmar y cobrar.
 */
export const appRouter = router({
  salud: saludRouter,
  admin: administracionRouter,
  auth: authRouter,
  inmuebles: inmueblesRouter,
  configuracion: configuracionRouter,
  visitas: visitasRouter,
  precalificacion: precalificacionRouter,
  aplicaciones: aplicacionesRouter,
  contratos: contratosRouter,
  facturacion: facturacionRouter,
});

export type AppRouter = typeof appRouter;
