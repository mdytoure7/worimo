# Worimo Mobile (Flutter)

App mobile Android + iOS. Consomme exactement les mêmes API que le web :
Supabase (auth, PostgREST avec RLS) et les Edge Functions `sign-upload` /
`finalize-video` pour la publication vidéo. Aucune logique métier critique
côté client — la RLS PostgreSQL reste la barrière de sécurité.

## Structure

```
mobile/lib/
├── main.dart               # App + routeur (routes nommées), init Supabase & media_kit
├── core/
│   ├── config.dart         # SUPABASE_URL / ANON_KEY via --dart-define
│   ├── supabase_service.dart
│   ├── theme.dart          # Poppins, vert #16A34A, bleu nuit #0F172A
│   ├── models.dart         # Property, PropertyMedia, Verification… (miroir types.ts)
│   └── format.dart         # prix FCFA, liens WhatsApp/tel
├── data/
│   ├── property_repository.dart   # feed, détail, recherche filtrée, mes annonces
│   ├── favorites_repository.dart
│   ├── favorites_store.dart       # store partagé (provider), cache + rollback optimiste
│   └── publish_repository.dart    # createDraft → sign-upload → PUT → finalize-video
├── features/
│   ├── feed/               # feed vidéo vertical plein écran (media_kit, HLS adaptatif)
│   ├── property/           # détail + rapport de vérification + WhatsApp/Appel
│   ├── auth/               # connexion / inscription email (OTP tél. : backend prêt)
│   ├── search/             # filtres (ville, type, budget, surface, vérifié, tri)
│   ├── favorites/
│   ├── profile/            # mes infos, mes annonces (statuts + motif de refus)
│   └── publish/            # formulaire 3 étapes + upload signé
└── shared/                 # VerifiedBadge, FavoriteButton, PropertyCard
```

## Lancer en local

Prérequis : la stack backend tourne (`supabase start`, worker d'encodage, web) —
voir le README racine. Récupérer la clé anon locale via `supabase status`.

```bash
# Émulateur Android → l'hôte est 10.0.2.2 (pas localhost)
flutter run \
  --dart-define=SUPABASE_URL=http://10.0.2.2:56321 \
  --dart-define=SUPABASE_ANON_KEY=<clé anon locale>

# Appareil physique → IP LAN du PC (ex. 192.168.1.20)
flutter run \
  --dart-define=SUPABASE_URL=http://192.168.1.20:56321 \
  --dart-define=SUPABASE_ANON_KEY=<clé anon locale>
```

> Le worker n'accepte que les vidéos **verticales de 15 à 60 s** : la durée est
> re-validée côté serveur (ffprobe), l'app ne fait pas foi.

## Paquets

| Besoin | Paquet |
|---|---|
| Backend (auth, données, functions) | `supabase_flutter` |
| Lecture HLS adaptative | `media_kit` + `media_kit_video` + `media_kit_libs_video` |
| Upload sur URL présignée | `http` |
| Sélection vidéo / photos | `image_picker` |
| État partagé (favoris) | `provider` |
| Ouverture WhatsApp / appel | `url_launcher` |
| Typographie Poppins | `google_fonts` |

## Production (rappel)

- `SUPABASE_URL` = projet Supabase cloud ; clé anon de production.
- OTP téléphone : brancher un fournisseur SMS dans le dashboard Supabase
  (le code d'auth mobile bascule alors sur l'OTP sans changer l'UI).
- Android : `minSdkVersion` relevé si besoin par media_kit (voir logs de build).
```
