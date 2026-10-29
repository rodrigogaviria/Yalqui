import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, publico } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { nuevoToken, hashToken } from "../auth/tokens-enlace.js";
import { inmuebles, inmueblePropietarios, extractosSocio } from "../db/schema/inventario.js";
import { usuarios } from "../db/schema/identidad.js";
import { movimientos } from "../db/schema/finanzas.js";
import { tiposMovimiento } from "../db/schema/administracion.js";

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Usá el formato AAAA-MM");

/** Las unidades donde este socio participa bajo este propietario, con su %. */
async function participacionDe(
  db: import("../db/index.js").Database, propietarioId: number, socioId: number,
) {
  const idsPropietario = await db.select({ id: inmuebles.id })
    .from(inmuebles).where(eq(inmuebles.propietarioId, propietarioId));
  const idsTodos = idsPropietario.map((u) => u.id);
  if (idsTodos.length === 0) return { idsTodos: [] as number[], porcentajes: new Map<number, number>() };

  const filas = await db
    .select({ inmuebleId: inmueblePropietarios.inmuebleId, porcentaje: inmueblePropietarios.porcentaje })
    .from(inmueblePropietarios)
    .where(and(
      inArray(inmueblePropietarios.inmuebleId, idsTodos), eq(inmueblePropietarios.usuarioId, socioId),
      eq(inmueblePropietarios.rol, "socio"), isNull(inmueblePropietarios.hasta),
    ));
  return { idsTodos, porcentajes: new Map(filas.map((f) => [f.inmuebleId, Number(f.porcentaje)])) };
}

