import { z } from "zod";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { ambitosCon, tieneRol } from "../auth/roles.js";
import { puedeSobreEdificacion } from "./facturasPropiedad.js";
import { repartirEnEdificacion, reRepartirEnEdificacion } from "./gastoDeFactura.js";
import { movimientos } from "../db/schema/finanzas.js";
import { inmuebles, edificaciones, inmueblePropietarios, pagosSocio, pagosSocioMedios } from "../db/schema/inventario.js";
import { tiposMovimiento } from "../db/schema/administracion.js";
import { proveedores } from "../db/schema/operacion.js";
import { archivos, usuarios } from "../db/schema/identidad.js";
import { facturasPropiedad, tiposFactura } from "../db/schema/facturasPropiedad.js";

const dinero = z.number().min(0).max(999_999_999);
/** Un mes en formato AAAA-MM, como lo escribe el selector del navegador. */
const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Usá el formato AAAA-MM");

export const rentabilidadRouter = router({
  /** Los conceptos con los que se puede clasificar un movimiento. */
  tipos: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: tiposMovimiento.id,
        nombre: tiposMovimiento.nombre,
        tipo: tiposMovimiento.tipo,
        deducible: tiposMovimiento.deducible,
        ambito: tiposMovimiento.ambito,
      })
      .from(tiposMovimiento)
      .where(eq(tiposMovimiento.activo, true))
      .orderBy(tiposMovimiento.tipo, tiposMovimiento.orden),
  ),

  /** El catálogo de proveedores, para elegir quién cobró un gasto. Es el
   *  mismo de incidencias; lo administra Yalqui, no cada propietario. */
  proveedores: privado.query(({ ctx }) =>
    ctx.db
      .select({ id: proveedores.id, razonSocial: proveedores.razonSocial })
      .from(proveedores)
      .where(eq(proveedores.activo, true))
      .orderBy(proveedores.razonSocial),
  ),

  /**
   * Los gastos tal como se anotaron: uno por gasto. Uno sobre la edificación
   * sale una sola vez, con su total, y no una vez por cada unidad entre las
   * que se reparte —esas partes viven en el resumen, que es lo que suma Mis
   * Rendimientos—.
   */
  gastos: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    const eds = [
      ...ambitosCon(ctx.usuario.roles, "propietario", "edificacion"),
      ...ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion"),
    ];
    if (ids.length === 0 && eds.length === 0) return [];
    const filas = await ctx.db
      .select({
        id: movimientos.id,
        monto: movimientos.monto,
        fecha: movimientos.fecha,
        nota: movimientos.nota,
        proveedor: movimientos.proveedor,
        origenTipo: movimientos.origenTipo,
        prorrateo: movimientos.prorrateo,
        estadoMovimiento: movimientos.estado,
        edificacion: edificaciones.nombre,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        concepto: tiposMovimiento.nombre,
      })
      .from(movimientos)
      .leftJoin(inmuebles, eq(inmuebles.id, movimientos.inmuebleId))
      .leftJoin(edificaciones, eq(edificaciones.id, movimientos.edificacionId))
      .leftJoin(tiposMovimiento, eq(tiposMovimiento.id, movimientos.tipoMovimientoId))
      .where(and(
        eq(movimientos.tipo, "egreso"),
        or(
          ...(ids.length > 0 ? [and(inArray(movimientos.inmuebleId, ids), isNull(movimientos.movimientoPadreId))] : []),
          ...(eds.length > 0 ? [inArray(movimientos.edificacionId, eds)] : []),
        ),
      ))
      .orderBy(desc(movimientos.fecha), desc(movimientos.id));

    // Las partes de cada gasto repartido: lo que le tocó a cada unidad.
    const padres = filas.filter((f) => f.edificacion !== null).map((f) => f.id);
    const partes = padres.length === 0 ? [] : await ctx.db
      .select({
        padreId: movimientos.movimientoPadreId, monto: movimientos.monto,
        direccion: inmuebles.direccion, complemento: inmuebles.complemento,
      })
      .from(movimientos)
      .innerJoin(inmuebles, eq(inmuebles.id, movimientos.inmuebleId))
      .where(inArray(movimientos.movimientoPadreId, padres))
      .orderBy(inmuebles.direccion, inmuebles.complemento);

    // Con comprobante propio, o nacido ya pagado de una factura: lo que marca
    // un gasto como respaldado en el calendario.
    const idsFila = filas.map((f) => f.id);
    const conComprobante = idsFila.length === 0 ? new Set<number>() : new Set(
      (await ctx.db.selectDistinct({ id: archivos.entidadId })
        .from(archivos)
        .where(and(eq(archivos.entidadTipo, "movimiento_gasto"), inArray(archivos.entidadId, idsFila))))
        .map((a) => Number(a.id)),
    );

    const registrados = filas.map(({ estadoMovimiento, ...f }) => ({
      ...f,
      pendiente: estadoMovimiento === "pendiente",
      pagado: f.origenTipo === "factura_propiedad" || conComprobante.has(f.id),
      partes: partes.filter((x) => x.padreId === f.id)
        .map((x) => ({ unidad: `${x.direccion}${x.complemento ? `, ${x.complemento}` : ""}`, monto: x.monto })),
    }));

    // Las facturas de servicios sin pagar todavía: no son plata que ya salió
    // —no cuentan en el total ni en Mis Rendimientos—, pero conviene verlas
    // acá para no enterarse solo al llegar a Mis Facturas. El propietario es
    // quien las debe: las que paga el inquilino no son su gasto.
    const sinPagar = await ctx.db
      .select({
        id: facturasPropiedad.id, valor: facturasPropiedad.valor,
        fechaVencimiento: facturasPropiedad.fechaVencimiento, periodo: facturasPropiedad.periodo,
        prorrateo: facturasPropiedad.prorrateo,
        edificacion: edificaciones.nombre, direccion: inmuebles.direccion, complemento: inmuebles.complemento,
        servicio: tiposFactura.nombre,
      })
      .from(facturasPropiedad)
      .leftJoin(inmuebles, eq(inmuebles.id, facturasPropiedad.inmuebleId))
      .leftJoin(edificaciones, eq(edificaciones.id, facturasPropiedad.edificacionId))
      .innerJoin(tiposFactura, eq(tiposFactura.id, facturasPropiedad.tipoFacturaId))
      .where(and(
        eq(facturasPropiedad.estado, "sin_pagar"), eq(facturasPropiedad.responsable, "propietario"),
        or(
          ...(ids.length > 0 ? [inArray(facturasPropiedad.inmuebleId, ids)] : []),
          ...(eds.length > 0 ? [inArray(facturasPropiedad.edificacionId, eds)] : []),
        ),
      ));

    const pendientes = sinPagar.map((f) => ({
      id: -f.id, monto: f.valor, fecha: f.fechaVencimiento,
      nota: `Factura de ${f.servicio.toLowerCase()} · ${f.periodo} · sin pagar`,
      proveedor: null, origenTipo: "factura_propiedad" as const, prorrateo: f.prorrateo,
      edificacion: f.edificacion, direccion: f.direccion, complemento: f.complemento,
      concepto: f.servicio, pendiente: true as const, pagado: false, partes: [] as Array<{ unidad: string; monto: string }>,
    }));

    return [...registrados, ...pendientes].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }),

  /**
   * Ingresos y egresos del propietario, con el resultado del período.
   *
   * El neto es ingresos menos egresos sin más: no descuenta impuestos ni
   * amortizaciones. Es caja, no contabilidad — decir «rentabilidad» de otra
   * forma exigiría datos que el sistema no tiene.
   */
  resumen: privado
    .input(z.object({
      desde: periodo.optional(), hasta: periodo.optional(),
      /** Solo para el principal: previsualiza lo que ve un socio suyo, a su %. */
      verComoSocioId: z.number().int().positive().optional(),
    }).default({}))
    .query(async ({ ctx, input }) => {
      const idsPropietario = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
      const idsSocio = ambitosCon(ctx.usuario.roles, "socio_propietario", "inmueble");

      // A qué % se ve cada unidad: 100% si es la vista del propietario,
      // o el % del socio (el propio, o el que el principal quiere previsualizar).
      let ids: number[];
      let porcentajes: Map<number, number>;
      if (input.verComoSocioId !== undefined) {
        if (idsPropietario.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo el propietario puede ver como un socio" });
        }
        const filas = await ctx.db
          .select({ inmuebleId: inmueblePropietarios.inmuebleId, porcentaje: inmueblePropietarios.porcentaje })
          .from(inmueblePropietarios)
          .where(and(
            inArray(inmueblePropietarios.inmuebleId, idsPropietario),
            eq(inmueblePropietarios.usuarioId, input.verComoSocioId),
            eq(inmueblePropietarios.rol, "socio"), isNull(inmueblePropietarios.hasta),
          ));
        ids = filas.map((f) => f.inmuebleId);
        porcentajes = new Map(filas.map((f) => [f.inmuebleId, Number(f.porcentaje)]));
      } else if (idsPropietario.length > 0) {
        ids = idsPropietario;
        porcentajes = new Map(ids.map((id) => [id, 100]));
      } else if (idsSocio.length > 0) {
        const filas = await ctx.db
          .select({ inmuebleId: inmueblePropietarios.inmuebleId, porcentaje: inmueblePropietarios.porcentaje })
          .from(inmueblePropietarios)
          .where(and(
            inArray(inmueblePropietarios.inmuebleId, idsSocio),
            eq(inmueblePropietarios.usuarioId, ctx.usuario.id),
            eq(inmueblePropietarios.rol, "socio"), isNull(inmueblePropietarios.hasta),
          ));
        ids = filas.map((f) => f.inmuebleId);
        porcentajes = new Map(filas.map((f) => [f.inmuebleId, Number(f.porcentaje)]));
      } else {
        ids = [];
        porcentajes = new Map();
      }

      if (ids.length === 0) {
        return { movimientos: [], ingresos: 0, egresos: 0, neto: 0, porUnidad: [], porConcepto: [] };
      }

      const filas = await ctx.db
        .select({
          id: movimientos.id,
          tipo: movimientos.tipo,
          monto: movimientos.monto,
          fecha: movimientos.fecha,
          nota: movimientos.nota,
          proveedor: movimientos.proveedor,
          origenTipo: movimientos.origenTipo,
          reparto: movimientos.movimientoPadreId,
          inmuebleId: inmuebles.id,
          direccion: inmuebles.direccion,
          complemento: inmuebles.complemento,
          concepto: tiposMovimiento.nombre,
          deducible: tiposMovimiento.deducible,
        })
        .from(movimientos)
        .innerJoin(inmuebles, eq(inmuebles.id, movimientos.inmuebleId))
        .leftJoin(tiposMovimiento, eq(tiposMovimiento.id, movimientos.tipoMovimientoId))
        // Lo pendiente no es caja todavía: no cuenta en Mis Rendimientos.
        .where(and(inArray(movimientos.inmuebleId, ids), eq(movimientos.estado, "finalizado")))
        .orderBy(desc(movimientos.fecha));

      // El rango se filtra acá y no en SQL porque `fecha` es DATE y el período
      // llega como AAAA-MM: comparar los siete primeros caracteres es más claro
      // que construir el primer y último día del mes en la consulta. El monto
      // ya sale a la parte que le toca a quien mira: 100% si es el propietario
      // viendo lo suyo, su % si es un socio.
      const dentro = filas
        .filter((m) => {
          const mes = String(m.fecha).slice(0, 7);
          if (input.desde !== undefined && mes < input.desde) return false;
          if (input.hasta !== undefined && mes > input.hasta) return false;
          return true;
        })
        .map((m) => ({ ...m, monto: (Number(m.monto) * (porcentajes.get(m.inmuebleId) ?? 100) / 100).toFixed(2) }));

      const suma = (t: "ingreso" | "egreso") =>
        dentro.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.monto), 0);

      const ingresos = suma("ingreso");
      const egresos = suma("egreso");

      const agrupar = <T extends string | number>(
        clave: (m: (typeof dentro)[number]) => T,
        titulo: (m: (typeof dentro)[number]) => string,
      ) => {
        const mapa = new Map<T, { titulo: string; ingresos: number; egresos: number }>();
        for (const m of dentro) {
          const k = clave(m);
          const actual = mapa.get(k) ?? { titulo: titulo(m), ingresos: 0, egresos: 0 };
          if (m.tipo === "ingreso") actual.ingresos += Number(m.monto);
          else actual.egresos += Number(m.monto);
          mapa.set(k, actual);
        }
        return [...mapa.entries()].map(([k, v]) => ({ clave: k, ...v, neto: v.ingresos - v.egresos }));
      };

      return {
        movimientos: dentro,
        ingresos,
        egresos,
        neto: ingresos - egresos,
        porUnidad: agrupar(
          (m) => m.inmuebleId,
          (m) => `${m.direccion}${m.complemento ? `, ${m.complemento}` : ""}`,
        ).sort((a, b) => b.neto - a.neto),
        porConcepto: agrupar((m) => m.concepto ?? "Sin clasificar", (m) => m.concepto ?? "Sin clasificar")
          .sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos)),
      };
    }),

  /** Los socios de mis unidades, para elegir a cuál previsualizar en Mis Rendimientos. */
  misSociosInversionistas: privado.query(async ({ ctx }) => {
    const idsPropietario = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (idsPropietario.length === 0) return [];
    const filas = await ctx.db
      .selectDistinct({ id: usuarios.id, nombre: usuarios.nombre, apellido: usuarios.apellido })
      .from(inmueblePropietarios)
      .innerJoin(usuarios, eq(usuarios.id, inmueblePropietarios.usuarioId))
      .where(and(
        inArray(inmueblePropietarios.inmuebleId, idsPropietario),
        eq(inmueblePropietarios.rol, "socio"), isNull(inmueblePropietarios.hasta),
      ));
    return filas;
  }),

  /** Las edificaciones donde soy propietario directo —no solo administrador—,
   *  para elegir cuál mirar en el resumen agregado de Mis Rendimientos. */
  edificacionesPropias: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "edificacion");
    if (ids.length === 0) return [];
    return ctx.db
      .select({ id: edificaciones.id, nombre: edificaciones.nombre })
      .from(edificaciones)
      .where(inArray(edificaciones.id, ids))
      .orderBy(edificaciones.nombre);
  }),

  /**
   * El resumen de un mes para la edificación entera: cuántas unidades,
   * cuánto se esperaba, cuánto se recaudó, los gastos por tipo y la
   * utilidad —y cómo se reparte entre los socios, según su %—.
   */
  resumenEdificacion: privado
    .input(z.object({ edificacionId: z.number().int().positive(), periodo }))
    .query(async ({ ctx, input }) => {
      if (!tieneRol(ctx.usuario.roles, "propietario", "edificacion", input.edificacionId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No sos propietario de esa edificación" });
      }

      const unidades = await ctx.db
        .select({ id: inmuebles.id, estado: inmuebles.estado, canonBase: inmuebles.canonBase })
        .from(inmuebles).where(eq(inmuebles.edificacionId, input.edificacionId));
      const idsUnidad = unidades.map((u) => u.id);
      const ocupadas = unidades.filter((u) => u.estado === "arrendado");
      const ingresosTotales = ocupadas.reduce((t, u) => t + Number(u.canonBase), 0);

      const filasMov = idsUnidad.length === 0 ? [] : await ctx.db
        .select({
          inmuebleId: movimientos.inmuebleId, tipo: movimientos.tipo, monto: movimientos.monto,
          fecha: movimientos.fecha, concepto: tiposMovimiento.nombre,
        })
        .from(movimientos)
        .leftJoin(tiposMovimiento, eq(tiposMovimiento.id, movimientos.tipoMovimientoId))
        .where(and(inArray(movimientos.inmuebleId, idsUnidad), eq(movimientos.estado, "finalizado")));
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
      const utilidad = recaudo - gastosTotal;

      // Por unidad, para repartir la utilidad entre los socios con el % que
      // cada uno tiene ahí —igual criterio que el extracto individual—.
      const porUnidad = new Map<number, number>();
      for (const id of idsUnidad) {
        const recU = delMes.filter((m) => m.inmuebleId === id && m.tipo === "ingreso").reduce((t, m) => t + Number(m.monto), 0);
        const gasU = delMes.filter((m) => m.inmuebleId === id && m.tipo === "egreso").reduce((t, m) => t + Number(m.monto), 0);
        porUnidad.set(id, recU - gasU);
      }

      const socios = idsUnidad.length === 0 ? [] : await ctx.db
        .select({
          usuarioId: inmueblePropietarios.usuarioId, nombre: usuarios.nombre, apellido: usuarios.apellido,
          porcentaje: inmueblePropietarios.porcentaje, inmuebleId: inmueblePropietarios.inmuebleId,
        })
        .from(inmueblePropietarios)
        .innerJoin(usuarios, eq(usuarios.id, inmueblePropietarios.usuarioId))
        .where(and(
          inArray(inmueblePropietarios.inmuebleId, idsUnidad),
          eq(inmueblePropietarios.rol, "socio"), isNull(inmueblePropietarios.hasta),
        ));

      const porSocio = new Map<number, { nombre: string; apellido: string; utilidad: number; pesos: number[] }>();
      for (const s of socios) {
        const utilidadUnidad = porUnidad.get(s.inmuebleId) ?? 0;
        const actual = porSocio.get(s.usuarioId) ?? { nombre: s.nombre, apellido: s.apellido, utilidad: 0, pesos: [] };
        actual.utilidad += utilidadUnidad * Number(s.porcentaje) / 100;
        actual.pesos.push(Number(s.porcentaje));
        porSocio.set(s.usuarioId, actual);
      }

      return {
        unidades: unidades.length,
        ingresosTotales, recaudo, gastosPorTipo, gastosTotal, utilidad,
        socios: [...porSocio.entries()].map(([usuarioId, s]) => ({
          usuarioId, nombre: s.nombre, apellido: s.apellido,
          porcentaje: utilidad !== 0 ? (s.utilidad / utilidad) * 100 : s.pesos.reduce((t, p) => t + p, 0) / s.pesos.length,
          utilidad: s.utilidad,
        })).sort((a, b) => b.utilidad - a.utilidad),
      };
    }),

  /** Registra que se le pagó a un socio su utilidad: con fecha, y uno o
   *  varios medios —cada uno con su monto, y comprobante si fue transferencia—. */
  registrarPagoSocio: privado
    .input(z.object({
      socioId: z.number().int().positive(),
      edificacionId: z.number().int().positive().optional(),
      periodo: periodo.optional(),
      fecha: z.coerce.date(),
      partes: z.array(z.object({
        monto: dinero,
        medio: z.enum(["efectivo", "transferencia", "cheque", "otro"]),
        comprobanteArchivoId: z.number().int().positive().optional(),
      })).min(1).max(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const [esMiSocio] = await ctx.db.select({ id: inmueblePropietarios.id })
        .from(inmueblePropietarios)
        .innerJoin(inmuebles, eq(inmuebles.id, inmueblePropietarios.inmuebleId))
        .where(and(
          eq(inmueblePropietarios.usuarioId, input.socioId), eq(inmueblePropietarios.rol, "socio"),
          isNull(inmueblePropietarios.hasta), eq(inmuebles.propietarioId, ctx.usuario.id),
        )).limit(1);
      if (!esMiSocio) throw new TRPCError({ code: "FORBIDDEN", message: "Esa persona no es tu socia" });
      if (input.edificacionId !== undefined
        && !tieneRol(ctx.usuario.roles, "propietario", "edificacion", input.edificacionId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No sos propietario de esa edificación" });
      }
      for (const p of input.partes) {
        if (p.monto <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "El monto debe ser mayor a cero" });
        if (p.medio === "transferencia" && p.comprobanteArchivoId === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La transferencia necesita comprobante" });
        }
      }

      const valor = input.partes.reduce((t, p) => t + p.monto, 0);
      const [res] = await ctx.db.insert(pagosSocio).values({
        propietarioId: ctx.usuario.id, socioId: input.socioId,
        edificacionId: input.edificacionId ?? null, periodo: input.periodo ?? null,
        fechaPago: input.fecha, valor: valor.toFixed(2), registradoPorId: ctx.usuario.id,
      });
      const pagoSocioId = Number((res as { insertId: number }).insertId);
      await ctx.db.insert(pagosSocioMedios).values(input.partes.map((p) => ({
        pagoSocioId, medio: p.medio, monto: p.monto.toFixed(2),
        comprobanteArchivoId: p.comprobanteArchivoId ?? null,
      })));
      return { pagoSocioId };
    }),

  /** Los pagos ya registrados a un socio, el más nuevo primero. */
  pagosDeSocio: privado
    .input(z.object({ socioId: z.number().int().positive(), edificacionId: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select({ id: pagosSocio.id, fechaPago: pagosSocio.fechaPago, valor: pagosSocio.valor, periodo: pagosSocio.periodo })
        .from(pagosSocio)
        .where(and(
          eq(pagosSocio.propietarioId, ctx.usuario.id), eq(pagosSocio.socioId, input.socioId),
          ...(input.edificacionId !== undefined ? [eq(pagosSocio.edificacionId, input.edificacionId)] : []),
        ))
        .orderBy(desc(pagosSocio.fechaPago))),

  /** Registra un ingreso o egreso a mano. */
  /**
   * Anota un movimiento a mano. Sobre una unidad, o sobre una edificación: en
   * ese caso se reparte entre sus unidades como elija quien lo registra.
   */
  registrar: privado
    .input(z.object({
      inmuebleId: z.number().int().positive().optional(),
      edificacionId: z.number().int().positive().optional(),
      prorrateo: z.enum(["partes_iguales", "por_area", "por_canon"]).optional(),
      tipoMovimientoId: z.number().int().positive(),
      monto: dinero,
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD"),
      nota: z.string().trim().max(255).optional(),
      /** Quién cobró, del catálogo: obligatorio en un gasto, no tiene sentido en un ingreso. */
      proveedorId: z.number().int().positive().optional(),
      /** Pendiente es lo que se sabe que hay que pagar, sin contar todavía en Mis Rendimientos. */
      estado: z.enum(["pendiente", "finalizado"]).default("finalizado"),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((input.inmuebleId === undefined) === (input.edificacionId === undefined)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí si el gasto es de una unidad o de la edificación" });
      }
      const puede = input.inmuebleId !== undefined
        ? tieneRol(ctx.usuario.roles, "propietario", "inmueble", input.inmuebleId)
        : puedeSobreEdificacion(ctx.usuario.roles, input.edificacionId!);
      if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
      if (input.edificacionId !== undefined && !input.prorrateo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Elegí cómo se reparte entre las unidades" });
      }
      if (input.monto <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "El monto debe ser mayor a cero" });

      const [tipo] = await ctx.db
        .select({ tipo: tiposMovimiento.tipo, activo: tiposMovimiento.activo })
        .from(tiposMovimiento)
        .where(eq(tiposMovimiento.id, input.tipoMovimientoId))
        .limit(1);

      if (!tipo) throw new TRPCError({ code: "NOT_FOUND", message: "Ese concepto no existe" });
      if (!tipo.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese concepto está anulado" });
      if (tipo.tipo === "egreso" && input.proveedorId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El gasto necesita a quién se le pagó" });
      }

      let proveedor: string | null = null;
      if (input.proveedorId !== undefined) {
        const [p] = await ctx.db.select({ razonSocial: proveedores.razonSocial, activo: proveedores.activo })
          .from(proveedores).where(eq(proveedores.id, input.proveedorId)).limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese proveedor no existe" });
        if (!p.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese proveedor está anulado" });
        proveedor = p.razonSocial;
      }

      // El signo lo da el concepto, no quien registra: si el monto pudiera ser
      // negativo, un mismo gasto entraría a veces como egreso y a veces como
      // ingreso en negativo, y los totales dejarían de cuadrar.
      const comunes = {
        tipo: tipo.tipo, estado: input.estado, tipoMovimientoId: input.tipoMovimientoId, fecha: input.fecha,
        origenTipo: "manual" as const, nota: input.nota ?? null,
        proveedor, proveedorId: input.proveedorId ?? null,
      };

      if (input.edificacionId !== undefined) {
        await ctx.db.transaction((tx) =>
          repartirEnEdificacion(tx, input.edificacionId!, input.prorrateo!, comunes, input.monto));
        return { movimientoId: null };
      }

      const [res] = await ctx.db.insert(movimientos).values({
        ...comunes, ambito: "unidad", inmuebleId: input.inmuebleId!, monto: input.monto.toFixed(2),
      });
      return { movimientoId: Number((res as { insertId: number }).insertId) };
    }),

  /**
   * Corrige un movimiento anotado a mano: no se toca el que nace de una
   * factura pagada —ese se corrige editando la factura— ni la parte de un
   * reparto, solo el gasto principal. Si cambia el monto o el reparto de uno
   * de edificación, se rehace entre las unidades.
   */
  editar: privado
    .input(z.object({
      movimientoId: z.number().int().positive(),
      tipoMovimientoId: z.number().int().positive().optional(),
      monto: dinero.optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD").optional(),
      nota: z.string().trim().max(255).optional(),
      proveedorId: z.number().int().positive().optional(),
      prorrateo: z.enum(["partes_iguales", "por_area", "por_canon"]).optional(),
      estado: z.enum(["pendiente", "finalizado"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [m] = await ctx.db
        .select({
          inmuebleId: movimientos.inmuebleId, edificacionId: movimientos.edificacionId,
          tipo: movimientos.tipo, estado: movimientos.estado, tipoMovimientoId: movimientos.tipoMovimientoId,
          monto: movimientos.monto, fecha: movimientos.fecha, nota: movimientos.nota,
          proveedor: movimientos.proveedor, proveedorId: movimientos.proveedorId,
          prorrateo: movimientos.prorrateo, origenTipo: movimientos.origenTipo,
          movimientoPadreId: movimientos.movimientoPadreId,
        })
        .from(movimientos).where(eq(movimientos.id, input.movimientoId)).limit(1);
      if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Ese movimiento no existe" });
      if (m.movimientoPadreId !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esa es la parte de un reparto: editá el gasto de la edificación, no esta unidad",
        });
      }
      if (m.origenTipo === "factura_propiedad") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ese gasto nace de una factura pagada: corregilo editando la factura, no el gasto",
        });
      }
      const puede = m.inmuebleId !== null
        ? tieneRol(ctx.usuario.roles, "propietario", "inmueble", m.inmuebleId)
        : m.edificacionId !== null && puedeSobreEdificacion(ctx.usuario.roles, m.edificacionId);
      if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });

      const monto = input.monto ?? Number(m.monto);
      if (monto <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "El monto debe ser mayor a cero" });

      let tipo = m.tipo;
      if (input.tipoMovimientoId !== undefined) {
        const [t] = await ctx.db.select({ tipo: tiposMovimiento.tipo, activo: tiposMovimiento.activo })
          .from(tiposMovimiento).where(eq(tiposMovimiento.id, input.tipoMovimientoId)).limit(1);
        if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Ese concepto no existe" });
        if (!t.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese concepto está anulado" });
        if (t.tipo !== m.tipo) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede cambiar un ingreso por un egreso, ni al revés" });
        }
        tipo = t.tipo;
      }

      let proveedor = m.proveedor;
      let proveedorId = m.proveedorId;
      if (input.proveedorId !== undefined) {
        const [p] = await ctx.db.select({ razonSocial: proveedores.razonSocial, activo: proveedores.activo })
          .from(proveedores).where(eq(proveedores.id, input.proveedorId)).limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese proveedor no existe" });
        if (!p.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese proveedor está anulado" });
        proveedor = p.razonSocial;
        proveedorId = input.proveedorId;
      }

      const comunes = {
        tipo, estado: input.estado ?? m.estado, tipoMovimientoId: input.tipoMovimientoId ?? m.tipoMovimientoId,
        fecha: input.fecha ?? String(m.fecha),
        origenTipo: "manual" as const,
        nota: input.nota !== undefined ? (input.nota || null) : m.nota,
        proveedor, proveedorId,
      };

      await ctx.db.transaction(async (tx) => {
        if (m.edificacionId !== null) {
          const reparto = input.prorrateo ?? (m.prorrateo === "ninguno" ? "partes_iguales" : m.prorrateo);
          await reRepartirEnEdificacion(tx, m.edificacionId!, reparto, comunes, monto, input.movimientoId);
        } else {
          await tx.update(movimientos).set({ ...comunes, monto: monto.toFixed(2) })
            .where(eq(movimientos.id, input.movimientoId));
        }
      });
      return { ok: true };
    }),
});
