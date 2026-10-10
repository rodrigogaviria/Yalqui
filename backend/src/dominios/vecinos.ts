import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { router, privado } from "../trpc/base.js";
import { unidadesDelInquilino } from "../auth/arrendatario.js";
import { inmuebles } from "../db/schema/inventario.js";
import { usuarios, perfilesInquilino } from "../db/schema/identidad.js";
import { inquilinoAtributos } from "../db/schema/vecindad.js";
import { aplicaciones } from "../db/schema/demanda.js";
import { contratos } from "../db/schema/contrato.js";

const GENEROS = ["femenino", "masculino", "no_binario", "otro", "prefiere_no_decir"] as const;
const ALCANCES = ["edificacion", "sector", "yalqui"] as const;

/** Las unidades activas (con aplicación aprobada o contrato vivo) de una lista de inquilinos. */
async function unidadesDe(db: import("../db/index.js").Database, inquilinoIds: number[]) {
  if (inquilinoIds.length === 0) return [];
  const designados = await db.select({ inquilinoId: aplicaciones.inquilinoId, inmuebleId: aplicaciones.inmuebleId })
    .from(aplicaciones)
    .where(and(inArray(aplicaciones.inquilinoId, inquilinoIds), eq(aplicaciones.estado, "aprobada")));
  const conContrato = await db.select({ inquilinoId: contratos.inquilinoId, inmuebleId: contratos.inmuebleId })
    .from(contratos)
    .where(and(
      inArray(contratos.inquilinoId, inquilinoIds),
      inArray(contratos.estado, ["vigente", "en_mora", "en_terminacion"]),
    ));
  return [...designados, ...conContrato];
}

/**
 * Lo que una persona elige compartir de sí misma con otras personas de
 * Yalqui, y hasta dónde: su edificación, su sector (mismo barrio) o toda la
 * comunidad. Nunca se expone nada sin que lo prenda de su lado.
 */
