import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, privado, exigirRol } from "../trpc/base.js";
import {
  inmuebles, inmueblePropietarios, inmuebleEtiquetas, etiquetas,
  TIPOS_UNIDAD,
} from "../db/schema/inventario.js";
import { otorgarRol, ambitosCon } from "../auth/roles.js";

const dinero = z.number().nonnegative().max(9_999_999_999).multipleOf(0.01);

const nuevo = z.object({
  tipo: z.enum(TIPOS_UNIDAD),
  direccion: z.string().trim().min(5).max(255),
  complemento: z.string().trim().max(120).optional(),
  barrio: z.string().trim().max(120).optional(),
  ciudad: z.string().trim().min(2).max(120),
  departamento: z.string().trim().min(2).max(120),
  canonBase: dinero,
  valorAdministracion: dinero.default(0),
  administracionIncluida: z.boolean().default(false),
  habitaciones: z.number().int().min(0).max(50).optional(),
  banos: z.number().int().min(0).max(50).optional(),
  areaConstruidaM2: z.number().positive().max(99_999).optional(),
  ocupantesBase: z.number().int().min(1).max(50).default(1),
  ocupantesMaximo: z.number().int().min(1).max(50).optional(),
  mascotasMaximo: z.number().int().min(0).max(20).default(0),
  edificacionId: z.number().int().positive().optional(),
  descripcion: z.string().trim().max(4000).optional(),
});

const soloId = z.object({ inmuebleId: z.number().int().positive() });

/**
 * Los campos editables de una unidad.
 *
 * Se derivan de `nuevo` para que agregar un campo al alta no deje la edición
 * atrás en silencio, pero hay que quitarles el `.default()`: `partial()` no lo
 * hace, y en una edición un campo ausente significa «no lo toques». Con el
 * default puesto, cambiar solo la descripción mandaría también administración
 * en cero y ocupantes en uno, pisando datos que nadie tocó.
 *
 * Si mañana se agrega un campo con default hay que sumarlo acá; una prueba
 * verifica que no quede ninguno suelto.
 */
export const cambiosUnidad = nuevo
  .omit({ edificacionId: true })
  .extend({
    valorAdministracion: nuevo.shape.valorAdministracion.removeDefault(),
    administracionIncluida: nuevo.shape.administracionIncluida.removeDefault(),
    ocupantesBase: nuevo.shape.ocupantesBase.removeDefault(),
    mascotasMaximo: nuevo.shape.mascotasMaximo.removeDefault(),
  })
  .partial();

// Un UPDATE sin columnas es SQL inválido, así que el objeto vacío no pasa.
const cambios = cambiosUnidad.refine(
  (c) => Object.keys(c).length > 0,
  { message: "No hay nada que cambiar" },
);

/** El guardia de todo lo que actúa sobre una unidad concreta. */
const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

