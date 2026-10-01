import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { router, privado } from "../trpc/base.js";
import { accesoAlContrato } from "../auth/contratoAcceso.js";
import { archivos } from "../db/schema/identidad.js";
import { tieneRol } from "../auth/roles.js";
import { esArrendatarioDe } from "../auth/arrendatario.js";
import { puedeSobreEdificacion } from "./facturasPropiedad.js";
import { movimientos } from "../db/schema/finanzas.js";

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const TIPO = "comprobante_pago";
const TIPO_UNIDAD = "pago_unidad";
const TIPO_FACTURA = "factura_propiedad";
const TIPO_FACTURA_EDIF = "factura_edificacion";
const TIPO_GASTO = "movimiento_gasto";

let s3: S3Client | undefined;
const cliente = () => (s3 ??= new S3Client({}));
const bucket = () => {
  const b = process.env["UPLOADS_BUCKET"];
  if (!b) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El almacenamiento de archivos no está configurado" });
  return b;
};

/** Quien manda sobre un gasto: el propietario de su unidad, o de su
 *  edificación si es uno repartido entre varias. */
async function puedeSobreElGasto(
  ctx: { db: import("../db/index.js").Database; usuario: { roles: import("../auth/roles.js").RolOtorgado[] } },
  movimientoId: number,
) {
  const [m] = await ctx.db
    .select({ inmuebleId: movimientos.inmuebleId, edificacionId: movimientos.edificacionId })
    .from(movimientos).where(eq(movimientos.id, movimientoId)).limit(1);
  if (!m) return false;
  return m.inmuebleId !== null
    ? tieneRol(ctx.usuario.roles, "propietario", "inmueble", m.inmuebleId)
    : m.edificacionId !== null && puedeSobreEdificacion(ctx.usuario.roles, m.edificacionId);
}

/** El propietario de la unidad y quien la arrienda. */
async function puedeSobreLaUnidad(
  ctx: { db: import("../db/index.js").Database; usuario: { id: number; roles: import("../auth/roles.js").RolOtorgado[] } },
  inmuebleId: number,
) {
  return tieneRol(ctx.usuario.roles, "propietario", "inmueble", inmuebleId)
    || await esArrendatarioDe(ctx.db, ctx.usuario.id, inmuebleId);
}

async function prepararSubida(
  ctx: { db: import("../db/index.js").Database; usuario: { id: number } },
  tipo: string, entidadId: number,
  input: { nombre: string; mime: string; bytes: number },
) {
  const uuid = randomUUID();
  const s3Key = `comprobantes/${tipo}/${entidadId}/${uuid}`;
  const [res] = await ctx.db.insert(archivos).values({
    uuid, s3Key, bucket: bucket(),
    nombreOriginal: input.nombre, mime: input.mime, tamanoBytes: input.bytes,
    subidoPorId: ctx.usuario.id, entidadTipo: tipo, entidadId,
  });
  const archivoId = Number((res as { insertId: number }).insertId);

  const url = await getSignedUrl(
    cliente(),
    new PutObjectCommand({ Bucket: bucket(), Key: s3Key, ContentType: input.mime, ContentLength: input.bytes }),
    { expiresIn: 300 },
  );
  return { archivoId, url };
}

/**
 * Comprobantes de pago.
 *
 * El archivo va directo del navegador a S3 con una URL firmada de corta vida:
 * la Lambda nunca lo carga en memoria. Y se lee igual, con una URL firmada que
 * solo se entrega a quien tiene acceso al contrato — un comprobante trae datos
 * bancarios, así que no cuelga de una ruta pública.
 */
