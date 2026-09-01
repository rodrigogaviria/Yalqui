import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, exigirRol } from "../trpc/base.js";
import { inmuebles, catalogoAjustes, inmuebleAjustes } from "../db/schema/inventario.js";
import { requisitos, requisitoDocumentos, tiposDocumento, inmuebleRequisitos } from "../db/schema/administracion.js";

const soloId = z.object({ inmuebleId: z.number().int().positive() });
const dinero = z.number().min(0).max(99_999_999);

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

/**
 * Lo que el propietario decide sobre su propia unidad: cuánto vale, qué cobra
 * aparte del canon y qué le exige a quien quiera arrendar.
 *
 * Se apoya en los catálogos que administra Yalqui, pero cada precio y cada
 * exigencia es de esta unidad. El catálogo dice qué es posible; esto dice qué
 * eligió este propietario.
 */
export const configuracionRouter = router({
  /**
   * El canon armado: base, administración y los servicios que van obligatorios.
   *
   * Los opcionales no entran en el total porque todavía no se sabe si el
   * inquilino los va a tomar; se muestran aparte para que se vea el techo.
   */
  canon: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const [u] = await ctx.db
      .select({
        canonBase: inmuebles.canonBase,
        valorAdministracion: inmuebles.valorAdministracion,
        administracionIncluida: inmuebles.administracionIncluida,
      })
      .from(inmuebles)
      .where(eq(inmuebles.id, input.inmuebleId))
      .limit(1);

    if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });

    const elegidos = await ctx.db
      .select({
        nombre: catalogoAjustes.nombre,
        tipoCalculo: catalogoAjustes.tipoCalculo,
        obligatorio: inmuebleAjustes.obligatorio,
        valor: inmuebleAjustes.valor,
        porcentaje: inmuebleAjustes.porcentaje,
        cantidadMaxima: inmuebleAjustes.cantidadMaxima,
      })
      .from(inmuebleAjustes)
      .innerJoin(catalogoAjustes, eq(catalogoAjustes.id, inmuebleAjustes.ajusteId))
      .where(and(
        eq(inmuebleAjustes.inmuebleId, input.inmuebleId),
        eq(inmuebleAjustes.disponible, true),
      ))
      .orderBy(asc(catalogoAjustes.orden));

    const base = Number(u.canonBase);
    const administracion = Number(u.valorAdministracion);

    // Un porcentaje se calcula sobre el canon base, nunca sobre el total: si se
    // aplicara sobre el acumulado, el orden en que se sumen los ajustes
    // cambiaría el precio final.
    const valorDe = (a: (typeof elegidos)[number]) =>
      a.tipoCalculo === "porcentaje"
        ? base * (Number(a.porcentaje ?? 0) / 100)
        : Number(a.valor) * (a.tipoCalculo === "por_cantidad" ? (a.cantidadMaxima ?? 1) : 1);

    const obligatorios = elegidos.filter((a) => a.obligatorio);
    const opcionales = elegidos.filter((a) => !a.obligatorio);

    const sumaObligatorios = obligatorios.reduce((t, a) => t + valorDe(a), 0);
    const sumaOpcionales = opcionales.reduce((t, a) => t + valorDe(a), 0);

    // La administración incluida ya está dentro del canon: sumarla otra vez la
    // cobraría dos veces.
    const desdeElMes = base + sumaObligatorios + (u.administracionIncluida ? 0 : administracion);

    return {
      base,
      administracion,
      administracionIncluida: u.administracionIncluida,
      obligatorios: obligatorios.map((a) => ({ nombre: a.nombre, valor: valorDe(a) })),
      opcionales: opcionales.map((a) => ({ nombre: a.nombre, valor: valorDe(a) })),
      sumaObligatorios,
      sumaOpcionales,
      desdeElMes,
      hastaElMes: desdeElMes + sumaOpcionales,
    };
  }),

  /** El catálogo completo, con lo que esta unidad ya configuró de cada ítem. */
  ajustes: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const filas = await ctx.db
      .select({
        ajusteId: catalogoAjustes.id,
        codigo: catalogoAjustes.codigo,
        nombre: catalogoAjustes.nombre,
        descripcion: catalogoAjustes.descripcion,
        categoria: catalogoAjustes.categoria,
        tipoCalculo: catalogoAjustes.tipoCalculo,
        periodicidad: catalogoAjustes.periodicidad,
        permiteCantidad: catalogoAjustes.permiteCantidad,
        valorSugerido: catalogoAjustes.valorSugerido,
        disponible: inmuebleAjustes.disponible,
        valor: inmuebleAjustes.valor,
        porcentaje: inmuebleAjustes.porcentaje,
        cantidadMaxima: inmuebleAjustes.cantidadMaxima,
        obligatorio: inmuebleAjustes.obligatorio,
      })
      .from(catalogoAjustes)
      // LEFT JOIN y no INNER: se listan todos los servicios del catálogo, estén
      // configurados o no. Si solo se trajeran los configurados, el propietario
      // no tendría cómo descubrir los que todavía no ofrece.
      .leftJoin(inmuebleAjustes, and(
        eq(inmuebleAjustes.ajusteId, catalogoAjustes.id),
        eq(inmuebleAjustes.inmuebleId, input.inmuebleId),
      ))
      .where(eq(catalogoAjustes.activo, true))
      .orderBy(asc(catalogoAjustes.orden), asc(catalogoAjustes.nombre));

    return filas.map((f) => ({
      ...f,
      disponible: f.disponible ?? false,
      obligatorio: f.obligatorio ?? false,
    }));
  }),

  /** Enciende, apaga o repreciar un servicio adicional de esta unidad. */
  configurarAjuste: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      ajusteId: z.number().int().positive(),
      disponible: z.boolean(),
      valor: dinero.optional(),
      porcentaje: z.number().min(0).max(100).optional(),
      cantidadMaxima: z.number().int().min(1).max(20).optional(),
      /** Obligatorio entra en el canon; opcional lo elige el inquilino. */
      obligatorio: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ajuste] = await ctx.db
        .select({ tipoCalculo: catalogoAjustes.tipoCalculo, activo: catalogoAjustes.activo })
        .from(catalogoAjustes)
        .where(eq(catalogoAjustes.id, input.ajusteId))
        .limit(1);

      if (!ajuste) throw new TRPCError({ code: "NOT_FOUND", message: "Ese servicio no existe" });
      if (!ajuste.activo) {
        throw new TRPCError({ code: "CONFLICT", message: "Ese servicio está anulado" });
      }

      // Ofrecer algo sin decir cuánto cuesta deja al inquilino sin saber qué va
      // a pagar. Apagarlo, en cambio, no necesita precio.
      if (input.disponible) {
        const tienePrecio = ajuste.tipoCalculo === "porcentaje"
          ? input.porcentaje !== undefined && input.porcentaje > 0
          : input.valor !== undefined && input.valor > 0;

        if (!tienePrecio) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Poné el valor antes de ofrecer el servicio",
          });
        }
      }

      const valores = {
        disponible: input.disponible,
        // `valor` es NOT NULL en la tabla: sin precio va en cero, que es lo que
        // corresponde a un servicio apagado o a uno cobrado por porcentaje.
        valor: input.valor?.toFixed(2) ?? "0.00",
        porcentaje: input.porcentaje?.toFixed(3) ?? null,
        cantidadMaxima: input.cantidadMaxima ?? null,
        obligatorio: input.obligatorio,
      };

      await ctx.db
        .insert(inmuebleAjustes)
        .values({ inmuebleId: input.inmuebleId, ajusteId: input.ajusteId, ...valores })
        .onDuplicateKeyUpdate({ set: valores });

      return { ok: true };
    }),

  /**
   * Lo que este propietario le exige a quien quiera arrendar la unidad.
   *
   * Solo inquilino y codeudor. Los requisitos con ámbito `propietario` o
   * `proveedor` son los que Yalqui le exige a ellos, no los que ellos exigen:
   * mostrarlos acá sería preguntarle al propietario si quiere pedirse a sí
   * mismo el certificado de libertad.
   *
   * Sin fila propia manda el catálogo, así que un requisito que Yalqui agregue
   * mañana aplica solo a todas las unidades sin recorrerlas una por una.
   */
  requisitos: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const filas = await ctx.db
      .select({
        requisitoId: requisitos.id,
        nombre: requisitos.nombre,
        descripcion: requisitos.descripcion,
        aplicaA: requisitos.aplicaA,
        modo: requisitos.modo,
        pordefecto: requisitos.obligatorio,
        exigidoPropio: inmuebleRequisitos.exigido,
        nota: inmuebleRequisitos.nota,
      })
      .from(requisitos)
      .leftJoin(inmuebleRequisitos, and(
        eq(inmuebleRequisitos.requisitoId, requisitos.id),
        eq(inmuebleRequisitos.inmuebleId, input.inmuebleId),
      ))
      .where(and(
        eq(requisitos.activo, true),
        inArray(requisitos.aplicaA, ["inquilino", "codeudor"]),
      ))
      .orderBy(asc(requisitos.aplicaA), asc(requisitos.orden));

    const documentos = await ctx.db
      .select({
        requisitoId: requisitoDocumentos.requisitoId,
        documento: tiposDocumento.nombre,
      })
      .from(requisitoDocumentos)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, requisitoDocumentos.tipoDocumentoId))
      .where(eq(tiposDocumento.activo, true))
      .orderBy(asc(requisitoDocumentos.orden));

    return filas.map((r) => ({
      requisitoId: r.requisitoId,
      nombre: r.nombre,
      descripcion: r.descripcion,
      aplicaA: r.aplicaA,
      modo: r.modo,
      exigido: r.exigidoPropio ?? r.pordefecto,
      /** `true` cuando este propietario se apartó del valor por defecto. */
      personalizado: r.exigidoPropio !== null,
      nota: r.nota,
      documentos: documentos.filter((d) => d.requisitoId === r.requisitoId).map((d) => d.documento),
    }));
  }),

  configurarRequisito: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      requisitoId: z.number().int().positive(),
      exigido: z.boolean(),
      nota: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db
        .select({
          obligatorio: requisitos.obligatorio,
          activo: requisitos.activo,
          nombre: requisitos.nombre,
          aplicaA: requisitos.aplicaA,
        })
        .from(requisitos)
        .where(eq(requisitos.id, input.requisitoId))
        .limit(1);

      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Ese requisito no existe" });
      if (!r.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese requisito está anulado" });

      // El mismo límite que la lectura: un requisito dirigido al propietario o
      // al proveedor no es suyo para decidir.
      if (r.aplicaA !== "inquilino" && r.aplicaA !== "codeudor") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Ese requisito no lo define el propietario",
        });
      }

      // Un requisito obligatorio de Yalqui no se puede levantar: verificar la
      // identidad de quien va a vivir en el inmueble no es una preferencia del
      // propietario. Endurecer sí se puede siempre.
      if (r.obligatorio && !input.exigido) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `«${r.nombre}» es obligatorio y no se puede quitar`,
        });
      }

      const valores = { exigido: input.exigido, nota: input.nota ?? null };
      await ctx.db
        .insert(inmuebleRequisitos)
        .values({ inmuebleId: input.inmuebleId, requisitoId: input.requisitoId, ...valores })
        .onDuplicateKeyUpdate({ set: valores });

      return { ok: true };
    }),
});
