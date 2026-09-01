import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, admin } from "../../trpc/base.js";
import { tiposInmueble, parametros, TIPOS_PARAMETRO } from "../../db/schema/administracion.js";
import { MARCOS_LEGALES } from "../../db/schema/contrato.js";
import { servicios } from "../../db/schema/negocio.js";
import { planes } from "../../db/schema/dinero.js";
import { amenidades } from "../../db/schema/vecindad.js";
import { canalesPublicacion } from "../../db/schema/publicacion.js";
import { permisosRol } from "../../db/schema/operacion.js";
import { cambiosDe } from "./comun.js";

const id = z.number().int().positive();

export const catalogosRouter = router({
  /**
   * Los tipos de inmueble.
   *
   * Se puede renombrar, reordenar y apagar un tipo, pero no crear uno: el
   * ENUM de `inmuebles.tipo` es la restricción de integridad y ampliarlo pide
   * migración. Es a propósito — el marco legal de un tipo que nadie modeló no
   * lo puede resolver un formulario.
   */
  tipos: admin.query(({ ctx }) =>
    ctx.db.select().from(tiposInmueble).orderBy(asc(tiposInmueble.orden)),
  ),

  /**
   * Los tipos que se pueden ofrecer, para el formulario de alta de una unidad.
   *
   * Es público porque lo consulta cualquiera que registre un inmueble, y
   * devuelve solo lo activo: sin esto, anular un tipo desde la administración
   * no tendría ningún efecto y la pantalla de configuración sería decorativa.
   */
  tiposActivos: publico.query(({ ctx }) =>
    ctx.db
      .select({
        codigo: tiposInmueble.codigo,
        nombre: tiposInmueble.nombre,
        pideHabitaciones: tiposInmueble.pideHabitaciones,
        pideBanos: tiposInmueble.pideBanos,
        pideArea: tiposInmueble.pideArea,
        admiteMascotas: tiposInmueble.admiteMascotas,
      })
      .from(tiposInmueble)
      .where(eq(tiposInmueble.activo, true))
      .orderBy(asc(tiposInmueble.orden)),
  ),

  editarTipo: admin
    .input(z.object({
      tipoId: id,
      nombre: z.string().trim().min(2).max(120).optional(),
      plural: z.string().trim().min(2).max(120).optional(),
      marcoLegal: z.enum(MARCOS_LEGALES).optional(),
      pideHabitaciones: z.boolean().optional(),
      pideBanos: z.boolean().optional(),
      pideArea: z.boolean().optional(),
      admiteMascotas: z.boolean().optional(),
      activo: z.boolean().optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tipoId, ...campos } = input;
      await ctx.db.update(tiposInmueble).set(cambiosDe(campos)).where(eq(tiposInmueble.id, tipoId));
      return { ok: true };
    }),

  /** Los parámetros generales, agrupados por categoría en la pantalla. */
  parametros: admin.query(({ ctx }) =>
    ctx.db.select().from(parametros).orderBy(asc(parametros.orden), asc(parametros.clave)),
  ),

  guardarParametro: admin
    .input(z.object({ clave: z.string().trim().max(80), valor: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select({ tipo: parametros.tipo, editable: parametros.editable })
        .from(parametros)
        .where(eq(parametros.clave, input.clave))
        .limit(1);

      if (!p) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese parámetro no existe" });
      }
      // Un parámetro de sistema sostiene supuestos del código, no una política
      // comercial. Que no aparezca editable en la pantalla no alcanza: la
      // regla tiene que estar del lado del servidor.
      if (!p.editable) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Ese parámetro es de sistema y no se edita desde acá",
        });
      }

      // `valor` es texto para no pedir una migración por cada parámetro nuevo,
      // así que el tipo declarado es lo único que impide guardar "abc" donde
      // el código después va a hacer Number().
      const invalido =
        (p.tipo === "entero" && !/^-?\d+$/.test(input.valor)) ||
        (p.tipo === "decimal" && !/^-?\d+(\.\d+)?$/.test(input.valor)) ||
        (p.tipo === "booleano" && !["true", "false"].includes(input.valor)) ||
        (p.tipo === "json" && !seParsea(input.valor));

      if (invalido) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Ese parámetro espera un valor de tipo ${p.tipo}`,
        });
      }

      await ctx.db.update(parametros).set({ valor: input.valor }).where(eq(parametros.clave, input.clave));
      return { ok: true };
    }),

  editarPlan: admin
    .input(z.object({
      planId: z.number().int().positive(),
      nombre: z.string().trim().min(2).max(120).optional(),
      descripcion: z.string().trim().max(500).optional(),
      precioMes: z.number().min(0).max(99_999_999).optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { planId, precioMes, ...resto } = input;
      const set = cambiosDe({ ...resto, precioMes: precioMes?.toFixed(2) });
      await ctx.db.update(planes).set(set).where(eq(planes.id, planId));
      return { ok: true };
    }),

  editarServicioYalqui: admin
    .input(z.object({
      servicioId: z.number().int().positive(),
      nombre: z.string().trim().min(2).max(120).optional(),
      descripcion: z.string().trim().max(255).optional(),
      precioBase: z.number().min(0).max(99_999_999).optional(),
      porcentaje: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { servicioId, precioBase, porcentaje, ...resto } = input;
      const set = cambiosDe({
        ...resto,
        precioBase: precioBase?.toFixed(2),
        porcentaje: porcentaje?.toFixed(3),
      });
      await ctx.db.update(servicios).set(set).where(eq(servicios.id, servicioId));
      return { ok: true };
    }),

  /** Servicios a la carta: se cobran por unidad, con o sin plan de pago. */
  servicios: admin.query(({ ctx }) => ctx.db.select().from(servicios).orderBy(asc(servicios.nombre))),

  /** Planes de suscripción. El precio se edita acá, nunca en una migración. */
  planes: admin.query(({ ctx }) => ctx.db.select().from(planes).orderBy(asc(planes.orden))),

  amenidades: admin.query(({ ctx }) => ctx.db.select().from(amenidades).orderBy(asc(amenidades.nombre))),

  canales: admin.query(({ ctx }) =>
    ctx.db.select().from(canalesPublicacion).orderBy(asc(canalesPublicacion.nombre)),
  ),

  /** La matriz de permisos: qué puede hacer cada rol sobre cada ámbito. */
  permisos: admin.query(({ ctx }) =>
    ctx.db.select().from(permisosRol).orderBy(asc(permisosRol.rol), asc(permisosRol.permiso)),
  ),

  /**
   * Enciende o apaga una entrada de catálogo.
   *
   * Apagar y no borrar: un servicio contratado o un ajuste ya aplicado a un
   * contrato siguen apuntando a su fila, y borrarla dejaría esos registros
   * señalando a nada.
   */
  activar: admin
    .input(z.object({
      catalogo: z.enum(["servicio", "plan", "canal", "tipo"]),
      id,
      activo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tabla = {
        servicio: servicios, plan: planes,
        canal: canalesPublicacion, tipo: tiposInmueble,
      }[input.catalogo];

      await ctx.db.update(tabla).set({ activo: input.activo }).where(eq(tabla.id, input.id));
      return { ok: true };
    }),

  // Las amenidades se identifican por código y no por id autoincremental, así
  // que no entran en la operación de arriba.
  activarAmenidad: admin
    .input(z.object({ codigo: z.string().trim().max(40), activo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(amenidades).set({ activo: input.activo })
        .where(eq(amenidades.codigo, input.codigo));
      return { ok: true };
    }),
});

function seParsea(v: string): boolean {
  try { JSON.parse(v); return true; } catch { return false; }
}
