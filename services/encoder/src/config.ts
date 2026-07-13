function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  s3Endpoint: required("S3_ENDPOINT"),
  s3AccessKeyId: required("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  stagingBucket: process.env.STAGING_BUCKET ?? "worimo-staging",
  publicBucket: process.env.PUBLIC_BUCKET ?? "worimo-public",
  // Base URL publique des médias, vue par les navigateurs/apps
  // (domaine custom R2 en prod, http://localhost:9000/worimo-public en local).
  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/$/, ""),

  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
  maxAttempts: Number(process.env.MAX_ATTEMPTS ?? 3),
  tmpDir: process.env.TMP_DIR ?? "tmp",

  // Contraintes produit : vidéo verticale de 15 à 60 s.
  // Tolérance de 0,5 s pour les arrondis d'encodeurs mobiles.
  minDurationSeconds: 14.5,
  maxDurationSeconds: 60.5,
};
