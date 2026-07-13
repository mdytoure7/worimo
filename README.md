# Worimo

**Trouvez. Vérifiez. Achetez en confiance.**

Marketplace immobilière au Sénégal : feed vidéo vertical (façon TikTok/Reels)
et vérification foncière transparente — badge **Vérifié Worimo** adossé à une
méthodologie réelle (titre foncier, NICAD, visite terrain).

## Arborescence

```
worimo/
├── supabase/                       # Backend (source de vérité : toute la logique métier)
│   ├── config.toml                 # Config Supabase local (auth OTP test incluse)
│   ├── migrations/
│   │   ├── 20260712000001_initial_schema.sql   # Schéma + RLS + triggers + file vidéo
│   │   └── 20260712000002_admin_moderation.sql # Motif de refus (modération)
│   ├── seed.sql                    # Données de démo (3 annonces publiées, 1 vérifiée)
│   └── functions/
│       ├── _shared/                # cors.ts, r2.ts (signature S3, clés jamais côté client)
│       ├── sign-upload/            # POST : URL présignée R2 (vidéo -> staging, image -> public)
│       ├── finalize-video/         # POST : contrôle de l'objet uploadé + mise en file
│       └── .env.example
├── services/
│   └── encoder/                    # Worker ffmpeg (conteneur Docker portable)
│       ├── Dockerfile              # node:20-slim + ffmpeg
│       └── src/
│           ├── index.ts            # boucle : claim job -> valider -> transcoder -> publier
│           ├── probe.ts            # ffprobe : durée 15-60 s, format vertical (fait foi)
│           ├── transcode.ts        # HLS adaptatif 480p/720p/1080p, une passe ffmpeg
│           ├── storage.ts          # S3 (R2 prod / MinIO local)
│           ├── config.ts / errors.ts
├── web/                            # Next.js 15 + TypeScript + Tailwind 4 (SEO, pages publiques)
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # Feed vidéo vertical plein écran
│       │   ├── annonces/[id]/      # Détail annonce + rapport de vérification
│       │   ├── connexion/          # Connexion / inscription (email, rôles)
│       │   ├── publier/            # Formulaire 3 étapes + upload signé + suivi encodage
│       │   ├── admin/              # Modération (publier/refuser) + rapports de vérification
│       │   ├── recherche/          # Filtres (ville, type, budget, surface, vérifié) + tri
│       │   ├── favoris/            # Mes favoris (grille de cartes)
│       │   └── profil/             # Mes infos, mon agence, mes annonces (statuts + motif)
│       ├── components/             # VideoFeed, HlsPlayer, PropertyCard, FavoriteButton…
│       └── lib/                    # clients Supabase, upload signé (XHR progression), types
├── mobile/                         # Flutter — prochaine étape (voir mobile/README.md)
├── docker-compose.yml              # Local : MinIO (émule R2) + worker d'encodage
└── .gitignore
```

**Principe directeur** : aucune logique métier critique côté frontend. Les
frontends parlent à Supabase avec la clé `anon` ; la sécurité est portée par
la **RLS PostgreSQL**, des **triggers** (publication/rejet = admin uniquement,
anti-escalade de rôle) et les **Edge Functions** (les clés R2 ne quittent
jamais le serveur).

## Pipeline vidéo

```
App/Web ──1. POST sign-upload──────────▶ Edge Function ──▶ crée media + job, signe une URL PUT
        ◀─── URL présignée (15 min) ───
        ──2. PUT vidéo (mp4/mov) ──────▶ Bucket R2 STAGING (privé)
        ──3. POST finalize-video ──────▶ Edge Function : HEAD de contrôle, job -> 'queued'
                                              │
                     Worker ffmpeg ◀── claim_next_video_job() (atomique, multi-workers OK)
                     │ ffprobe : durée 15-60 s, orientation verticale  ← validation qui FAIT FOI
                     │ ffmpeg  : HLS 480p / 720p / 1080p + master.m3u8 + thumbnail
                     ▼
              Bucket R2 PUBLIC ──▶ property_media.manifest_url ──▶ hls.js / media_kit
```

- Échec de validation (trop courte/longue, paysage, corrompue) : job `failed`
  avec message affichable, source staging supprimée.
- Erreur transitoire : jusqu'à 3 tentatives automatiques.
- Pas d'upscale : une source 720p ne produit que 480p + 720p.
- Modération : l'annonce reste `pending` tant qu'un admin ne l'a pas publiée
  (trigger en base — impossible à contourner depuis un client). Interface :
  `/admin` (file d'attente, aperçu vidéo, publier/refuser avec motif,
  édition du rapport de vérification foncière).

## Hébergement de l'encodage : gratuit et durable