export const archivosRouter = router({
  solicitarSubidaComprobante: privado
    .input(z.object({
      contratoId: z.number().int().positive(),
      nombre: z.string().trim().min(1).max(255),
      mime: z.enum(MIME_PERMITIDOS),
      bytes: z.number().int().positive().max(MAX_BYTES, "El archivo pesa más de 10 MB"),
    }))
    .mutation(async ({ ctx, input }) => {
      await accesoAlContrato(ctx.db, ctx.usuario, input.contratoId);
      return prepararSubida(ctx, TIPO, input.contratoId, input);
    }),

  /** Comprobante de un pago registrado sobre la unidad, sin contrato de por medio. */
  solicitarSubidaPagoUnidad: privado
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      nombre: z.string().trim().min(1).max(255),
      mime: z.enum(MIME_PERMITIDOS),
      bytes: z.number().int().positive().max(MAX_BYTES, "El archivo pesa más de 10 MB"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await puedeSobreLaUnidad(ctx, input.inmuebleId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa unidad" });
      }
      return prepararSubida(ctx, TIPO_UNIDAD, input.inmuebleId, input);
    }),

  /** La factura de la propiedad o de la edificación, o el comprobante de su pago. */
  solicitarSubidaFacturaPropiedad: privado
    .input(z.object({
      inmuebleId: z.number().int().positive().optional(),
      edificacionId: z.number().int().positive().optional(),
      nombre: z.string().trim().min(1).max(255),
      mime: z.enum(MIME_PERMITIDOS),
      bytes: z.number().int().positive().max(MAX_BYTES, "El archivo pesa más de 10 MB"),
    }).refine((v) => (v.inmuebleId === undefined) !== (v.edificacionId === undefined),
      { message: "Decí si es de una unidad o de la edificación" }))
    .mutation(async ({ ctx, input }) => {
      if (input.inmuebleId !== undefined) {
        if (!tieneRol(ctx.usuario.roles, "propietario", "inmueble", input.inmuebleId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa unidad" });
        }
        return prepararSubida(ctx, TIPO_FACTURA, input.inmuebleId, input);
      }
      if (!puedeSobreEdificacion(ctx.usuario.roles, input.edificacionId!)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa edificación" });
      }
      return prepararSubida(ctx, TIPO_FACTURA_EDIF, input.edificacionId!, input);
    }),

  /** El comprobante (o varios) de un gasto: la factura del proveedor, el
   *  recibo, la foto de la transferencia. */
  solicitarSubidaGasto: privado
    .input(z.object({
      movimientoId: z.number().int().positive(),
      nombre: z.string().trim().min(1).max(255),
      mime: z.enum(MIME_PERMITIDOS),
      bytes: z.number().int().positive().max(MAX_BYTES, "El archivo pesa más de 10 MB"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await puedeSobreElGasto(ctx, input.movimientoId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre ese gasto" });
      }
      return prepararSubida(ctx, TIPO_GASTO, input.movimientoId, input);
    }),

  /** Los comprobantes ya subidos de un gasto, el más nuevo primero. */
  comprobantesDeGasto: privado
    .input(z.object({ movimientoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (!(await puedeSobreElGasto(ctx, input.movimientoId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre ese gasto" });
      }
      return ctx.db
        .select({ id: archivos.id, nombre: archivos.nombreOriginal, createdAt: archivos.createdAt })
        .from(archivos)
        .where(and(eq(archivos.entidadTipo, TIPO_GASTO), eq(archivos.entidadId, input.movimientoId)))
        .orderBy(desc(archivos.createdAt));
    }),

  /** Quita un comprobante subido de más, sin tocar el gasto. */
  eliminarComprobanteGasto: privado
    .input(z.object({ archivoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await ctx.db.select({ entidadId: archivos.entidadId, entidadTipo: archivos.entidadTipo })
        .from(archivos).where(eq(archivos.id, input.archivoId)).limit(1);
      if (!a || a.entidadTipo !== TIPO_GASTO || a.entidadId === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese comprobante no existe" });
      }
      if (!(await puedeSobreElGasto(ctx, a.entidadId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre ese gasto" });
      }
      await ctx.db.delete(archivos).where(eq(archivos.id, input.archivoId));
      return { ok: true };
    }),

  urlDescarga: privado
    .input(z.object({ archivoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [a] = await ctx.db.select().from(archivos).where(eq(archivos.id, input.archivoId)).limit(1);
      if (!a || a.entidadId === null || (a.entidadTipo !== TIPO && a.entidadTipo !== TIPO_UNIDAD && a.entidadTipo !== TIPO_FACTURA && a.entidadTipo !== TIPO_FACTURA_EDIF && a.entidadTipo !== TIPO_GASTO)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese archivo no existe" });
      }
      if (a.entidadTipo === TIPO) {
        await accesoAlContrato(ctx.db, ctx.usuario, a.entidadId);
      } else if (a.entidadTipo === TIPO_FACTURA_EDIF) {
        if (!puedeSobreEdificacion(ctx.usuario.roles, a.entidadId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa edificación" });
        }
      } else if (a.entidadTipo === TIPO_FACTURA) {
        if (!tieneRol(ctx.usuario.roles, "propietario", "inmueble", a.entidadId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa unidad" });
        }
      } else if (a.entidadTipo === TIPO_GASTO) {
        if (!(await puedeSobreElGasto(ctx, a.entidadId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre ese gasto" });
        }
      } else if (!(await puedeSobreLaUnidad(ctx, a.entidadId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa unidad" });
      }

      const url = await getSignedUrl(
        cliente(),
        new GetObjectCommand({ Bucket: a.bucket, Key: a.s3Key, ResponseContentDisposition: `inline; filename="${encodeURIComponent(a.nombreOriginal)}"` }),
        { expiresIn: 300 },
      );
      return { url, nombre: a.nombreOriginal, mime: a.mime };
    }),
});
