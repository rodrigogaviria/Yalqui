import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { enLetras, enPesos, fechaLarga, renderizar } from "./plantilla.js";
import { garantes } from "../db/schema/score.js";
import { TRPCError } from "@trpc/server";
import { router, publico, privado, exigirRol } from "../trpc/base.js";
import { contratos, contratoAjustes, contratoFirmas, plantillasContrato } from "../db/schema/contrato.js";
import { aplicaciones, aplicacionAjustes } from "../db/schema/demanda.js";
import { inmuebles, inmueblePropietarios } from "../db/schema/inventario.js";
import { usuarios } from "../db/schema/identidad.js";
import { nuevoToken, hashToken, expiraEn } from "../auth/tokens-enlace.js";
import { otorgarRol } from "../auth/roles.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

/** El marco legal sale del tipo de unidad, no de una elección. Vivienda urbana
 *  se rige por la Ley 820; local comercial por el Código de Comercio, y son
 *  reglas distintas de renovación, incremento y terminación. */
function marcoLegalDe(tipo: string): "vivienda_urbana" | "comercial" | "habitacion" | "parqueadero" {
  if (tipo === "local" || tipo === "oficina" || tipo === "bodega") return "comercial";
  if (tipo === "habitacion") return "habitacion";
  if (tipo === "parqueadero") return "parqueadero";
  return "vivienda_urbana";
}

