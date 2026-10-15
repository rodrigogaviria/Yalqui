import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { tieneRol } from "../auth/roles.js";
import { promocionesUnidad } from "../db/schema/vecindad.js";
import { inmuebles } from "../db/schema/inventario.js";
import { usuarios } from "../db/schema/identidad.js";

/**
 * El «vecino embajador»: cualquiera puede pedir promocionar una unidad
 * disponible, el propietario la aprueba o la rechaza, y si por su
 * intermedio se arrienda, `contratos.generar` le liquida la comisión que la
 * unidad tenga configurada.
 */
export const promocionesRouter = router({
  /** Las unidades sin alquilar, para que cualquiera elija cuál promocionar. */
  disponibles: privado.query(async ({ ctx }) => {
    const unidades = await ctx.db
      .select({
        id: inmuebles.id, direccion: inmuebles.direccion, complemento: inmuebles.complemento,
        barrio: inmuebles.barrio, ciudad: inmuebles.ciudad, tipo: inmuebles.tipo,
        canonBase: inmuebles.canonBase, comisionPromotorPct: inmuebles.comisionPromotorPct,
      })
      .from(inmuebles)
      .where(eq(inmuebles.estado, "publicado"))
      .orderBy(desc(inmuebles.publicadoAt));

    const mias = await ctx.db.select({ inmuebleId: promocionesUnidad.inmuebleId, estado: promocionesUnidad.estado })
      .from(promocionesUnidad).where(eq(promocionesUnidad.promotorId, ctx.usuario.id));

    return unidades.map((u) => ({ ...u, miEstado: mias.find((m) => m.inmuebleId === u.id)?.estado ?? null }));
  }),

  /** Pide promocionar una unidad disponible. Nace pendiente: la aprueba su propietario. */
  promocionar: privado
    .input(z.object({ inmuebleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [u] = await ctx.db.select({ estado: inmuebles.estado, propietarioId: inmuebles.propietarioId })
        .from(inmuebles).where(eq(inmuebles.id, input.inmuebleId)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });
      if (u.estado !== "publicado") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa unidad ya no está disponible" });
      }
      if (u.propietarioId === ctx.usuario.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No podés promocionar tu propia unidad" });
      }
      const [existente] = await ctx.db.select({ id: promocionesUnidad.id })
        .from(promocionesUnidad)
        .where(and(eq(promocionesUnidad.inmuebleId, input.inmuebleId), eq(promocionesUnidad.promotorId, ctx.usuario.id)))
        .limit(1);
      if (existente) throw new TRPCError({ code: "CONFLICT", message: "Ya pediste promocionar esta unidad" });

      await ctx.db.insert(promocionesUnidad).values({ inmuebleId: input.inmuebleId, promotorId: ctx.usuario.id });
      return { ok: true };
    }),

  /** Mis pedidos de promoción, con la comisión si alguno ya se concretó. */
  mias: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: promocionesUnidad.id, estado: promocionesUnidad.estado, creadaAt: promocionesUnidad.creadaAt,
        comisionMonto: promocionesUnidad.comisionMonto, comisionEstado: promocionesUnidad.comisionEstado,
        inmuebleId: inmuebles.id, direccion: inmuebles.direccion, complemento: inmuebles.complemento, ciudad: inmuebles.ciudad,
      })
      .from(promocionesUnidad)
      .innerJoin(inmuebles, eq(inmuebles.id, promocionesUnidad.inmuebleId))
      .where(eq(promocionesUnidad.promotorId, ctx.usuario.id))
      .orderBy(desc(promocionesUnidad.creadaAt)),
  ),

  /** Los pedidos de promoción sobre las unidades del propietario. */
  deMisUnidades: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: promocionesUnidad.id, estado: promocionesUnidad.estado, creadaAt: promocionesUnidad.creadaAt,
        comisionMonto: promocionesUnidad.comisionMonto, comisionEstado: promocionesUnidad.comisionEstado,
        inmuebleId: inmuebles.id, direccion: inmuebles.direccion, complemento: inmuebles.complemento,
        promotorNombre: usuarios.nombre, promotorApellido: usuarios.apellido, promotorTelefono: usuarios.telefono,
      })
      .from(promocionesUnidad)
      .innerJoin(inmuebles, eq(inmuebles.id, promocionesUnidad.inmuebleId))
      .innerJoin(usuarios, eq(usuarios.id, promocionesUnidad.promotorId))
      .where(eq(inmuebles.propietarioId, ctx.usuario.id))
      .orderBy(desc(promocionesUnidad.creadaAt)),
  ),

  /** El propietario aprueba o rechaza un pedido de promoción. */
  decidir: privado
    .input(z.object({ promocionId: z.number().int().positive(), decision: z.enum(["aprobada", "rechazada"]) }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db.select({ inmuebleId: promocionesUnidad.inmuebleId, estado: promocionesUnidad.estado })
        .from(promocionesUnidad).where(eq(promocionesUnidad.id, input.promocionId)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese pedido no existe" });
      if (!tieneRol(ctx.usuario.roles, "propietario", "inmueble", p.inmuebleId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa unidad" });
      }
      if (p.estado !== "pendiente") {
        throw new TRPCError({ code: "CONFLICT", message: "Ese pedido ya se decidió" });
      }
      await ctx.db.update(promocionesUnidad)
        .set({ estado: input.decision, decididaAt: new Date().toISOString().slice(0, 19).replace("T", " "), decididaPorId: ctx.usuario.id })
        .where(eq(promocionesUnidad.id, input.promocionId));
      return { estado: input.decision };
    }),
});
