// Client S3 minimal pour Cloudflare R2 (API compatible S3), basé sur aws4fetch.
// Les clés R2 ne quittent JAMAIS le backend : ce module ne sert qu'à signer.
import { AwsClient } from "npm:aws4fetch@1.0.20";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const r2Config = {
  // Endpoint vu par le CLIENT (URL présignée que le navigateur/l'app appelle).
  // En prod R2 : https://<account_id>.r2.cloudflarestorage.com (identique à internal).
  // En local MinIO : http://localhost:9000 (le navigateur tourne sur l'hôte).
  publicEndpoint: () => env("R2_ENDPOINT_PUBLIC"),
  // Endpoint vu par l'Edge Function elle-même (HEAD de contrôle).
  // En local : http://host.docker.internal:9000 (l'edge runtime est dans Docker).
  internalEndpoint: () => env("R2_ENDPOINT_INTERNAL"),
  stagingBucket: () => env("R2_STAGING_BUCKET"),
  publicBucket: () => env("R2_PUBLIC_BUCKET"),
  publicBaseUrl: () => env("R2_PUBLIC_BASE_URL"),
};

function awsClient(): AwsClient {
  return new AwsClient({
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    region: "auto",
    service: "s3",
  });
}

/**
 * Génère une URL présignée PUT (validité 15 min). Le Content-Type fait partie
 * de la signature : le client ne peut pas uploader autre chose que ce qui a
 * été validé ici.
 */
export async function presignPut(
  bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  const url = new URL(`${r2Config.publicEndpoint()}/${bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await awsClient().sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

/** HEAD signé sur un objet : retourne sa taille, ou null s'il n'existe pas. */
export async function headObject(
  bucket: string,
  key: string,
): Promise<{ size: number } | null> {
  const url = `${r2Config.internalEndpoint()}/${bucket}/${key}`;
  const response = await awsClient().fetch(url, { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`HEAD ${key} a échoué : ${response.status}`);
  }
  return { size: Number(response.headers.get("content-length") ?? 0) };
}