export const contratosRouter = router({
  /**
   * Genera el contrato desde la aplicación aprobada.
   *
   * Copia los ajustes pactados congelando su precio: si el propietario sube el
   * parqueadero el mes que viene, este contrato no se mueve. Y arma la lista de
   * firmantes desde el título — un contrato firmado por uno de tres dueños
   * registrados es el problema que aparece justo cuando hay que desalojar.
   */
  generar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      aplicacionId: z.number().int().positive(),
      fechaInicio: z.coerce.date(),
      mesesPlazo: z.number().int().min(1).max(120).default(12),
      diaPago: z.number().int().min(1).max(28).default(5),
      incrementoTipo: z.enum(["ipc", "ipc_mas_puntos", "fijo", "ninguno"]).default("ipc"),
      garantiaTipo: z.enum(["codeudor", "poliza", "fiador", "deposito", "ninguna"]).default("ninguna"),
      /** Cómo y a dónde se paga. Va literal en la cláusula de canon. */
      medioPago: z.string().trim().max(255).optional(),
      /** Penalidad por daños en la restitución, distinta del depósito. */
      penalidadDanos: z.number().min(0).max(99_999_999).default(0),
      /** Qué queda incluido en el canon. Cambia la cláusula de servicios. */
      serviciosIncluidos: z.string().trim().max(1000).optional(),
      admiteMascotas: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ap] = await ctx.db.select().from(aplicaciones)
        .where(and(eq(aplicaciones.id, input.aplicacionId),
                   eq(aplicaciones.inmuebleId, input.inmuebleId))).limit(1);
      if (!ap) throw new TRPCError({ code: "NOT_FOUND", message: "Esa aplicación no es de esta unidad" });
      if (ap.estado !== "aprobada") {
        throw new TRPCError({ code: "CONFLICT", message: "Primero hay que aprobar la aplicación" });
      }

      const [u] = await ctx.db.select().from(inmuebles).where(eq(inmuebles.id, input.inmuebleId)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });

      const marco = marcoLegalDe(u.tipo);

      // En vivienda urbana la Ley 820 prohíbe exigir depósito en dinero, y el
      // incremento está topado al IPC. El sistema no debería ofrecer por
      // defecto una cláusula que no debería ir.
      if (marco === "vivienda_urbana") {
        if (input.garantiaTipo === "deposito") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "En vivienda urbana no se puede exigir depósito en dinero. Usá codeudor, fiador o póliza.",
          });
        }
        if (input.incrementoTipo === "ipc_mas_puntos") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "En vivienda urbana el incremento está topado al IPC del año anterior.",
          });
        }
      }

      // Ordenado por versión: si por lo que sea quedaran dos vigentes para el
      // mismo marco, gana la más nueva en vez de la que devuelva primero la
      // base. Un contrato no debería depender del orden de un SELECT.
      const [plantilla] = await ctx.db.select().from(plantillasContrato)
        .where(and(eq(plantillasContrato.marcoLegal, marco),
                   eq(plantillasContrato.estado, "vigente")))
        .orderBy(desc(plantillasContrato.version))
        .limit(1);
      if (!plantilla) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No hay plantilla vigente para ${marco.replace("_", " ")}`,
        });
      }

      const ajustes = await ctx.db.select().from(aplicacionAjustes)
        .where(eq(aplicacionAjustes.aplicacionId, input.aplicacionId));

      // Los del título firman todos.
      const duenos = await ctx.db
        .select({ usuarioId: inmueblePropietarios.usuarioId, rol: inmueblePropietarios.rol,
                  nombre: usuarios.nombre, apellido: usuarios.apellido,
                  documento: usuarios.numeroDocumento, telefono: usuarios.telefono,
                  email: usuarios.email })
        .from(inmueblePropietarios)
        .innerJoin(usuarios, eq(usuarios.id, inmueblePropietarios.usuarioId))
        .where(and(eq(inmueblePropietarios.inmuebleId, input.inmuebleId),
                   eq(inmueblePropietarios.apareceEnTitulo, true)));

      const [inq] = await ctx.db.select({
        nombre: usuarios.nombre, apellido: usuarios.apellido,
        documento: usuarios.numeroDocumento, telefono: usuarios.telefono,
        email: usuarios.email,
      }).from(usuarios).where(eq(usuarios.id, ap.inquilinoId)).limit(1);
      if (!inq) throw new TRPCError({ code: "NOT_FOUND", message: "El inquilino no existe" });

      const fin = new Date(input.fechaInicio);
      fin.setMonth(fin.getMonth() + input.mesesPlazo);

      // El codeudor sale de la aplicación: se registró al marcar la unidad como
      // alquilada, o al aplicar el candidato.
      const [codeudor] = await ctx.db
        .select({
          nombre: garantes.nombre,
          documento: garantes.numeroDocumento,
          telefono: garantes.telefono,
          email: garantes.email,
        })
        .from(garantes)
        .where(and(eq(garantes.aplicacionId, ap.id), eq(garantes.tipo, "codeudor")))
        .limit(1);

      const dueno = duenos[0];
      const canon = Number(ap.canonOfrecido);
      const nombreInquilino = `${inq.nombre} ${inq.apellido}`.toUpperCase();
      const nombreDueno = dueno === undefined ? null : `${dueno.nombre} ${dueno.apellido}`.toUpperCase();

      /**
       * Las cláusulas que cambian de forma y no solo de valor.
       *
       * Sin codeudor, la cláusula no debe quedar con el espacio en blanco: debe
       * decir otra cosa. Un contrato con «tiene como coarrendatario a ____» es
       * peor que uno que declara que no hay codeudor.
       */
      const clausulaCoarrendatario = codeudor === undefined
        ? "Las Partes acuerdan que este Contrato no cuenta con coarrendatario ni codeudor solidario."
        : `Para garantizar al Arrendador el cumplimiento de las obligaciones a cargo del Arrendatario, `
          + `el Arrendatario tiene como coarrendatario a ${codeudor.nombre.toUpperCase()}, de nacionalidad `
          + `colombiana, identificado con la Cédula de Ciudadanía número ${codeudor.documento ?? "—"}, `
          + `celular ${codeudor.telefono ?? "—"}, correo electrónico ${codeudor.email ?? "—"}, quien para `
          + `efectos de este Contrato de arrendamiento, en nombre propio, declara que se obliga de manera `
          + `solidaria con el Arrendatario y frente al Arrendador durante el término de duración de este `
          + `Contrato y hasta que el Inmueble sea devuelto al Arrendador a su entera satisfacción.`;

      const clausulaInquilinos = codeudor === undefined
        ? `El inmueble será habitado por ${nombreInquilino}, identificado con CC ${inq.documento}.`
        : `El inmueble será habitado por ${nombreInquilino}, identificado con CC ${inq.documento}, `
          + `y por ${codeudor.nombre.toUpperCase()}, identificado con CC ${codeudor.documento ?? "—"}.`;

      const firmaCoarrendatario = codeudor === undefined ? "" :
        `\nEl Coarrendatario:\n___________________________________\n`
        + `${codeudor.nombre.toUpperCase()}\nCC ${codeudor.documento ?? "—"}\n`
        + `Celular: ${codeudor.telefono ?? "—"}\nCorreo: ${codeudor.email ?? "—"}\n`;

      const { texto, faltantes } = renderizar(plantilla.cuerpo, {
        inmueble: `${u.tipo} en ${u.direccion}${u.complemento ? `, ${u.complemento}` : ""}`,
        matricula: u.matriculaInmobiliaria,
        direccion: u.direccion,
        barrio: u.barrio,
        ciudad: u.ciudad,
        area: u.areaConstruidaM2,

        arrendador: nombreDueno,
        documento_arrendador: dueno?.documento,
        ciudad_arrendador: u.ciudad,
        celular_arrendador: dueno?.telefono,
        email_arrendador: dueno?.email,

        arrendatario: nombreInquilino,
        documento_arrendatario: inq.documento,
        celular_arrendatario: inq.telefono,
        email_arrendatario: inq.email,

        canon: enPesos(canon),
        canon_letras: enLetras(canon),
        dia_pago: String(input.diaPago),
        medio_pago: input.medioPago ?? "la cuenta bancaria que el Arrendador indique",
        incremento: input.incrementoTipo === "ninguno"
          ? "cero por ciento"
          : "el IPC del año calendario inmediatamente anterior",

        meses: String(input.mesesPlazo),
        fecha_inicio: fechaLarga(input.fechaInicio),
        fecha_fin: fechaLarga(fin),
        fecha_entrega: fechaLarga(input.fechaInicio),
        fecha_firma: fechaLarga(new Date()),

        penalidad: enPesos(input.penalidadDanos ?? 0),
        penalidad_letras: enLetras(input.penalidadDanos ?? 0),

        servicios: input.serviciosIncluidos
          ?? "Los servicios públicos domiciliarios corren por cuenta del Arrendatario.",
        mascotas: input.admiteMascotas
          ? "Se permite la tenencia de animales domésticos conforme al reglamento de la copropiedad."
          : "El Arrendatario se abstendrá de guardar o permitir que dentro del Inmueble se guarden semovientes o animales domésticos.",

        clausula_coarrendatario: clausulaCoarrendatario,
        clausula_inquilinos: clausulaInquilinos,
        notificacion_coarrendatario: codeudor === undefined
          ? ""
          : `y el Coarrendatario, correo electrónico ${codeudor.email ?? "—"}.`,
        firma_coarrendatario: firmaCoarrendatario,
      });

      const uuid = randomUUID();
      const numero = `YQ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      const contratoId = await ctx.db.transaction(async (tx) => {
        const [res] = await tx.insert(contratos).values({
          uuid, numero,
          inmuebleId: input.inmuebleId,
          propietarioId: u.propietarioId,
          inquilinoId: ap.inquilinoId,
          aplicacionId: ap.id,
          plantillaId: plantilla.id,
          plantillaVersion: plantilla.version,
          // El texto queda congelado. Recalcularlo después daría un documento
          // distinto del que se firmó cada vez que alguien corrigiera un dato.
          texto,
          estado: "borrador",
          fechaInicio: input.fechaInicio,
          fechaFin: fin,
          mesesPlazo: input.mesesPlazo,
          canonMensual: u.canonBase,
          valorAdministracion: u.valorAdministracion,
          administracionIncluida: u.administracionIncluida,
          diaPago: input.diaPago,
          garantiaTipo: input.garantiaTipo,
          regimenIva: marco === "comercial" ? "gravado" : "excluido",
          tarifaIva: marco === "comercial" ? "19.00" : "0.00",
          incrementoTipo: input.incrementoTipo,
        });
        const id = Number((res as { insertId: number }).insertId);

        if (ajustes.length > 0) {
          await tx.insert(contratoAjustes).values(ajustes.map((a) => ({
            contratoId: id, ajusteId: a.ajusteId, cantidad: a.cantidad,
            valorUnitario: a.valorUnitario, valorTotal: a.valorTotal,
            periodicidad: "mensual" as const, vigenteDesde: input.fechaInicio,
          })));
        }

        const firmantes = [
          ...duenos.map((d, i) => ({
            contratoId: id,
            rolFirma: d.rol === "principal" ? ("propietario" as const) : ("socio_propietario" as const),
            usuarioId: d.usuarioId, nombre: `${d.nombre} ${d.apellido}`,
            numeroDocumento: d.documento, telefono: d.telefono, orden: i + 1,
            estado: "pendiente" as const,
          })),
          {
            contratoId: id, rolFirma: "inquilino" as const, usuarioId: ap.inquilinoId,
            nombre: `${inq.nombre} ${inq.apellido}`, numeroDocumento: inq.documento,
            telefono: inq.telefono, orden: duenos.length + 1, estado: "pendiente" as const,
          },
        ];
        await tx.insert(contratoFirmas).values(firmantes);

        await tx.update(aplicaciones).set({ contratoId: id }).where(eq(aplicaciones.id, ap.id));
        return id;
      });

      const canonTotal = Number(u.canonBase) + ajustes.reduce((t, a) => t + Number(a.valorTotal), 0);
      return {
        contratoId, numero, marcoLegal: marco,
        plantilla: plantilla.nombre,
        canonMensual: canonTotal,
        firmantes: duenos.length + 1,
        /** Marcadores que quedaron sin dato. El texto los conserva a la vista
         *  para que se note qué falta antes de mandarlo a firmar. */
        faltantes,
      };
    }),

  /**
   * Manda cada contrato a firmar. Un enlace por persona: único, de un solo uso
   * y con vencimiento, para que nadie pueda firmar por otro.
   */
  enviarAFirmar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      contratoId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await ctx.db.select({ estado: contratos.estado, inmuebleId: contratos.inmuebleId })
        .from(contratos).where(eq(contratos.id, input.contratoId)).limit(1);
      if (!c || c.inmuebleId !== input.inmuebleId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese contrato no es de esta unidad" });
      }
      if (c.estado !== "borrador" && c.estado !== "pendiente_firma") {
        throw new TRPCError({ code: "CONFLICT", message: "Ese contrato ya no admite firmas" });
      }

      const pendientes = await ctx.db.select().from(contratoFirmas)
        .where(and(eq(contratoFirmas.contratoId, input.contratoId),
                   eq(contratoFirmas.estado, "pendiente")));

      const enlaces: { nombre: string; enlace: string }[] = [];
      for (const f of pendientes) {
        const { token, hash } = nuevoToken();
        await ctx.db.update(contratoFirmas).set({
          tokenFirma: hash, tokenExpiraAt: expiraEn(72),
          enviadoAt: new Date(), estado: "enviado",
        }).where(eq(contratoFirmas.id, f.id));
        enlaces.push({ nombre: f.nombre, enlace: `/firmar/${token}` });
      }

      await ctx.db.update(contratos).set({ estado: "pendiente_firma" })
        .where(eq(contratos.id, input.contratoId));

      return { enviados: enlaces.length, enlaces };
    }),

  /** Lo que ve el firmante al abrir su enlace. Sin sesión. */
  verParaFirmar: publico
    .input(z.object({ token: z.string().min(20).max(64) }))
    .query(async ({ ctx, input }) => {
      const [f] = await ctx.db
        .select({
          firmaId: contratoFirmas.id, nombre: contratoFirmas.nombre,
          rolFirma: contratoFirmas.rolFirma, estado: contratoFirmas.estado,
          expira: contratoFirmas.tokenExpiraAt,
          numero: contratos.numero, canonMensual: contratos.canonMensual,
          valorAdministracion: contratos.valorAdministracion, diaPago: contratos.diaPago,
          fechaInicio: contratos.fechaInicio, mesesPlazo: contratos.mesesPlazo,
          incrementoTipo: contratos.incrementoTipo,
          direccion: inmuebles.direccion, ciudad: inmuebles.ciudad,
        })
        .from(contratoFirmas)
        .innerJoin(contratos, eq(contratos.id, contratoFirmas.contratoId))
        .innerJoin(inmuebles, eq(inmuebles.id, contratos.inmuebleId))
        .where(eq(contratoFirmas.tokenFirma, hashToken(input.token)))
        .limit(1);

      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });
      if (f.expira && f.expira < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ese enlace ya venció. Pedile uno nuevo al arrendador." });
      }

      await ctx.db.update(contratoFirmas)
        .set({ vistoAt: new Date(), estado: f.estado === "enviado" ? "visto" : f.estado })
        .where(eq(contratoFirmas.id, f.firmaId));

      return f;
    }),

  /**
   * Firma. Queda la evidencia que hace defendible la firma electrónica: IP,
   * dispositivo, hora y el hash del documento exacto que se mostró.
   */
  firmar: publico
    .input(z.object({
      token: z.string().min(20).max(64),
      aceptaCondiciones: z.literal(true, { message: "Hay que aceptar las condiciones para firmar" }),
    }))
    .mutation(async ({ ctx, input }) => {
      const [f] = await ctx.db.select().from(contratoFirmas)
        .where(eq(contratoFirmas.tokenFirma, hashToken(input.token))).limit(1);

      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Ese enlace no existe" });
      if (f.tokenExpiraAt && f.tokenExpiraAt < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ese enlace ya venció" });
      }
      if (f.estado === "firmado") {
        throw new TRPCError({ code: "CONFLICT", message: "Ya habías firmado" });
      }

      const [c] = await ctx.db.select().from(contratos)
        .where(eq(contratos.id, f.contratoId)).limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "El contrato no existe" });

      const hashDoc = createHash("sha256")
        .update(JSON.stringify({
          numero: c.numero, canon: c.canonMensual, inicio: c.fechaInicio,
          meses: c.mesesPlazo, plantilla: `${c.plantillaId}v${c.plantillaVersion}`,
        }))
        .digest("hex");

      await ctx.db.update(contratoFirmas).set({
        estado: "firmado", firmadoAt: new Date(),
        ip: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 255) ?? null,
        // El token es de un solo uso: se quema al firmar.
        tokenFirma: null,
        evidencia: { hashDocumento: hashDoc, firmadoEn: new Date().toISOString() },
      }).where(eq(contratoFirmas.id, f.id));

      const restantes = await ctx.db.select({ id: contratoFirmas.id }).from(contratoFirmas)
        .where(and(eq(contratoFirmas.contratoId, f.contratoId),
                   eq(contratoFirmas.estado, "pendiente")));
      const enviadas = await ctx.db.select({ id: contratoFirmas.id, estado: contratoFirmas.estado })
        .from(contratoFirmas).where(eq(contratoFirmas.contratoId, f.contratoId));
      const faltan = enviadas.filter((x) => x.estado !== "firmado").length;

      if (faltan === 0) {
        await ctx.db.transaction(async (tx) => {
          await tx.update(contratos).set({
            estado: "vigente", firmadoAt: new Date(), hashDocumento: hashDoc,
          }).where(eq(contratos.id, f.contratoId));
          // La unidad sale de circulación al quedar el contrato en firme.
          await tx.update(inmuebles).set({ estado: "arrendado" })
            .where(eq(inmuebles.id, c.inmuebleId));
        });
        // El inquilino se vuelve inquilino de ESTE contrato, no en abstracto.
        await otorgarRol(ctx.db, c.inquilinoId, "inquilino", "contrato", f.contratoId);
      }

      return { firmado: true, faltanFirmas: faltan, contratoVigente: faltan === 0, restantes: restantes.length };
    }),

  /** Los contratos del usuario, sea dueño o inquilino. */
  mios: privado.query(async ({ ctx }) => {
    const filas = await ctx.db
      .select({
        id: contratos.id, numero: contratos.numero, estado: contratos.estado,
        canonMensual: contratos.canonMensual, diaPago: contratos.diaPago,
        fechaInicio: contratos.fechaInicio, fechaFin: contratos.fechaFin,
        // El inmueble hace falta del lado del cliente: las operaciones sobre un
        // contrato piden el ámbito sobre el que se comprueba el rol.
        inmuebleId: inmuebles.id,
        direccion: inmuebles.direccion, ciudad: inmuebles.ciudad,
        propietarioId: contratos.propietarioId, inquilinoId: contratos.inquilinoId,
      })
      .from(contratos)
      .innerJoin(inmuebles, eq(inmuebles.id, contratos.inmuebleId));
    const mios = filas.filter(
      (c) => c.propietarioId === ctx.usuario.id || c.inquilinoId === ctx.usuario.id,
    );
    return { total: mios.length, contratos: mios };
  }),
});
