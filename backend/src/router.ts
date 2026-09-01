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
import { incidenciasRouter } from "./dominios/incidencias.js";
import { rentabilidadRouter } from "./dominios/rentabilidad.js";
import { comunicadosRouter } from "./dominios/comunicados.js";
import { planRouter } from "./dominios/plan.js";
import { dashboardRouter } from "./dominios/dashboard.js";

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
  incidencias: incidenciasRouter,
  rentabilidad: rentabilidadRouter,
  comunicados: comunicadosRouter,
  plan: planRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
