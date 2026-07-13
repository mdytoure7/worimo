# Déploiement Worimo — guide pas à pas (0 F durable)

Objectif : mettre Worimo en ligne en **3 phases**. La phase 1 donne déjà une
**URL publique fonctionnelle sans carte bancaire**. Les vidéos de démo utilisent
un flux HLS public de test, donc le feed web marche avant même R2 + worker.

> Principe : aucune clé secrète en dur. Chaque service reçoit ses secrets via
> son propre coffre (Supabase secrets, variables Vercel, etc.). Claude prépare
> et lance les commandes ; **vous créez les comptes et fournissez les clés**.

---

## Phase 1 — Web + Backend en ligne (sans carte, ~30 min)

Résultat : `https://<projet>.vercel.app` où le web Worimo tourne contre un
Supabase cloud réel (feed avec les 3 annonces de démo, connexion, etc.).

### 1.1 Supabase cloud (backend)
1. Créer un compte sur **https://supabase.com** (gratuit, sans carte).
2. « New project » → nom `worimo`, région **Europe (London ou Frankfurt)**
   (plus proche du Sénégal que l'US), choisir un mot de passe DB (le noter).
3. Une fois le projet prêt, récupérer dans **Project Settings → API** :
   - `Project URL` (ex. `https://abcd.supabase.co`)
   - clé **anon public**
   - clé **service_role** (secrète — ne jamais l'exposer côté client)
4. Claude lance ensuite :
   ```
   npx supabase login                 # ouvre le navigateur
   npx supabase link --project-ref <ref>
   npx supabase db push               # applique les migrations
   ```
   Puis charge les données de démo (une fois, via SQL editor ou psql).

### 1.2 Web sur Vercel
1. Créer un compte **https://vercel.com** (gratuit, sans carte) — se connecter
   avec **GitHub** (créer un compte GitHub d'abord si besoin).
2. Pousser le dépôt sur GitHub (Claude prépare le repo + `git push`).
3. Sur Vercel : « Import Project » → choisir le repo → **Root Directory = `web`**.
4. Variables d'environnement Vercel (Project Settings → Environment Variables) :
   - `NEXT_PUBLIC_SUPABASE_URL` = l'URL Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clé anon
5. Deploy. → URL publique `https://worimo.vercel.app`.

**Fin de phase 1 : le web est en ligne.** ✅

---

## Phase 2 — Pipeline vidéo réel (R2 + Functions + worker)

> Cloudflare et Google Cloud demandent une **carte bancaire** (empreinte), même
> si l'usage reste dans le palier gratuit à 0 F. À prévoir.

### 2.1 Cloudflare R2 (stockage + diffusion vidéo)
1. Compte **https://cloudflare.com** → activer **R2** (carte requise, 10 Go
   gratuits + egress gratuit).
2. Créer deux buckets : `worimo-staging` (privé) et `worimo-public`.
3. Créer un **token API R2** (Access Key ID + Secret) → pour le backend/worker.
4. Bucket public : activer l'accès public ou brancher un domaine plus tard
   (`media.worimo.com`).

### 2.2 Edge Functions (upload sécurisé)
```
npx supabase functions deploy sign-upload finalize-video
npx supabase secrets set R2_ENDPOINT=... R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... R2_STAGING_BUCKET=worimo-staging \
  R2_PUBLIC_BUCKET=worimo-public R2_PUBLIC_BASE_URL=https://<public-r2-url>
```

### 2.3 Worker d'encodage (Google Cloud Run)
1. Compte **https://cloud.google.com** (carte requise ; Cloud Run a un palier
   gratuit permanent). Installer `gcloud`.
2. Claude construit et déploie l'image :
   ```
   gcloud run deploy worimo-encoder --source services/encoder \
     --region europe-west1 --no-allow-unauthenticated \
     --set-env-vars SUPABASE_URL=...,S3_ENDPOINT=...,STAGING_BUCKET=...,PUBLIC_BUCKET=...,PUBLIC_BASE_URL=... \
     --set-secrets SUPABASE_SERVICE_ROLE_KEY=...,S3_ACCESS_KEY_ID=...,S3_SECRET_ACCESS_KEY=...
   ```
   (Alternatives 0 F : VM Oracle Cloud Always Free, ou VPS.)

**Fin de phase 2 : upload + encodage + diffusion vidéo réels.** ✅

---

## Phase 3 — Domaine, SMS, mobile

- **Domaine `worimo.com`** : l'enregistrer (Cloudflare Registrar = prix coûtant).
  Puis : web sur `worimo.com` (Vercel), médias sur `media.worimo.com` (R2).
- **OTP téléphone** : brancher un fournisseur SMS (Twilio/Vonage) dans
  Supabase → Auth → Providers. L'app bascule alors sur l'OTP sans changement d'UI.
- **Mobile** : build *release* signé (`flutter build appbundle`), pointant vers
  l'URL Supabase de prod (`--dart-define`), publication Play Store.

---

## Récap des secrets par service

| Service | Secrets à fournir |
|---|---|
| Vercel (web) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Supabase Functions | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, buckets, `R2_PUBLIC_BASE_URL` |
| Worker (Cloud Run) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `S3_*`, buckets, `PUBLIC_BASE_URL` |
| Mobile (build) | `--dart-define=SUPABASE_URL`, `--dart-define=SUPABASE_ANON_KEY` |

Aucune de ces valeurs n'est commitée : `.env` sont dans `.gitignore`.
