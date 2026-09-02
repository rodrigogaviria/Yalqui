import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, privado, exigirRol } from "../trpc/base.js";
import {
  inmuebles, inmueblePropietarios, inmuebleEtiquetas, etiquetas, edificaciones,
  TIPOS_UNIDAD,
} from "../db/schema/inventario.js";
import { otorgarRol, ambitosCon } from "../auth/roles.js";
import { nuevoToken, expiraEn } from "../auth/tokens-enlace.js";
import { usuarios } from "../db/schema/identidad.js";
import { aplicaciones } from "../db/schema/demanda.js";
import { garantes } from "../db/schema/score.js";
import { contratos } from "../db/schema/contrato.js";

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
  /** Va en la cláusula de objeto del contrato. Sin ella el contrato sale con
   *  el marcador a la vista, que es preferible a un espacio en blanco. */
  matriculaInmobiliaria: z.string().trim().max(40).optional(),
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
        matriculaInmobiliaria: input.matriculaInmobiliaria ?? null,
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

  /**
   * Las edificaciones del usuario, sea como dueño o como administrador.
   *
   * Hacen falta para lo que se dirige al edificio y no a una unidad: un
   * comunicado de corte de agua, una incidencia en el ascensor.
   */
  misEdificaciones: privado.query(async ({ ctx }) => {
    const ids = [
      ...ambitosCon(ctx.usuario.roles, "propietario", "edificacion"),
      ...ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion"),
    ];
    if (ids.length === 0) return [];

    return ctx.db
      .select({
        id: edificaciones.id,
        nombre: edificaciones.nombre,
        direccion: edificaciones.direccion,
        ciudad: edificaciones.ciudad,
        numUnidades: edificaciones.numUnidades,
      })
      .from(edificaciones)
      .where(inArray(edificaciones.id, ids))
      .orderBy(asc(edificaciones.nombre));
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
      if (c.matriculaInmobiliaria !== undefined) set["matriculaInmobiliaria"] = c.matriculaInmobiliaria || null;

      await ctx.db.update(inmuebles).set(set).where(eq(inmuebles.id, input.inmuebleId));
      return { ok: true };
    }),

  /**
   * Quién vive o vivió en esta unidad.
   *
   * Sale de los contratos y no de un campo en la unidad: el inquilino es una
   * relación con fechas, no un atributo. Los anteriores se conservan porque
   * saber quién vivió antes importa para una referencia o un reclamo.
   */
  inquilinos: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const filas = await ctx.db
      .select({
        contratoId: contratos.id,
        numero: contratos.numero,
        estadoContrato: contratos.estado,
        canonMensual: contratos.canonMensual,
        fechaInicio: contratos.fechaInicio,
        fechaFin: contratos.fechaFin,
        usuarioId: usuarios.id,
        nombre: usuarios.nombre,
        apellido: usuarios.apellido,
        email: usuarios.email,
        telefono: usuarios.telefono,
        tipoDocumento: usuarios.tipoDocumento,
        numeroDocumento: usuarios.numeroDocumento,
        token: usuarios.activacionToken,
      })
      .from(contratos)
      .innerJoin(usuarios, eq(usuarios.id, contratos.inquilinoId))
      .where(eq(contratos.inmuebleId, input.inmuebleId))
      .orderBy(desc(contratos.fechaInicio));

    // Aprobado pero sin contrato todavía: ya hay alguien designado, y no
    // mostrarlo haría parecer que la unidad está alquilada sin nadie adentro.
    const designados = await ctx.db
      .select({
        aplicacionId: aplicaciones.id,
        usuarioId: usuarios.id,
        nombre: usuarios.nombre,
        apellido: usuarios.apellido,
        email: usuarios.email,
        telefono: usuarios.telefono,
        canonOfrecido: aplicaciones.canonOfrecido,
        token: usuarios.activacionToken,
      })
      .from(aplicaciones)
      .innerJoin(usuarios, eq(usuarios.id, aplicaciones.inquilinoId))
      .where(and(
        eq(aplicaciones.inmuebleId, input.inmuebleId),
        eq(aplicaciones.estado, "aprobada"),
      ))
      .orderBy(desc(aplicaciones.decididaAt));

    const idsAplicacion = designados.map((d) => d.aplicacionId);
    const codeudores = idsAplicacion.length === 0 ? [] : await ctx.db
      .select({
        aplicacionId: garantes.aplicacionId,
        nombre: garantes.nombre,
        email: garantes.email,
        telefono: garantes.telefono,
        numeroDocumento: garantes.numeroDocumento,
      })
      .from(garantes)
      .where(inArray(garantes.aplicacionId, idsAplicacion));

    const conContrato = new Set(filas.map((f) => f.usuarioId));
    /** Sigue sin activarse: la cuenta existe pero su dueño nunca entró. */
    const marcar = <T extends { token: string | null }>({ token, ...resto }: T) =>
      ({ ...resto, sinActivar: token !== null });

    return {
      actuales: filas
        .filter((f) => f.estadoContrato === "vigente" || f.estadoContrato === "en_mora")
        .map(marcar),
      anteriores: filas.filter((f) => f.estadoContrato === "terminado").map(marcar),
      designados: designados
        .filter((d) => !conContrato.has(d.usuarioId))
        .map((d) => ({
          ...marcar(d),
          codeudor: codeudores.find((c) => c.aplicacionId === d.aplicacionId) ?? null,
        })),
    };
  }),

  /**
   * Devuelve la unidad a disponible.
   *
   * No termina contratos: si hay uno vigente, la unidad no está libre por más
   * que alguien apriete un botón, y terminarlo tiene consecuencias —
   * liquidación, devolución, preaviso— que no caben en un cambio de estado.
   */
  liberar: delPropietario.input(soloId).mutation(async ({ ctx, input }) => {
    const [u] = await ctx.db
      .select({ estado: inmuebles.estado })
      .from(inmuebles)
      .where(eq(inmuebles.id, input.inmuebleId))
      .limit(1);

    if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });
    if (u.estado !== "arrendado") {
      throw new TRPCError({ code: "CONFLICT", message: "Esa unidad no está arrendada" });
    }

    const [vivo] = await ctx.db
      .select({ numero: contratos.numero })
      .from(contratos)
      .where(and(
        eq(contratos.inmuebleId, input.inmuebleId),
        inArray(contratos.estado, ["vigente", "en_mora", "pendiente_firma"]),
      ))
      .limit(1);

    if (vivo) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `El contrato ${vivo.numero} sigue en pie. Terminalo antes de liberar la unidad.`,
      });
    }

    await ctx.db.update(inmuebles).set({ estado: "borrador" })
      .where(eq(inmuebles.id, input.inmuebleId));

    return { estado: "borrador" as const };
  }),

  /**
   * Marca la unidad como alquilada y registra al inquilino.
   *
   * Es el camino directo, para cuando el propietario ya consiguió inquilino por
   * fuera: se salta visita, precalificación y aplicación del candidato. Pero no
   * abre una segunda vía por el sistema — deja una aplicación aprobada, que es
   * de donde `contratos.generar` toma los datos. Un solo camino hasta el
   * contrato, con dos entradas.
   *
   * Si el inquilino no tenía cuenta, se le crea una SIN contraseña usable y con
   * un enlace de activación. Que el propietario eligiera la clave le daría
   * acceso a la cuenta de la otra parte, y sería su palabra contra la de ella
   * sobre quién firmó el contrato.
   */
  marcarAlquilado: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      email: z.string().trim().toLowerCase().email().max(191),
      nombre: z.string().trim().min(1).max(120),
      apellido: z.string().trim().min(1).max(120),
      tipoDocumento: z.enum(["CC", "CE", "NIT", "PA"]),
      numeroDocumento: z.string().trim().min(4).max(40),
      telefono: z.string().trim().max(30).optional(),
      /** Lo que efectivamente acordaron. Por defecto, el canon de la unidad. */
      canonAcordado: dinero.optional(),
      /** Meses de plazo. Se guarda en la aplicación y lo hereda el contrato. */
      mesesPlazo: z.number().int().min(1).max(120).default(12),
      numOcupantes: z.number().int().min(1).max(50).default(1),
      numMascotas: z.number().int().min(0).max(20).default(0),
      fechaIngreso: z.coerce.date().optional(),
      /**
       * El codeudor, si lo hay.
       *
       * No se le crea cuenta: no va a usar la aplicación, solo responde por la
       * deuda. Sus datos quedan en `garantes` y pasan al contrato al generarlo.
       */
      codeudor: z.object({
        nombre: z.string().trim().min(3).max(191),
        tipoDocumento: z.enum(["CC", "CE", "NIT", "PA"]).default("CC"),
        numeroDocumento: z.string().trim().min(4).max(40),
        email: z.string().trim().toLowerCase().email().max(191),
        telefono: z.string().trim().max(30).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [u] = await ctx.db
        .select({ estado: inmuebles.estado, canonBase: inmuebles.canonBase })
        .from(inmuebles)
        .where(eq(inmuebles.id, input.inmuebleId))
        .limit(1);

      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });
      if (u.estado === "arrendado") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa unidad ya está arrendada" });
      }

      const [existente] = await ctx.db
        .select({ id: usuarios.id, nombre: usuarios.nombre, estado: usuarios.estado })
        .from(usuarios)
        .where(eq(usuarios.email, input.email))
        .limit(1);

      // El documento es la otra llave única de `usuarios`. Sin comprobarlo, un
      // documento repetido llegaba a la pantalla como un volcado de SQL con la
      // consulta y sus parámetros adentro.
      if (!existente) {
        const [porDocumento] = await ctx.db
          .select({ email: usuarios.email })
          .from(usuarios)
          .where(and(
            eq(usuarios.tipoDocumento, input.tipoDocumento),
            eq(usuarios.numeroDocumento, input.numeroDocumento),
          ))
          .limit(1);

        if (porDocumento) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Ya hay una cuenta con ${input.tipoDocumento} ${input.numeroDocumento}, a nombre de ${porDocumento.email}. Registrá al inquilino con ese correo.`,
          });
        }
      }

      if (existente?.id === ctx.usuario.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No podés registrarte a vos mismo como inquilino de tu unidad",
        });
      }

      const { token, hash } = nuevoToken();
      const canon = input.canonAcordado ?? Number(u.canonBase);

      const resultado = await ctx.db.transaction(async (tx) => {
        let inquilinoId: number;
        let cuentaNueva = false;

        if (existente) {
          inquilinoId = existente.id;
        } else {
          // El hash es un valor que ningún scrypt puede producir, así que
          // `verificarContrasena` siempre falla contra él: la cuenta existe
          // pero nadie puede entrar hasta activarla.
          const [res] = await tx.insert(usuarios).values({
            email: input.email,
            passwordHash: "sin-contrasena",
            activacionToken: hash,
            activacionExpiraAt: expiraEn(168),
            creadaPorId: ctx.usuario.id,
            nombre: input.nombre,
            apellido: input.apellido,
            telefono: input.telefono ?? null,
            tipoDocumento: input.tipoDocumento,
            numeroDocumento: input.numeroDocumento,
            estado: "pendiente",
          });
          inquilinoId = Number((res as { insertId: number }).insertId);
          cuentaNueva = true;
        }

        // La aplicación nace aprobada: el propietario ya decidió, y decirlo de
        // otra forma lo obligaría a aprobarse a sí mismo en la pantalla
        // siguiente.
        const [ap] = await tx.insert(aplicaciones).values({
          inmuebleId: input.inmuebleId,
          inquilinoId,
          estado: "aprobada",
          canonOfrecido: canon.toFixed(2),
          numOcupantes: input.numOcupantes,
          numMascotas: input.numMascotas,
          fechaIngresoDeseada: input.fechaIngreso ?? null,
          enviadaAt: new Date(),
          decididaAt: new Date(),
          mensaje: `Registrado directamente por el propietario · ${input.mesesPlazo} meses`,
        });
        const aplicacionId = Number((ap as { insertId: number }).insertId);

        if (input.codeudor !== undefined) {
          await tx.insert(garantes).values({
            aplicacionId,
            tipo: "codeudor",
            nombre: input.codeudor.nombre,
            tipoDocumento: input.codeudor.tipoDocumento,
            numeroDocumento: input.codeudor.numeroDocumento,
            email: input.codeudor.email,
            telefono: input.codeudor.telefono ?? null,
          });
        }

        await tx.update(inmuebles)
          .set({ estado: "arrendado" })
          .where(eq(inmuebles.id, input.inmuebleId));

        return { inquilinoId, cuentaNueva, aplicacionId };
      });

      return {
        ...resultado,
        canon,
        mesesPlazo: input.mesesPlazo,
        /** Solo cuando la cuenta es nueva. Es la única vez que se ve el token:
         *  en la base queda su hash, igual que una contraseña. */
        enlaceActivacion: resultado.cuentaNueva ? `/activar?t=${token}` : null,
      };
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