export const extractosRouter = router({
  /**
   * Genera (o regenera) el extracto del mes de un socio: una foto de ese
   * período que no se mueve después, aunque se corrija un gasto más tarde.
   * Si ya existía uno para ese socio y ese mes, conserva el mismo enlace —
   * no tiene sentido invalidar uno que ya se mandó— y actualiza los números.
   */
  generar: privado
    .input(z.object({ socioId: z.number().int().positive(), periodo }))
    .mutation(async ({ ctx, input }) => {
      const { porcentajes } = await participacionDe(ctx.db, ctx.usuario.id, input.socioId);
      const idsSocio = [...porcentajes.keys()];
      if (idsSocio.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esa persona no es socia de ninguna de tus unidades" });
      }

      const unidades = await ctx.db
        .select({ id: inmuebles.id, estado: inmuebles.estado, canonBase: inmuebles.canonBase })
        .from(inmuebles).where(inArray(inmuebles.id, idsSocio));
      const ocupadas = unidades.filter((u) => u.estado === "arrendado");
      const ingresos = ocupadas.reduce((t, u) => t + Number(u.canonBase), 0);

      const filasMov = await ctx.db
        .select({
          inmuebleId: movimientos.inmuebleId, tipo: movimientos.tipo, monto: movimientos.monto,
          fecha: movimientos.fecha, concepto: tiposMovimiento.nombre,
        })
        .from(movimientos)
        .leftJoin(tiposMovimiento, eq(tiposMovimiento.id, movimientos.tipoMovimientoId))
        .where(and(inArray(movimientos.inmuebleId, idsSocio), eq(movimientos.estado, "finalizado")));
      const delMes = filasMov.filter((m) => String(m.fecha).slice(0, 7) === input.periodo);

      const recaudo = delMes.filter((m) => m.tipo === "ingreso").reduce((t, m) => t + Number(m.monto), 0);

      const porTipo = new Map<string, number>();
      for (const m of delMes.filter((m) => m.tipo === "egreso")) {
        const nombre = m.concepto ?? "Sin clasificar";
        porTipo.set(nombre, (porTipo.get(nombre) ?? 0) + Number(m.monto));
      }
      const gastosPorTipo = [...porTipo.entries()].map(([concepto, monto]) => ({ concepto, monto }))
        .sort((a, b) => b.monto - a.monto);
      const gastosTotal = gastosPorTipo.reduce((t, g) => t + g.monto, 0);

      // La utilidad se calcula unidad por unidad —cada una con su propio
      // recaudo, sus propios gastos y el % que le toca ahí al socio— y
      // después se suma. Un % único para todo el extracto estaría mal si el
      // socio no participa igual en cada unidad.
      let utilidadPropiedad = 0;
      let utilidadSocio = 0;
      for (const id of idsSocio) {
        const recaudoUnidad = delMes.filter((m) => m.inmuebleId === id && m.tipo === "ingreso")
          .reduce((t, m) => t + Number(m.monto), 0);
        const gastosUnidad = delMes.filter((m) => m.inmuebleId === id && m.tipo === "egreso")
          .reduce((t, m) => t + Number(m.monto), 0);
        const utilidadUnidad = recaudoUnidad - gastosUnidad;
        utilidadPropiedad += utilidadUnidad;
        utilidadSocio += utilidadUnidad * (porcentajes.get(id) ?? 0) / 100;
      }
      // Para mostrar un solo %: el peso real del socio en la utilidad del
      // período, o si no hubo utilidad, el promedio de lo que tiene en cada
      // unidad — nunca una cifra que no se pueda explicar.
      const porcentajeSocio = utilidadPropiedad !== 0
        ? (utilidadSocio / utilidadPropiedad) * 100
        : [...porcentajes.values()].reduce((t, p) => t + p, 0) / porcentajes.size;

      const [existente] = await ctx.db.select({ id: extractosSocio.id })
        .from(extractosSocio)
        .where(and(
          eq(extractosSocio.propietarioId, ctx.usuario.id), eq(extractosSocio.socioId, input.socioId),
          eq(extractosSocio.periodo, input.periodo),
        )).limit(1);

      // El token guardado es un hash: no hay forma de recuperar el original
      // para reenviarlo, así que regenerar arma un enlace nuevo y el viejo
      // deja de servir — no queda otra si se perdió el que se mandó antes.
      const { token, hash } = nuevoToken();
      const valores = {
        propietarioId: ctx.usuario.id, socioId: input.socioId, periodo: input.periodo, token: hash,
        unidadesTotales: unidades.length, unidadesOcupadas: ocupadas.length,
        ingresos: ingresos.toFixed(2), recaudo: recaudo.toFixed(2), gastosTotal: gastosTotal.toFixed(2),
        gastosPorTipo, porcentajeSocio: porcentajeSocio.toFixed(2),
        utilidadPropiedad: utilidadPropiedad.toFixed(2), utilidadSocio: utilidadSocio.toFixed(2),
        generadoPorId: ctx.usuario.id,
      };

      if (existente) {
        await ctx.db.update(extractosSocio).set(valores).where(eq(extractosSocio.id, existente.id));
      } else {
        await ctx.db.insert(extractosSocio).values(valores);
      }

      return { enlace: `/extracto?t=${token}`, regenerado: existente !== undefined };
    }),

  /** Mis extractos generados, el más nuevo primero. */
  mios: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: extractosSocio.id, periodo: extractosSocio.periodo,
        socioId: extractosSocio.socioId, socioNombre: usuarios.nombre, socioApellido: usuarios.apellido,
        utilidadSocio: extractosSocio.utilidadSocio, porcentajeSocio: extractosSocio.porcentajeSocio,
        createdAt: extractosSocio.createdAt, updatedAt: extractosSocio.updatedAt,
      })
      .from(extractosSocio)
      .innerJoin(usuarios, eq(usuarios.id, extractosSocio.socioId))
      .where(eq(extractosSocio.propietarioId, ctx.usuario.id))
      .orderBy(desc(extractosSocio.periodo), desc(extractosSocio.createdAt)),
  ),

  /** El enlace de un extracto ya generado, para volver a compartirlo. No
   *  existe forma de leer el token guardado —es un hash—, así que esto
   *  sirve para confirmar que existe, no para recuperar el enlace perdido. */
  deSocioYPeriodo: privado
    .input(z.object({ socioId: z.number().int().positive(), periodo }))
    .query(async ({ ctx, input }) => {
      const [fila] = await ctx.db.select({ id: extractosSocio.id })
        .from(extractosSocio)
        .where(and(
          eq(extractosSocio.propietarioId, ctx.usuario.id), eq(extractosSocio.socioId, input.socioId),
          eq(extractosSocio.periodo, input.periodo),
        )).limit(1);
      return { existe: fila !== undefined };
    }),

  /** Lo que ve quien abre el enlace: sin sesión, solo con el token. */
  verPublico: publico
    .input(z.object({ token: z.string().min(10).max(100) }))
    .query(async ({ ctx, input }) => {
      const [fila] = await ctx.db.select({
        periodo: extractosSocio.periodo,
        unidadesTotales: extractosSocio.unidadesTotales, unidadesOcupadas: extractosSocio.unidadesOcupadas,
        ingresos: extractosSocio.ingresos, recaudo: extractosSocio.recaudo,
        gastosTotal: extractosSocio.gastosTotal, gastosPorTipo: extractosSocio.gastosPorTipo,
        porcentajeSocio: extractosSocio.porcentajeSocio,
        utilidadPropiedad: extractosSocio.utilidadPropiedad, utilidadSocio: extractosSocio.utilidadSocio,
        propietarioNombre: usuarios.nombre, propietarioApellido: usuarios.apellido,
      })
        .from(extractosSocio)
        .innerJoin(usuarios, eq(usuarios.id, extractosSocio.propietarioId))
        .where(eq(extractosSocio.token, hashToken(input.token))).limit(1);
      if (!fila) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe o ya no es válido" });
      return fila;
    }),
});
