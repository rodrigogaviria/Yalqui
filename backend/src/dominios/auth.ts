import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, privado } from "../trpc/base.js";
import { usuarios, consentimientos } from "../db/schema/identidad.js";
import { cifrarContrasena, verificarContrasena } from "../auth/password.js";
import { emitirToken } from "../auth/token.js";
import { hashToken } from "../auth/tokens-enlace.js";
import type { Database } from "../db/index.js";

/** La versión de la política que se acepta al registrarse. Sube con cada cambio. */
const VERSION_POLITICA = "2026-08";

const email = z.string().trim().toLowerCase().email().max(191);
const contrasena = z
  .string()
  .min(10, "Diez caracteres o más")
  .max(200, "Demasiado larga");

const registro = z.object({
  email,
  contrasena,
  nombre: z.string().trim().min(1).max(120),
  apellido: z.string().trim().min(1).max(120),
  telefono: z.string().trim().max(30).optional(),
  tipoDocumento: z.enum(["CC", "CE", "NIT", "PA"]),
  numeroDocumento: z.string().trim().min(4).max(40),
  aceptaTratamientoDatos: z.literal(true, {
    message: "Hay que autorizar el tratamiento de datos para crear la cuenta",
  }),
});

export const authRouter = router({
  /**
   * Crea la cuenta. No otorga ningún rol: nadie es propietario ni inquilino
   * de nada al registrarse. El rol aparece con su ámbito cuando registra un
   * inmueble o cuando firma un contrato.
   */
  registrar: publico.input(registro).mutation(async ({ ctx, input }) => {
    // Se comprueban las dos llaves únicas antes de insertar. Sin esto, un
    // documento repetido salía como un volcado de SQL en la pantalla del
    // usuario, con la consulta y sus parámetros adentro.
    const [porCorreo] = await ctx.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, input.email))
      .limit(1);

    if (porCorreo) {
      throw new TRPCError({ code: "CONFLICT", message: "Ese correo ya tiene cuenta" });
    }

    const [porDocumento] = await ctx.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(
        eq(usuarios.tipoDocumento, input.tipoDocumento),
        eq(usuarios.numeroDocumento, input.numeroDocumento),
      ))
      .limit(1);

    if (porDocumento) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Ya hay una cuenta con ${input.tipoDocumento} ${input.numeroDocumento}. Si es tuya, entrá con ella.`,
      });
    }

    const passwordHash = await cifrarContrasena(input.contrasena);

    // El consentimiento se guarda en la misma transacción que el usuario:
    // una cuenta sin su autorización registrada no debería poder existir.
    const usuarioId = await ctx.db.transaction(async (tx) => {
      const [res] = await tx.insert(usuarios).values({
        email: input.email,
        passwordHash,
        nombre: input.nombre,
        apellido: input.apellido,
        telefono: input.telefono ?? null,
        tipoDocumento: input.tipoDocumento,
        numeroDocumento: input.numeroDocumento,
        estado: "activo",
      });
      const id = Number((res as { insertId: number }).insertId);

      await tx.insert(consentimientos).values({
        usuarioId: id,
        tipo: "tratamiento_datos",
        otorgado: true,
        versionPolitica: VERSION_POLITICA,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      });

      return id;
    });

    const { token, expiraEn } = await emitirToken({ usuarioId, email: input.email });
    return { usuarioId, token, expiraEn };
  }),

  /**
   * Inicia sesión.
   *
   * Correo inexistente y contraseña equivocada devuelven exactamente el mismo
   * error, y en los dos casos se paga el costo de un hash: si el usuario que no
   * existe respondiera más rápido, cualquiera podría averiguar qué correos
   * tienen cuenta midiendo el tiempo.
   */
  ingresar: publico
    .input(z.object({ email, contrasena: z.string().max(200) }))
    .mutation(async ({ ctx, input }) => {
      const [fila] = await ctx.db
        .select({
          id: usuarios.id,
          email: usuarios.email,
          passwordHash: usuarios.passwordHash,
          estado: usuarios.estado,
        })
        .from(usuarios)
        .where(eq(usuarios.email, input.email))
        .limit(1);

      const hashSenuelo = "scrypt$32768$8$1$c2VudWVsbw$c2VudWVsbw";
      const coincide = await verificarContrasena(
        input.contrasena,
        fila?.passwordHash ?? hashSenuelo,
      );

      if (!fila || !coincide) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Correo o contraseña incorrectos" });
      }
      if (fila.estado === "suspendido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cuenta suspendida" });
      }

      await ctx.db
        .update(usuarios)
        .set({ ultimoAccesoAt: new Date() })
        .where(eq(usuarios.id, fila.id));

      const { token, expiraEn } = await emitirToken({ usuarioId: fila.id, email: fila.email });
      return { usuarioId: fila.id, token, expiraEn };
    }),

  /**
   * Qué cuenta hay detrás de un enlace de activación.
   *
   * Devuelve solo el nombre y el correo: lo justo para que quien abre el enlace
   * confirme que es suyo antes de poner una contraseña. Un token vencido o ya
   * usado responde igual que uno inventado, para no confirmarle a nadie que
   * cierto enlace existió.
   */
  verActivacion: publico
    .input(z.object({ token: z.string().min(20).max(64) }))
    .query(async ({ ctx, input }) => {
      const cuenta = await cuentaPorToken(ctx.db, input.token);
      return { email: cuenta.email, nombre: cuenta.nombre, apellido: cuenta.apellido };
    }),

  /**
   * Activa la cuenta que otro creó, eligiendo contraseña.
   *
   * Al activarla el token se borra: es de un solo uso, y desde ese momento
   * quien la creó ya no tiene forma de entrar.
   */
  activar: publico
    .input(z.object({ token: z.string().min(20).max(64), contrasena }))
    .mutation(async ({ ctx, input }) => {
      const cuenta = await cuentaPorToken(ctx.db, input.token);

      await ctx.db
        .update(usuarios)
        .set({
          passwordHash: await cifrarContrasena(input.contrasena),
          activacionToken: null,
          activacionExpiraAt: null,
          estado: "activo",
        })
        .where(eq(usuarios.id, cuenta.id));

      // El consentimiento se registra al activar y no al crearla: quien la creó
      // no puede autorizar el tratamiento de datos de otra persona.
      await ctx.db.insert(consentimientos).values({
        usuarioId: cuenta.id,
        tipo: "tratamiento_datos",
        otorgado: true,
        versionPolitica: VERSION_POLITICA,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      });

      const { token, expiraEn } = await emitirToken({ usuarioId: cuenta.id, email: cuenta.email });
      return { usuarioId: cuenta.id, token, expiraEn };
    }),

  /** Quién soy y qué puedo. Los roles salen de la base, no del token. */
  sesion: privado.query(({ ctx }) => ({
    id: ctx.usuario.id,
    email: ctx.usuario.email,
    roles: ctx.usuario.roles,
  })),

  /** Cambia la contraseña. Exige la actual aunque haya sesión: una sesión
   *  robada no debería poder cerrarle la cuenta al dueño. */
  cambiarContrasena: privado
    .input(z.object({ actual: z.string().max(200), nueva: contrasena }))
    .mutation(async ({ ctx, input }) => {
      const [fila] = await ctx.db
        .select({ passwordHash: usuarios.passwordHash })
        .from(usuarios)
        .where(eq(usuarios.id, ctx.usuario.id))
        .limit(1);

      if (!fila || !(await verificarContrasena(input.actual, fila.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "La contraseña actual no coincide" });
      }

      await ctx.db
        .update(usuarios)
        .set({ passwordHash: await cifrarContrasena(input.nueva) })
        .where(eq(usuarios.id, ctx.usuario.id));

      return { ok: true };
    }),
});

/**
 * La cuenta detrás de un token de activación, o un error indistinguible.
 *
 * Token inexistente, vencido o ya usado devuelven el mismo mensaje: si el
 * vencido dijera «venció», estaría confirmando que ese enlace fue real.
 */
async function cuentaPorToken(db: Database, token: string) {
  const [cuenta] = await db
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      apellido: usuarios.apellido,
      expira: usuarios.activacionExpiraAt,
    })
    .from(usuarios)
    .where(eq(usuarios.activacionToken, hashToken(token)))
    .limit(1);

  if (!cuenta || cuenta.expira === null || cuenta.expira < new Date()) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Ese enlace no sirve. Pedile al propietario que te mande uno nuevo.",
    });
  }
  return cuenta;
}
