import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, admin } from "../../trpc/base.js";
import { paises, departamentos, ciudades, barrios } from "../../db/schema/administracion.js";
import { cambiosDe, comoConflicto } from "./comun.js";

const nombre = z.string().trim().min(2).max(120);
const id = z.number().int().positive();

/**
 * Geografía: país, departamento, ciudad, barrio.
 *
 * Las lecturas son públicas porque el formulario de registro de una unidad las
 * necesita antes de que exista sesión con rol. Las escrituras son de
 * administración: que cualquiera pudiera crear ciudades devolvería el problema
 * que estas tablas vinieron a resolver, que es tener «Bogotá», «bogota» y
 * «Bogotá D.C.» como tres lugares distintos.
 */
export const geografiaRouter = router({
  paises: publico.query(({ ctx }) =>
    ctx.db.select().from(paises).where(eq(paises.activo, true)).orderBy(asc(paises.nombre)),
  ),

  departamentos: publico
    .input(z.object({ paisId: id.optional(), incluirInactivos: z.boolean().default(false) }))
    .query(({ ctx, input }) => {
      const filtros = [
        input.paisId === undefined ? undefined : eq(departamentos.paisId, input.paisId),
        input.incluirInactivos ? undefined : eq(departamentos.activo, true),
      ].filter((f) => f !== undefined);

      return ctx.db.select().from(departamentos)
        .where(filtros.length > 0 ? and(...filtros) : undefined)
        .orderBy(asc(departamentos.nombre));
    }),

  ciudades: publico
    .input(z.object({ departamentoId: id.optional(), incluirInactivas: z.boolean().default(false) }))
    .query(({ ctx, input }) => {
      const filtros = [
        input.departamentoId === undefined ? undefined : eq(ciudades.departamentoId, input.departamentoId),
        input.incluirInactivas ? undefined : eq(ciudades.activo, true),
      ].filter((f) => f !== undefined);

      return ctx.db.select({
        id: ciudades.id,
        departamentoId: ciudades.departamentoId,
        departamento: departamentos.nombre,
        codigoDane: ciudades.codigoDane,
        nombre: ciudades.nombre,
        esCapital: ciudades.esCapital,
        activo: ciudades.activo,
      })
        .from(ciudades)
        .innerJoin(departamentos, eq(departamentos.id, ciudades.departamentoId))
        .where(filtros.length > 0 ? and(...filtros) : undefined)
        .orderBy(asc(departamentos.nombre), asc(ciudades.nombre));
    }),

  barrios: publico
    .input(z.object({ ciudadId: id, incluirInactivos: z.boolean().default(false) }))
    .query(({ ctx, input }) => {
      const filtros = [
        eq(barrios.ciudadId, input.ciudadId),
        ...(input.incluirInactivos ? [] : [eq(barrios.activo, true)]),
      ];
      return ctx.db.select().from(barrios).where(and(...filtros)).orderBy(asc(barrios.nombre));
    }),

  crearDepartamento: admin
    .input(z.object({ paisId: id, nombre, codigoDane: z.string().trim().length(2).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [res] = await ctx.db.insert(departamentos).values({
          paisId: input.paisId,
          nombre: input.nombre,
          codigoDane: input.codigoDane ?? null,
        });
        return { id: Number((res as { insertId: number }).insertId) };
      } catch (e) {
        comoConflicto(e, "Ya existe un departamento con ese nombre o ese código DANE");
      }
    }),

  crearCiudad: admin
    .input(z.object({
      departamentoId: id,
      nombre,
      codigoDane: z.string().trim().length(5).optional(),
      esCapital: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      // El código DANE de un municipio empieza por el de su departamento. Si no
      // coincide, el dato queda inservible para cruzar con cualquier fuente
      // oficial, así que se rechaza en vez de guardarse mal.
      if (input.codigoDane !== undefined) {
        const [dep] = await ctx.db
          .select({ codigoDane: departamentos.codigoDane })
          .from(departamentos)
          .where(eq(departamentos.id, input.departamentoId))
          .limit(1);

        if (dep?.codigoDane && !input.codigoDane.startsWith(dep.codigoDane)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `El código DANE de un municipio de ese departamento empieza por ${dep.codigoDane}`,
          });
        }
      }

      try {
        const [res] = await ctx.db.insert(ciudades).values({
          departamentoId: input.departamentoId,
          nombre: input.nombre,
          codigoDane: input.codigoDane ?? null,
          esCapital: input.esCapital,
        });
        return { id: Number((res as { insertId: number }).insertId) };
      } catch (e) {
        comoConflicto(e, "Ya existe una ciudad con ese nombre en ese departamento");
      }
    }),

  crearBarrio: admin
    .input(z.object({
      ciudadId: id,
      nombre,
      localidad: z.string().trim().max(120).optional(),
      estrato: z.number().int().min(1).max(6).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [res] = await ctx.db.insert(barrios).values({
          ciudadId: input.ciudadId,
          nombre: input.nombre,
          localidad: input.localidad ?? null,
          estrato: input.estrato ?? null,
        });
        return { id: Number((res as { insertId: number }).insertId) };
      } catch (e) {
        comoConflicto(e, "Ya existe un barrio con ese nombre en esa ciudad");
      }
    }),

  editarDepartamento: admin
    .input(z.object({
      departamentoId: id,
      nombre: nombre.optional(),
      codigoDane: z.string().trim().length(2).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { departamentoId, ...campos } = input;
      await ctx.db.update(departamentos).set(cambiosDe(campos))
        .where(eq(departamentos.id, departamentoId));
      return { ok: true };
    }),

  editarCiudad: admin
    .input(z.object({
      ciudadId: id,
      nombre: nombre.optional(),
      codigoDane: z.string().trim().length(5).optional(),
      esCapital: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { ciudadId, ...campos } = input;
      await ctx.db.update(ciudades).set(cambiosDe(campos)).where(eq(ciudades.id, ciudadId));
      return { ok: true };
    }),

  editarBarrio: admin
    .input(z.object({
      barrioId: id,
      nombre: nombre.optional(),
      localidad: z.string().trim().max(120).optional(),
      estrato: z.number().int().min(1).max(6).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { barrioId, ...campos } = input;
      await ctx.db.update(barrios).set(cambiosDe(campos)).where(eq(barrios.id, barrioId));
      return { ok: true };
    }),

  /**
   * Activa o desactiva un lugar. No hay borrado.
   *
   * Un inmueble registrado guarda el nombre de su ciudad; borrarla dejaría esa
   * dirección apuntando a algo que ya no existe. Desactivar la saca de los
   * formularios sin romper lo que ya se creó.
   */
  activar: admin
    .input(z.object({
      nivel: z.enum(["departamento", "ciudad", "barrio"]),
      id,
      activo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tabla = { departamento: departamentos, ciudad: ciudades, barrio: barrios }[input.nivel];
      await ctx.db.update(tabla).set({ activo: input.activo }).where(eq(tabla.id, input.id));

      // Desactivar un departamento tiene que arrastrar sus ciudades: dejarlas
      // activas debajo de un padre apagado las haría aparecer en un selector
      // que ya no tiene cómo llegar a ellas.
      if (input.nivel === "departamento" && !input.activo) {
        await ctx.db.update(ciudades).set({ activo: false })
          .where(eq(ciudades.departamentoId, input.id));
      }
      if (input.nivel === "ciudad" && !input.activo) {
        await ctx.db.update(barrios).set({ activo: false }).where(eq(barrios.ciudadId, input.id));
      }
      return { ok: true };
    }),

  /** Cuántos lugares hay cargados, para la pantalla de administración. */
  resumen: admin.query(async ({ ctx }) => {
    const [fila] = await ctx.db
      .select({
        paises: sql<number>`(SELECT COUNT(*) FROM paises)`,
        departamentos: sql<number>`(SELECT COUNT(*) FROM departamentos)`,
        ciudades: sql<number>`(SELECT COUNT(*) FROM ciudades)`,
        barrios: sql<number>`(SELECT COUNT(*) FROM barrios)`,
      })
      .from(paises)
      .limit(1);
    return fila ?? { paises: 0, departamentos: 0, ciudades: 0, barrios: 0 };
  }),
});