export const vecinosRouter = router({
  miPerfil: privado.query(async ({ ctx }) => {
    const [perfil] = await ctx.db
      .select({
        compartir: perfilesInquilino.compartirDatosVecinos,
        alcance: perfilesInquilino.alcanceVecinos,
        genero: perfilesInquilino.genero,
        profesion: perfilesInquilino.profesion,
        emprendimientoNombre: perfilesInquilino.emprendimientoNombre,
        emprendimientoDescripcion: perfilesInquilino.emprendimientoDescripcion,
      })
      .from(perfilesInquilino).where(eq(perfilesInquilino.usuarioId, ctx.usuario.id)).limit(1);
    const [yo] = await ctx.db.select({ telefono: usuarios.telefono })
      .from(usuarios).where(eq(usuarios.id, ctx.usuario.id)).limit(1);
    const hobbies = await ctx.db.select({ valor: inquilinoAtributos.valor })
      .from(inquilinoAtributos)
      .where(and(eq(inquilinoAtributos.usuarioId, ctx.usuario.id), eq(inquilinoAtributos.tipo, "hobby")));

    return {
      compartir: perfil?.compartir ?? false,
      alcance: perfil?.alcance ?? "edificacion",
      genero: perfil?.genero ?? null,
      profesion: perfil?.profesion ?? null,
      emprendimientoNombre: perfil?.emprendimientoNombre ?? null,
      emprendimientoDescripcion: perfil?.emprendimientoDescripcion ?? null,
      celular: yo?.telefono ?? null,
      hobbies: hobbies.map((h) => h.valor),
    };
  }),

  actualizarPerfil: privado
    .input(z.object({
      compartir: z.boolean(),
      alcance: z.enum(ALCANCES).optional(),
      genero: z.enum(GENEROS).nullable().optional(),
      profesion: z.string().trim().max(120).nullable().optional(),
      emprendimientoNombre: z.string().trim().max(191).nullable().optional(),
      emprendimientoDescripcion: z.string().trim().max(1000).nullable().optional(),
      celular: z.string().trim().max(30).nullable().optional(),
      hobbies: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(perfilesInquilino)
        .values({
          usuarioId: ctx.usuario.id,
          compartirDatosVecinos: input.compartir,
          alcanceVecinos: input.alcance ?? "edificacion",
          genero: input.genero ?? null,
          profesion: input.profesion ?? null,
          emprendimientoNombre: input.emprendimientoNombre ?? null,
          emprendimientoDescripcion: input.emprendimientoDescripcion ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            compartirDatosVecinos: input.compartir,
            ...(input.alcance !== undefined ? { alcanceVecinos: input.alcance } : {}),
            ...(input.genero !== undefined ? { genero: input.genero } : {}),
            ...(input.profesion !== undefined ? { profesion: input.profesion } : {}),
            ...(input.emprendimientoNombre !== undefined ? { emprendimientoNombre: input.emprendimientoNombre } : {}),
            ...(input.emprendimientoDescripcion !== undefined ? { emprendimientoDescripcion: input.emprendimientoDescripcion } : {}),
          },
        });

      if (input.celular !== undefined) {
        await ctx.db.update(usuarios).set({ telefono: input.celular }).where(eq(usuarios.id, ctx.usuario.id));
      }

      if (input.hobbies !== undefined) {
        await ctx.db.delete(inquilinoAtributos)
          .where(and(eq(inquilinoAtributos.usuarioId, ctx.usuario.id), eq(inquilinoAtributos.tipo, "hobby")));
        const unicos = [...new Set(input.hobbies.filter((h) => h.length > 0))];
        if (unicos.length > 0) {
          await ctx.db.insert(inquilinoAtributos).values(
            unicos.map((valor) => ({ usuarioId: ctx.usuario.id, tipo: "hobby" as const, valor })),
          );
        }
      }
      return { ok: true };
    }),

  /**
   * Las personas que también eligieron compartir sus datos y cuyo alcance te
   * alcanza: mismo edificio si eligieron «edificación», mismo barrio y
   * ciudad si eligieron «sector», cualquiera si eligieron «toda Yalqui».
   */
  misVecinos: privado.query(async ({ ctx }) => {
    const misIds = await unidadesDelInquilino(ctx.db, ctx.usuario.id);
    if (misIds.length === 0) return [];

    const misUnidades = await ctx.db.select({ edificacionId: inmuebles.edificacionId, barrio: inmuebles.barrio, ciudad: inmuebles.ciudad })
      .from(inmuebles).where(inArray(inmuebles.id, misIds));
    const misEdificaciones = new Set(misUnidades.map((u) => u.edificacionId).filter((e): e is number => e !== null));
    const misSectores = new Set(
      misUnidades.filter((u) => u.barrio !== null).map((u) => `${u.ciudad}·${u.barrio}`),
    );

    const candidatos = await ctx.db
      .select({
        id: usuarios.id, nombre: usuarios.nombre, apellido: usuarios.apellido, celular: usuarios.telefono,
        genero: perfilesInquilino.genero, profesion: perfilesInquilino.profesion, alcance: perfilesInquilino.alcanceVecinos,
        emprendimientoNombre: perfilesInquilino.emprendimientoNombre,
        emprendimientoDescripcion: perfilesInquilino.emprendimientoDescripcion,
      })
      .from(usuarios)
      .innerJoin(perfilesInquilino, eq(perfilesInquilino.usuarioId, usuarios.id))
      .where(eq(perfilesInquilino.compartirDatosVecinos, true));
    const otros = candidatos.filter((c) => c.id !== ctx.usuario.id);
    if (otros.length === 0) return [];

    const deYalqui = otros.filter((c) => c.alcance === "yalqui");
    const porUbicar = otros.filter((c) => c.alcance !== "yalqui");
    const unidadesPorUbicar = porUbicar.length > 0
      ? await unidadesDe(ctx.db, porUbicar.map((c) => c.id))
      : [];
    const inmuebleIds = [...new Set(unidadesPorUbicar.map((u) => u.inmuebleId))];
    const datosInmuebles = inmuebleIds.length > 0
      ? await ctx.db.select({ id: inmuebles.id, edificacionId: inmuebles.edificacionId, barrio: inmuebles.barrio, ciudad: inmuebles.ciudad })
        .from(inmuebles).where(inArray(inmuebles.id, inmuebleIds))
      : [];

    const alcanzanme = porUbicar.filter((c) => {
      const misUnidadesDeC = unidadesPorUbicar.filter((u) => u.inquilinoId === c.id).map((u) => u.inmuebleId);
      const datos = datosInmuebles.filter((d) => misUnidadesDeC.includes(d.id));
      if (c.alcance === "edificacion") {
        return datos.some((d) => d.edificacionId !== null && misEdificaciones.has(d.edificacionId));
      }
      // sector: mismo barrio y ciudad, lo que ya cubre compartir edificación.
      return datos.some((d) => d.barrio !== null && misSectores.has(`${d.ciudad}·${d.barrio}`));
    });

    const visibles = [...deYalqui, ...alcanzanme];
    if (visibles.length === 0) return [];

    const hobbies = await ctx.db.select({ usuarioId: inquilinoAtributos.usuarioId, valor: inquilinoAtributos.valor })
      .from(inquilinoAtributos)
      .where(and(inArray(inquilinoAtributos.usuarioId, visibles.map((v) => v.id)), eq(inquilinoAtributos.tipo, "hobby")));

    return visibles.map(({ alcance, ...v }) => ({
      ...v,
      hobbies: hobbies.filter((h) => h.usuarioId === v.id).map((h) => h.valor),
    }));
  }),
});
