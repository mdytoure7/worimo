import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { config } from "./config.js";

// R2 comme MinIO exposent l'API S3 ; path-style pour compatibilité des deux.
const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
  },
});

const CONTENT_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
};

export async function downloadObject(bucket: string, key: string, destPath: string): Promise<void> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`Objet vide : ${bucket}/${key}`);
  await pipeline(response.Body as Readable, createWriteStream(destPath));
}

/** Upload récursif d'un dossier local vers un préfixe du bucket public. */
export async function uploadDirectory(localDir: string, keyPrefix: string): Promise<void> {
  const entries = await readdir(localDir, { recursive: true });
  for (const entry of entries) {
    const fullPath = path.join(localDir, entry);
    if (!(await stat(fullPath)).isFile()) continue;
    const key = `${keyPrefix}/${entry.split(path.sep).join("/")}`;
    const ext = path.extname(entry).toLowerCase();
    await s3.send(
      new PutObjectCommand({
        Bucket: config.publicBucket,
        Key: key,
        Body: await readFile(fullPath),
        ContentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
        // Les segments HLS sont immuables : cache long côté CDN/navigateur.
        CacheControl: ext === ".m3u8" ? "public, max-age=60" : "public, max-age=31536000, immutable",
      }),
    );
  }
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
