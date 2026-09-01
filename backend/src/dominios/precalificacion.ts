import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, exigirRol } from "../trpc/base.js";
import {
  precalificaciones, precalificacionAportantes, reglasPrecalificacion, visitas,
} from "../db/schema/demanda.js";
import { inmuebles } from "../db/schema/inventario.js";
import { nuevoToken, hashToken, expiraEn } from "../auth/tokens-enlace.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

const dinero = z.number().nonnegative().max(999_999_999);

/**
 * Recalcula y decide.
 *
 * La cuenta es canon más lo que la unidad cobra aparte, contra el ingreso
 * total. Es lo único que decide: edad, género y ciudad de nacimiento se piden
 * porque los necesita la verificación de identidad y no entran acá.
 */
function evaluar(
  gastoMensual: number,
  ingresoTotal: number,
  regla: { umbralHolgado: string; umbralAjustado: string; umbralLimite: string },
) {
  if (ingresoTotal <= 0) {
    return { relacionPct: null, nivel: "no_alcanza" as const, estado: "no_alcanza" as const, falta: gastoMensual * 2 };
  }
  const pct = (gastoMensual / ingresoTotal) * 100;
  const holgado = Number(regla.umbralHolgado);
  const ajustado = Number(regla.umbralAjustado);
  const limite = Number(regla.umbralLimite);

  const nivel = pct <= holgado ? "holgado"
    : pct <= ajustado ? "ajustado"
    : pct <= limite ? "al_limite"
    : "no_alcanza";

  return {
    relacionPct: Number(pct.toFixed(2)),
    nivel,
    estado: nivel === "no_alcanza" ? ("no_alcanza" as const)
      : nivel === "al_limite" ? ("con_reservas" as const)
      : ("preaprobada" as const),
    // Cuánto ingreso haría falta en total para quedar dentro del tope.
    falta: nivel === "no_alcanza" ? Math.max(0, gastoMensual / (limite / 100) - ingresoTotal) : 0,
  };
}

async function reglaVigente(db: any) {
  const [r] = await db
    .select()
    .from(reglasPrecalificacion)
    .where(eq(reglasPrecalificacion.estado, "vigente"))
    .limit(1);
  if (!r) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No hay regla de precalificación vigente" });
  return r;
}

/** Recalcula la fila entera desde sus aportantes confirmados. */
async function recalcular(db: any, precalificacionId: number) {
  const [p] = await db.select().from(precalificaciones)
    .where(eq(precalificaciones.id, precalificacionId)).limit(1);
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Precalificación no encontrada" });

  const aportantes = await db.select().from(precalificacionAportantes)
    .where(and(eq(precalificacionAportantes.precalificacionId, precalificacionId),
               eq(precalificacionAportantes.estado, "confirmado")));

  const deAportantes = aportantes.reduce(
    (t: number, a: any) => t + Number(a.ingresosDeclarados ?? 0), 0);
  const total = Number(p.ingresosDeclarados ?? 0) + deAportantes;
  const gasto = Number(p.canonEvaluado) + Number(p.gastosUnidad ?? 0) + Number(p.cuotaCreditos ?? 0);

  const regla = await reglaVigente(db);
  const r = evaluar(gasto, total, regla);

  await db.update(precalificaciones).set({
    ingresosAportantes: deAportantes.toFixed(2),
    ingresosTotales: total.toFixed(2),
    disponibleEstimado: (total - gasto).toFixed(2),
    relacionPct: r.relacionPct?.toFixed(2) ?? null,
    nivel: r.nivel,
    estado: r.estado,
    reglaId: regla.id,
    completadaAt: new Date(),
  }).where(eq(precalificaciones.id, precalificacionId));

  return { ...r, ingresosTotales: total, gastoMensual: gasto, aportantes: aportantes.length };
}

