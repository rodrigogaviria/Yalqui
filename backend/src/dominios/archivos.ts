import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { router, privado } from "../trpc/base.js";
import { accesoAlContrato } from "../auth/contratoAcceso.js";
import { archivos } from "../db/schema/identidad.js";

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const TIPO = "comprobante_pago";

let s3: S3Client | undefined;
const cliente = () => (s3 ??= new S3Client({}));
const bucket = () => {
  const b = process.env["UPLOADS_BUCKET"];
  if (!b) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El almacenamiento de archivos no está configurado" });
  return b;
};

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

      const uuid = randomUUID();
      const s3Key = `comprobantes/${input.contratoId}/${uuid}`;
      const [res] = await ctx.db.insert(archivos).values({
        uuid, s3Key, bucket: bucket(),
        nombreOriginal: input.nombre, mime: input.mime, tamanoBytes: input.bytes,
        subidoPorId: ctx.usuario.id, entidadTipo: TIPO, entidadId: input.contratoId,
      });
      const archivoId = Number((res as { insertId: number }).insertId);

      const url = await getSignedUrl(
        cliente(),
        new PutObjectCommand({ Bucket: bucket(), Key: s3Key, ContentType: input.mime, ContentLength: input.bytes }),
        { expiresIn: 300 },
      );
      return { archivoId, url };
    }),

  urlDescarga: privado
    .input(z.object({ archivoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [a] = await ctx.db.select().from(archivos).where(eq(archivos.id, input.archivoId)).limit(1);
      if (!a || a.entidadTipo !== TIPO || a.entidadId === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese archivo no existe" });
      }
      await accesoAlContrato(ctx.db, ctx.usuario, a.entidadId);

      const url = await getSignedUrl(
        cliente(),
        new GetObjectCommand({ Bucket: a.bucket, Key: a.s3Key, ResponseContentDisposition: `inline; filename="${encodeURIComponent(a.nombreOriginal)}"` }),
        { expiresIn: 300 },
      );
      return { url, nombre: a.nombreOriginal, mime: a.mime };
    }),
});