export const inmueblesRouter = router({
  /**
   * Registra una unidad y, en la misma transacción, convierte a quien la
   * registra en su propietario.
   *
   * El rol nace acá y no en el registro de la cuenta: nadie es «propietario»
   * en abstracto, lo es de algo. Y se otorga junto con la fila del inmueble
   * porque una unidad sin dueño no debería poder existir ni un instante.
   */
  crear: privado.input(nuevo).mutation(async ({ ctx, input }) => {
    if (input.ocupantesMaximo !== undefined && input.ocupantesMaximo < input.ocupantesBase) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El máximo de ocupantes no puede ser menor que los que incluye el canon",
      });
    }

    const uuid = randomUUID();
    const inmuebleId = await ctx.db.transaction(async (tx) => {
      const [res] = await tx.insert(inmuebles).values({
        uuid,
        codigoPublico: codigoPublico(),
        propietarioId: ctx.usuario.id,
        edificacionId: input.edificacionId ?? null,
        tipo: input.tipo,
        estado: "borrador",
        direccion: input.direccion,
        complemento: input.complemento ?? null,
        barrio: input.barrio ?? null,
        ciudad: input.ciudad,
        departamento: input.departamento,
        habitaciones: input.habitaciones ?? null,
        banos: input.banos ?? null,
        areaConstruidaM2: input.areaConstruidaM2?.toFixed(2) ?? null,
        ocupantesBase: input.ocupantesBase,
        ocupantesMaximo: input.ocupantesMaximo ?? null,
        mascotasMaximo: input.mascotasMaximo,
        administracionIncluida: input.administracionIncluida,
        valorAdministracion: input.valorAdministracion.toFixed(2),
        canonBase: input.canonBase.toFixed(2),
        descripcion: input.descripcion ?? null,
      });
      const id = Number((res as { insertId: number }).insertId);

      // El principal con el 100%: los socios se agregan después y le bajan
      // el porcentaje, nunca al revés.
      await tx.insert(inmueblePropietarios).values({
        inmuebleId: id,
        usuarioId: ctx.usuario.id,
        rol: "principal",
        porcentaje: "100.00",
        apareceEnTitulo: true,
        puedeDecidir: true,
        desde: new Date(),
      });

      return id;
    });

    await otorgarRol(ctx.db, ctx.usuario.id, "propietario", "inmueble", inmuebleId);
    return { inmuebleId, uuid, estado: "borrador" as const };
  }),

  /** Las unidades del usuario, agrupables por etiqueta. */
  mias: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) return { total: 0, unidades: [] };

    const filas = await ctx.db
      .select({
        id: inmuebles.id,
        codigoPublico: inmuebles.codigoPublico,
        tipo: inmuebles.tipo,
        estado: inmuebles.estado,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        ciudad: inmuebles.ciudad,
        canonBase: inmuebles.canonBase,
        valorAdministracion: inmuebles.valorAdministracion,
      })
      .from(inmuebles)
      .where(inArray(inmuebles.id, ids))
      .orderBy(desc(inmuebles.createdAt));

    return { total: filas.length, unidades: filas };
  }),

  /** El detalle de una unidad propia, con sus etiquetas. */
  ver: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const [unidad] = await ctx.db
      .select()
      .from(inmuebles)
      .where(eq(inmuebles.id, input.inmuebleId))
      .limit(1);

    if (!unidad) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });

    const rotulos = await ctx.db
      .select({ id: etiquetas.id, nombre: etiquetas.nombre, color: etiquetas.color,
                esPrincipal: inmuebleEtiquetas.esPrincipal })
      .from(inmuebleEtiquetas)
      .innerJoin(etiquetas, eq(etiquetas.id, inmuebleEtiquetas.etiquetaId))
      .where(eq(inmuebleEtiquetas.inmuebleId, input.inmuebleId));

    return { unidad, etiquetas: rotulos };
  }),

  /**
   * Cambia los datos de una unidad.
   *
   * Se puede editar publicada: corregir una descripción o subir el canon es
   * justamente lo que hace falta con el aviso en la calle. Lo que no se toca
   * es el estado, que tiene sus propias operaciones.
   */
  editar: delPropietario
    .input(soloId.extend({ cambios }))
    .mutation(async ({ ctx, input }) => {
      const c = input.cambios;

      // El máximo de ocupantes se valida contra el valor que va a quedar, no
      // contra el que manda el cliente: si solo se edita uno de los dos, el
      // otro sale de la base.
      if (c.ocupantesMaximo !== undefined || c.ocupantesBase !== undefined) {
        const [actual] = await ctx.db
          .select({ base: inmuebles.ocupantesBase, maximo: inmuebles.ocupantesMaximo })
          .from(inmuebles)
          .where(eq(inmuebles.id, input.inmuebleId))
          .limit(1);
        if (!actual) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });

        const base = c.ocupantesBase ?? actual.base;
        const maximo = c.ocupantesMaximo ?? actual.maximo;
        if (maximo !== null && maximo < base) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El máximo de ocupantes no puede ser menor que los que incluye el canon",
          });
        }
      }

      // Solo las claves presentes llegan al UPDATE: mandar `undefined` en las
      // demás borraría datos que nadie pidió cambiar.
      const set: Record<string, unknown> = {};
      if (c.tipo !== undefined) set["tipo"] = c.tipo;
      if (c.direccion !== undefined) set["direccion"] = c.direccion;
      if (c.complemento !== undefined) set["complemento"] = c.complemento || null;
      if (c.barrio !== undefined) set["barrio"] = c.barrio || null;
      if (c.ciudad !== undefined) set["ciudad"] = c.ciudad;
      if (c.departamento !== undefined) set["departamento"] = c.departamento;
      if (c.habitaciones !== undefined) set["habitaciones"] = c.habitaciones;
      if (c.banos !== undefined) set["banos"] = c.banos;
      if (c.areaConstruidaM2 !== undefined) set["areaConstruidaM2"] = c.areaConstruidaM2.toFixed(2);
      if (c.ocupantesBase !== undefined) set["ocupantesBase"] = c.ocupantesBase;
      if (c.ocupantesMaximo !== undefined) set["ocupantesMaximo"] = c.ocupantesMaximo;
      if (c.mascotasMaximo !== undefined) set["mascotasMaximo"] = c.mascotasMaximo;
      if (c.administracionIncluida !== undefined) set["administracionIncluida"] = c.administracionIncluida;
      if (c.valorAdministracion !== undefined) set["valorAdministracion"] = c.valorAdministracion.toFixed(2);
      if (c.canonBase !== undefined) set["canonBase"] = c.canonBase.toFixed(2);
      if (c.descripcion !== undefined) set["descripcion"] = c.descripcion || null;

      await ctx.db.update(inmuebles).set(set).where(eq(inmuebles.id, input.inmuebleId));
      return { ok: true };
    }),

  /**
   * Publica la unidad.
   *
   * Exige lo mínimo para que el aviso sirva: dirección, canon y una descripción.
   * Publicar algo incompleto le hace perder el tiempo a los dos lados.
   */
  publicar: delPropietario.input(soloId).mutation(async ({ ctx, input }) => {
    const [u] = await ctx.db
      .select({
        estado: inmuebles.estado,
        canonBase: inmuebles.canonBase,
        descripcion: inmuebles.descripcion,
      })
      .from(inmuebles)
      .where(eq(inmuebles.id, input.inmuebleId))
      .limit(1);

    if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });
    if (u.estado === "arrendado") {
      throw new TRPCError({ code: "CONFLICT", message: "No se publica una unidad arrendada" });
    }

    const faltan: string[] = [];
    if (Number(u.canonBase) <= 0) faltan.push("el canon");
    if (!u.descripcion?.trim()) faltan.push("la descripción");
    if (faltan.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Antes de publicar falta ${faltan.join(" y ")}`,
      });
    }

    await ctx.db
      .update(inmuebles)
      .set({ estado: "publicado", publicadoAt: new Date() })
      .where(eq(inmuebles.id, input.inmuebleId));

    return { estado: "publicado" as const };
  }),

  /** Saca el aviso de circulación sin archivar la unidad. */
  pausar: delPropietario.input(soloId).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(inmuebles)
      .set({ estado: "pausado" })
      .where(and(eq(inmuebles.id, input.inmuebleId), eq(inmuebles.estado, "publicado")));
    return { estado: "pausado" as const };
  }),

  /** Búsqueda pública: solo lo publicado, y sin datos del dueño. */
  buscar: publico
    .input(z.object({
      ciudad: z.string().trim().max(120).optional(),
      tipo: z.enum(TIPOS_UNIDAD).optional(),
      canonHasta: dinero.optional(),
      ocupantes: z.number().int().min(1).max(50).optional(),
      conMascotas: z.number().int().min(1).max(20).optional(),
      limite: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const filtros = [eq(inmuebles.estado, "publicado")];
      if (input.ciudad) filtros.push(eq(inmuebles.ciudad, input.ciudad));
      if (input.tipo) filtros.push(eq(inmuebles.tipo, input.tipo));
      if (input.canonHasta !== undefined) {
        filtros.push(sql`${inmuebles.canonBase} <= ${input.canonHasta.toFixed(2)}`);
      }
      // «Somos cuatro con dos perros» es como la gente busca de verdad.
      if (input.ocupantes !== undefined) {
        filtros.push(sql`COALESCE(${inmuebles.ocupantesMaximo}, ${inmuebles.ocupantesBase}) >= ${input.ocupantes}`);
      }
      if (input.conMascotas !== undefined) {
        filtros.push(sql`${inmuebles.mascotasMaximo} >= ${input.conMascotas}`);
      }

      const filas = await ctx.db
        .select({
          uuid: inmuebles.uuid,
          codigoPublico: inmuebles.codigoPublico,
          tipo: inmuebles.tipo,
          barrio: inmuebles.barrio,
          ciudad: inmuebles.ciudad,
          canonBase: inmuebles.canonBase,
          valorAdministracion: inmuebles.valorAdministracion,
          administracionIncluida: inmuebles.administracionIncluida,
          habitaciones: inmuebles.habitaciones,
          banos: inmuebles.banos,
          areaConstruidaM2: inmuebles.areaConstruidaM2,
          ocupantesMaximo: inmuebles.ocupantesMaximo,
          mascotasMaximo: inmuebles.mascotasMaximo,
          descripcion: inmuebles.descripcion,
        })
        .from(inmuebles)
        .where(and(...filtros))
        .orderBy(desc(inmuebles.publicadoAt))
        .limit(input.limite);

      return { total: filas.length, unidades: filas };
    }),
});

/** Código corto y legible para decir por teléfono. No es el id ni el uuid. */
function codigoPublico(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I, O, 0 ni 1
  let s = "";
  for (let i = 0; i < 8; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return s;
}