export const precalificacionRouter = router({
  /**
   * El botón de la visita. Genera el enlace que se le manda al interesado.
   *
   * El gasto que se evalúa no es el canon pelado: incluye la administración y
   * los servicios que la unidad cobra aparte, porque eso es lo que la persona
   * va a pagar de verdad todos los meses.
   */
  enviar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      visitaId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [u] = await ctx.db
        .select({
          canonBase: inmuebles.canonBase,
          valorAdministracion: inmuebles.valorAdministracion,
          administracionIncluida: inmuebles.administracionIncluida,
        })
        .from(inmuebles).where(eq(inmuebles.id, input.inmuebleId)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });

      if (input.visitaId !== undefined) {
        const [v] = await ctx.db.select({ estado: visitas.estado }).from(visitas)
          .where(and(eq(visitas.id, input.visitaId), eq(visitas.inmuebleId, input.inmuebleId))).limit(1);
        if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Esa visita no es de esta unidad" });
      }

      const gastosUnidad = u.administracionIncluida ? 0 : Number(u.valorAdministracion);
      const { token, hash } = nuevoToken();

      const [res] = await ctx.db.insert(precalificaciones).values({
        visitaId: input.visitaId ?? null,
        inmuebleId: input.inmuebleId,
        token: hash,
        tokenExpiraAt: expiraEn(72),
        canonEvaluado: u.canonBase,
        gastosUnidad: gastosUnidad.toFixed(2),
        estado: "enviada",
        enviadaAt: new Date(),
      });

      return {
        precalificacionId: Number((res as { insertId: number }).insertId),
        // El token solo se devuelve acá: en la base queda su hash.
        enlace: `/precalificar/${token}`,
        expiraEn: "72 horas",
      };
    }),

  /** Lo que ve el interesado al abrir el enlace. Sin sesión. */
  abrir: publico
    .input(z.object({ token: z.string().min(20).max(64) }))
    .query(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select({
          id: precalificaciones.id, estado: precalificaciones.estado,
          tokenExpiraAt: precalificaciones.tokenExpiraAt,
          canonEvaluado: precalificaciones.canonEvaluado,
          gastosUnidad: precalificaciones.gastosUnidad,
          direccion: inmuebles.direccion, ciudad: inmuebles.ciudad, tipo: inmuebles.tipo,
        })
        .from(precalificaciones)
        .innerJoin(inmuebles, eq(inmuebles.id, precalificaciones.inmuebleId))
        .where(eq(precalificaciones.token, hashToken(input.token)))
        .limit(1);

      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });
      if (p.tokenExpiraAt && p.tokenExpiraAt < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ese enlace ya venció. Pedile uno nuevo al arrendador." });
      }

      return {
        estado: p.estado,
        unidad: { direccion: p.direccion, ciudad: p.ciudad, tipo: p.tipo },
        pagariaAlMes: Number(p.canonEvaluado) + Number(p.gastosUnidad ?? 0),
      };
    }),

  /** El interesado llena sus datos y el sistema decide. */
  responder: publico
    .input(z.object({
      token: z.string().min(20).max(64),
      nombreCompleto: z.string().trim().min(3).max(191),
      tipoDocumento: z.enum(["CC", "CE", "NIT", "PA"]),
      numeroDocumento: z.string().trim().min(4).max(40),
      fechaNacimiento: z.coerce.date(),
      ciudadNacimiento: z.string().trim().max(120).optional(),
      genero: z.enum(["femenino", "masculino", "no_binario", "otro", "prefiere_no_decir"]).optional(),
      ocupacion: z.enum(["estudiante", "empleado", "independiente", "pensionado"]),
      ingresosDeclarados: dinero,
      cuotaCreditos: dinero.optional(),
      numDependientes: z.number().int().min(0).max(20).optional(),
      canonAnterior: dinero.optional(),
      motivoMudanza: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db.select().from(precalificaciones)
        .where(eq(precalificaciones.token, hashToken(input.token))).limit(1);

      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });
      if (p.tokenExpiraAt && p.tokenExpiraAt < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ese enlace ya venció" });
      }

      await ctx.db.update(precalificaciones).set({
        nombreCompleto: input.nombreCompleto,
        tipoDocumento: input.tipoDocumento,
        numeroDocumento: input.numeroDocumento,
        fechaNacimiento: input.fechaNacimiento,
        ciudadNacimiento: input.ciudadNacimiento ?? null,
        genero: input.genero ?? null,
        ocupacion: input.ocupacion,
        ingresosDeclarados: input.ingresosDeclarados.toFixed(2),
        cuotaCreditos: input.cuotaCreditos?.toFixed(2) ?? null,
        numDependientes: input.numDependientes ?? null,
        canonAnterior: input.canonAnterior?.toFixed(2) ?? null,
        motivoMudanza: input.motivoMudanza ?? null,
        metodoIngreso: "declarado",
        estado: "en_diligenciamiento",
      }).where(eq(precalificaciones.id, p.id));

      const r = await recalcular(ctx.db, p.id);
      return {
        estado: r.estado,
        nivel: r.nivel,
        relacionPct: r.relacionPct,
        // Preaprobado es sobre ingresos declarados: los extractos vienen después.
        aclaracion: r.estado === "no_alcanza"
          ? `Con lo que declarás no alcanza. Necesitarías ${Math.ceil(r.falta / 1000) * 1000} más al mes entre todos, o agregar quién te ayuda a pagar.`
          : "Te alcanza según lo que declaraste. Falta demostrarlo con los documentos.",
      };
    }),

  /** Agrega a quien va a ayudar a pagar. Le llega su propio enlace. */
  agregarAportante: publico
    .input(z.object({
      token: z.string().min(20).max(64),
      nombre: z.string().trim().min(3).max(191),
      relacion: z.enum(["madre", "padre", "pareja", "hermano", "familiar", "empleador", "amigo", "otro"]),
      telefono: z.string().trim().min(7).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db.select({ id: precalificaciones.id }).from(precalificaciones)
        .where(eq(precalificaciones.token, hashToken(input.token))).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });

      const { token, hash } = nuevoToken();
      const [res] = await ctx.db.insert(precalificacionAportantes).values({
        precalificacionId: p.id,
        nombre: input.nombre,
        relacion: input.relacion,
        telefono: input.telefono,
        token: hash,
        tokenExpiraAt: expiraEn(72),
        estado: "pendiente",
        enviadoAt: new Date(),
      });

      return {
        aportanteId: Number((res as { insertId: number }).insertId),
        // Responde él, no el aplicante: nadie declara los ingresos de otro.
        enlace: `/aportante/${token}`,
        aviso: "Le mandamos el enlace. Sus ingresos solo cuentan cuando él confirme.",
      };
    }),

  /**
   * El aportante responde por sí mismo.
   *
   * Que el aplicante marque «mi mamá acepta» es una afirmación de parte
   * interesada sobre alguien que no dijo nada: no sirve como compromiso ni
   * alcanza para tratar sus datos.
   */
  confirmarAportante: publico
    .input(z.object({
      token: z.string().min(20).max(64),
      tipoDocumento: z.enum(["CC", "CE", "NIT", "PA"]),
      numeroDocumento: z.string().trim().min(4).max(40),
      ocupacion: z.enum(["estudiante", "empleado", "independiente", "pensionado"]),
      ingresosDeclarados: dinero,
      aceptaSerCodeudor: z.boolean(),
      autorizaTratamiento: z.literal(true, {
        message: "Hay que autorizar el tratamiento de datos para poder incluir tus ingresos",
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await ctx.db.select().from(precalificacionAportantes)
        .where(eq(precalificacionAportantes.token, hashToken(input.token))).limit(1);

      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });
      if (a.tokenExpiraAt && a.tokenExpiraAt < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ese enlace ya venció" });
      }
      if (a.estado === "confirmado") {
        throw new TRPCError({ code: "CONFLICT", message: "Ya habías confirmado" });
      }

      await ctx.db.update(precalificacionAportantes).set({
        tipoDocumento: input.tipoDocumento,
        numeroDocumento: input.numeroDocumento,
        ocupacion: input.ocupacion,
        ingresosDeclarados: input.ingresosDeclarados.toFixed(2),
        aceptaSerCodeudor: input.aceptaSerCodeudor,
        estado: "confirmado",
        confirmadoAt: new Date(),
      }).where(eq(precalificacionAportantes.id, a.id));

      const r = await recalcular(ctx.db, a.precalificacionId);
      return { estado: r.estado, nivel: r.nivel, relacionPct: r.relacionPct };
    }),

  /** Rechazar también es información: el aplicante contaba con alguien que no va a estar. */
  rechazarAportante: publico
    .input(z.object({ token: z.string().min(20).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await ctx.db.select({ id: precalificacionAportantes.id })
        .from(precalificacionAportantes)
        .where(eq(precalificacionAportantes.token, hashToken(input.token))).limit(1);
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });

      await ctx.db.update(precalificacionAportantes)
        .set({ estado: "rechazado", confirmadoAt: new Date() })
        .where(eq(precalificacionAportantes.id, a.id));
      return { ok: true };
    }),

  /** Lo que ve el propietario. */
  deUnidad: delPropietario
    .input(z.object({ inmuebleId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const filas = await ctx.db.select().from(precalificaciones)
        .where(eq(precalificaciones.inmuebleId, input.inmuebleId));
      return { total: filas.length, precalificaciones: filas };
    }),
});
