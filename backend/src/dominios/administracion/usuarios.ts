import { z } from "zod";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, admin } from "../../trpc/base.js";
import type { Database } from "../../db/index.js";
import { usuarios, usuarioRoles, ROLES, AMBITOS } from "../../db/schema/identidad.js";

const id = z.number().int().positive();

export const usuariosRouter = router({
  /** Listado con búsqueda. La página es chica a propósito: es una pantalla de
   *  administración, no un exportador. */
  listar: admin
    .input(z.object({
      busqueda: z.string().trim().max(120).optional(),
      estado: z.enum(["pendiente", "activo", "suspendido"]).optional(),
      pagina: z.number().int().min(1).default(1),
    }))
    .query(async ({ ctx, input }) => {
      const porPagina = 25;
      const filtros = [
        input.estado === undefined ? undefined : eq(usuarios.estado, input.estado),
        input.busqueda === undefined || input.busqueda === ""
          ? undefined
          : or(
              like(usuarios.email, `%${input.busqueda}%`),
              like(usuarios.nombre, `%${input.busqueda}%`),
              like(usuarios.apellido, `%${input.busqueda}%`),
              like(usuarios.numeroDocumento, `%${input.busqueda}%`),
            ),
      ].filter((f) => f !== undefined);

      const donde = filtros.length > 0 ? and(...filtros) : undefined;

      const filas = await ctx.db
        .select({
          id: usuarios.id,
          email: usuarios.email,
          nombre: usuarios.nombre,
          apellido: usuarios.apellido,
          telefono: usuarios.telefono,
          tipoDocumento: usuarios.tipoDocumento,
          numeroDocumento: usuarios.numeroDocumento,
          estado: usuarios.estado,
          ultimoAccesoAt: usuarios.ultimoAccesoAt,
          createdAt: usuarios.createdAt,
          // Los roles vigentes, contados acá para no hacer una consulta por
          // fila al pintar la tabla.
          roles: sql<number>`(
            SELECT COUNT(*) FROM usuario_roles r
            WHERE r.usuario_id = usuarios.id AND r.revocado_at IS NULL
          )`,
        })
        .from(usuarios)
        .where(donde)
        .orderBy(desc(usuarios.createdAt))
        .limit(porPagina)
        .offset((input.pagina - 1) * porPagina);

      const [conteo] = await ctx.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(usuarios)
        .where(donde);

      return { usuarios: filas, total: Number(conteo?.total ?? 0), porPagina, pagina: input.pagina };
    }),

  /** El detalle con todos sus roles, incluidos los revocados: saber que a
   *  alguien se le quitó un rol es tan importante como saber que lo tiene. */
  ver: admin.input(z.object({ usuarioId: id })).query(async ({ ctx, input }) => {
    const [usuario] = await ctx.db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        nombre: usuarios.nombre,
        apellido: usuarios.apellido,
        telefono: usuarios.telefono,
        tipoDocumento: usuarios.tipoDocumento,
        numeroDocumento: usuarios.numeroDocumento,
        estado: usuarios.estado,
        emailVerificadoAt: usuarios.emailVerificadoAt,
        ultimoAccesoAt: usuarios.ultimoAccesoAt,
        createdAt: usuarios.createdAt,
      })
      .from(usuarios)
      .where(eq(usuarios.id, input.usuarioId))
      .limit(1);

    if (!usuario) throw new TRPCError({ code: "NOT_FOUND", message: "Ese usuario no existe" });

    const roles = await ctx.db
      .select({
        id: usuarioRoles.id,
        rol: usuarioRoles.rol,
        ambitoTipo: usuarioRoles.ambitoTipo,
        ambitoId: usuarioRoles.ambitoId,
        otorgadoAt: usuarioRoles.otorgadoAt,
        revocadoAt: usuarioRoles.revocadoAt,
      })
      .from(usuarioRoles)
      .where(eq(usuarioRoles.usuarioId, input.usuarioId))
      .orderBy(desc(usuarioRoles.otorgadoAt));

    return { usuario, roles };
  }),

  /**
   * Otorga un rol.
   *
   * El ámbito es obligatorio salvo para `admin_yalqui`, que es el único global.
   * Pedirlo siempre es lo que impide que exista un «propietario» sin decir de
   * qué: ese rol suelto daría permiso sobre nada o sobre todo, y las dos cosas
   * son un error.
   */
  otorgarRol: admin
    .input(z.object({
      usuarioId: id,
      rol: z.enum(ROLES),
      ambitoTipo: z.enum(AMBITOS),
      ambitoId: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.rol === "admin_yalqui" && input.ambitoTipo !== "global") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La administración de Yalqui es siempre global",
        });
      }
      if (input.rol !== "admin_yalqui" && input.ambitoTipo === "global") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo la administración de Yalqui puede ser global",
        });
      }
      if (input.ambitoTipo !== "global" && input.ambitoId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Falta decir sobre qué ${input.ambitoTipo} se otorga el rol`,
        });
      }

      // Reactivar un rol revocado en vez de apilar una fila nueva: el histórico
      // se lee por `revocado_at`, y dos filas vigentes del mismo rol harían
      // ambiguo cuál revocar después.
      const [existente] = await ctx.db
        .select({ id: usuarioRoles.id, revocadoAt: usuarioRoles.revocadoAt })
        .from(usuarioRoles)
        .where(and(
          eq(usuarioRoles.usuarioId, input.usuarioId),
          eq(usuarioRoles.rol, input.rol),
          eq(usuarioRoles.ambitoTipo, input.ambitoTipo),
          eq(usuarioRoles.ambitoId, input.ambitoId),
        ))
        .limit(1);

      if (existente) {
        if (existente.revocadoAt === null) return { ok: true, yaLoTenia: true };
        await ctx.db.update(usuarioRoles).set({ revocadoAt: null, otorgadoPorId: ctx.usuario.id })
          .where(eq(usuarioRoles.id, existente.id));
        return { ok: true, yaLoTenia: false };
      }

      await ctx.db.insert(usuarioRoles).values({
        usuarioId: input.usuarioId,
        rol: input.rol,
        ambitoTipo: input.ambitoTipo,
        ambitoId: input.ambitoId,
        otorgadoPorId: ctx.usuario.id,
      });
      return { ok: true, yaLoTenia: false };
    }),

  /** Revoca un rol. Toma efecto en la siguiente petición, no cuando venza la
   *  sesión: los roles se releen de la base en cada solicitud. */
  revocarRol: admin
    .input(z.object({ rolId: id }))
    .mutation(async ({ ctx, input }) => {
      const [rol] = await ctx.db
        .select({ usuarioId: usuarioRoles.usuarioId, rol: usuarioRoles.rol })
        .from(usuarioRoles)
        .where(eq(usuarioRoles.id, input.rolId))
        .limit(1);

      if (!rol) throw new TRPCError({ code: "NOT_FOUND", message: "Ese rol no existe" });

      // Quedarse sin ningún administrador deja el sistema sin quien lo
      // administre, y no hay pantalla para volver a crear uno.
      if (rol.rol === "admin_yalqui") {
        await exigirOtroAdmin(ctx.db, rol.usuarioId);
      }

      await ctx.db.update(usuarioRoles).set({ revocadoAt: new Date() })
        .where(eq(usuarioRoles.id, input.rolId));
      return { ok: true };
    }),

  /** Suspende o reactiva una cuenta. Una cuenta suspendida no puede ingresar. */
  cambiarEstado: admin
    .input(z.object({ usuarioId: id, estado: z.enum(["activo", "suspendido"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.usuarioId === ctx.usuario.id && input.estado === "suspendido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No podés suspender tu propia cuenta" });
      }
      if (input.estado === "suspendido") {
        await exigirOtroAdmin(ctx.db, input.usuarioId);
      }

      await ctx.db.update(usuarios).set({ estado: input.estado })
        .where(eq(usuarios.id, input.usuarioId));
      return { ok: true };
    }),
});

/** Falla si sacar a este usuario dejaría al sistema sin administradores. */
async function exigirOtroAdmin(db: Database, usuarioId: number) {
  const [otros] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(usuarioRoles)
    .innerJoin(usuarios, eq(usuarios.id, usuarioRoles.usuarioId))
    .where(and(
      eq(usuarioRoles.rol, "admin_yalqui"),
      isNull(usuarioRoles.revocadoAt),
      eq(usuarios.estado, "activo"),
      sql`${usuarioRoles.usuarioId} <> ${usuarioId}`,
    ));

  if (Number(otros?.n ?? 0) === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Es el único administrador activo: nombrá otro antes de quitarle el rol",
    });
  }
}