Le worker est un **conteneur Docker autonome** — le même code partout :

| Étape | Où | Coût |
|---|---|---|
| Développement | `docker compose up` sur votre machine | 0 F |
| Lancement (recommandé) | **Google Cloud Run** (niveau gratuit permanent : ~180 000 vCPU-s/mois ≈ plusieurs centaines de vidéos, scale-to-zero) | 0 F dans le quota |
| Alternative | VM **Oracle Cloud Always Free** (4 vCPU ARM, 24 Go) ou VPS ~3 000 F/mois | 0 F / fixe |

Aucune de ces options ne change une ligne de code : seul le fichier d'env varie.

## Démarrage local

Prérequis : Node ≥ 20, Docker Desktop, [CLI Supabase](https://supabase.com/docs/guides/cli)
(`npm i -g supabase` ou `scoop install supabase`).

```powershell
# 1. Base + Auth + API (note les clés affichées : anon + service_role)
supabase start
supabase db reset          # applique la migration + charge les données de démo

# 2. Secrets des Edge Functions, puis servir les fonctions
copy supabase\functions\.env.example supabase\functions\.env
supabase functions serve --env-file supabase/functions/.env

# 3. MinIO (émule R2)
$env:SUPABASE_SERVICE_ROLE_KEY = "<clé service_role de supabase status>"
docker compose up -d minio minio-init

# 4. Worker d'encodage — NATIF Windows (recommandé en local : plus rapide et
#    plus robuste que le build Docker ; nécessite ffmpeg, ex. `choco install ffmpeg`)
cd services\encoder; npm install; copy .env.example .env   # y coller la clé service_role
cd ..\..; .\scripts\start-worker.ps1
#    (alternative tout-Docker : docker compose up -d --build)

# 5. Web
copy web\.env.local.example web\.env.local   # y coller l'URL + la clé anon
cd web; npm install; npm run dev             # http://localhost:3000

# 6. Test de bout en bout du pipeline vidéo (upload -> encodage -> manifeste HLS)
.\scripts\test-pipeline.ps1 -VideoPath <une vidéo verticale de 15 à 60 s>
```

> Note Windows : les ports Supabase du projet sont en 56xxx (56321 = API) car la
> plage par défaut 54xxx tombe dans les ports réservés par Hyper-V/WinNAT.

Comptes de démo : `demo@worimo.com` / `password123` (agence),
`admin@worimo.com` / `password123` (admin). OTP SMS de test : numéros
`+221 70 123 45 67` et `+221 77 123 45 67`, code `123456`.

## Passage en production

1. **Supabase cloud** : `supabase link` puis `supabase db push` ;
   `supabase functions deploy sign-upload finalize-video` ;
   `supabase secrets set` avec les valeurs R2 (voir `.env.example`).
2. **Cloudflare R2** : créer `worimo-staging` (privé) et `worimo-public`
   (domaine public custom, ex. `media.worimo.com`). Configurer le **CORS** des
   deux buckets : `PUT` depuis l'app pour staging, `GET` pour public.
3. **Worker** : `gcloud run deploy` (ou VPS) avec les variables de
   `services/encoder/.env.example` pointant vers R2 et Supabase cloud.
4. **Auth téléphone** : brancher un fournisseur SMS (Twilio/Vonage) dans le
   dashboard Supabase.
5. **Web** : déployer `web/` sur Vercel (gratuit) avec les deux variables
   `NEXT_PUBLIC_*`.

## Feuille de route V1 (état)

| # | Fonctionnalité | État |
|---|---|---|
| 1 | Auth OTP téléphone + email, rôles | ✅ Backend prêt · Web + Flutter : email — OTP téléphone à brancher (fournisseur SMS) |
| 2 | Feed vidéo vertical | ✅ Web + Flutter (media_kit, HLS adaptatif) |
| 3 | Détail annonce (badge, WhatsApp/Appel) | ✅ Web + Flutter |
| 4 | Publier une annonce (3 étapes, vidéo 15-60 s) | ✅ Web + Flutter (formulaire 3 étapes + upload signé) |
| 5 | Page vérification / rapport | ✅ Web + Flutter (intégrée au détail) |
| 6 | Filtres de recherche | ✅ Web + Flutter (ville, type, offre, budget, surface, vérifié, tri) |
| 7 | Favoris | ✅ Web + Flutter (cœur sur feed/cartes/détail + page dédiée) |
| 8 | Profil utilisateur | ✅ Web + Flutter (infos, mes annonces avec statuts + motif de refus) |

> **Flutter** : code complet et `flutter analyze` propre (0 erreur / 0 warning).
> Lancement sur appareil : nécessite le SDK Android (non installé sur le poste de
> dev actuel) — voir `mobile/README.md`.
