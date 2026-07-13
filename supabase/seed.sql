-- =============================================================================
-- WORIMO — Données de démonstration (développement local uniquement)
-- Compte démo : demo@worimo.com / password123 (rôle agence)
-- Les vidéos pointent vers un flux HLS public de test pour que le feed web
-- fonctionne avant même que le pipeline d'encodage ne soit branché.
-- =============================================================================

-- Utilisateur de démonstration (le trigger handle_new_user crée le profil).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@worimo.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Teranga Immo", "role": "agency"}',
  now(), now(),
  '', '', '', '',
  '', '', '', ''
);

-- Un admin de démonstration pour tester la modération dans Studio.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@worimo.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Admin Worimo"}',
  now(), now(),
  '', '', '', '',
  '', '', '', ''
);

update public.profiles set role = 'admin'
where id = '22222222-2222-2222-2222-222222222222';

insert into public.agencies (id, owner_id, name, description, verified) values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Teranga Immo',
  'Agence immobilière basée à Dakar, spécialisée dans les terrains vérifiés.',
  true
);

insert into public.properties
  (id, owner_id, agency_id, title, description, type, offer_type, price, surface,
   rooms, city, district, latitude, longitude, contact_phone, whatsapp_phone, status)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Terrain 300 m² — Diamniadio, titre foncier',
   'Terrain plat de 300 m² dans le pôle urbain de Diamniadio, à 5 min de l''autoroute à péage. Titre foncier individuel, viabilisé (eau + électricité en bordure). Idéal construction R+2.',
   'land', 'sale', 18500000, 300, null,
   'Diamniadio', 'Pôle urbain', 14.7289, -17.1839,
   '+221771234567', '+221771234567', 'published'),

  ('bbbbbbbb-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Appartement F4 standing — Almadies',
   'Appartement F4 de 145 m² aux Almadies : 3 chambres climatisées, double séjour, cuisine équipée, balcon vue mer, parking sous-sol, groupe électrogène. Résidence sécurisée 24h/24.',
   'apartment', 'sale', 95000000, 145,
   4, 'Dakar', 'Almadies', 14.7447, -17.5142,
   '+221771234567', '+221771234567', 'published'),

  ('bbbbbbbb-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Villa 4 chambres avec piscine — Saly',
   'Villa contemporaine à Saly Portudal : 4 chambres, piscine privée, jardin arboré de 600 m², à 10 min de la plage. Location longue durée, meublée.',
   'house', 'rent', 1200000, 280,
   5, 'Saly', 'Saly Portudal', 14.4453, -17.0113,
   '+221701234567', '+221701234567', 'published');

-- Vidéos : flux HLS public de test (remplacé par R2 dès que le pipeline tourne).
insert into public.property_media
  (property_id, kind, manifest_url, thumbnail_url, duration_seconds, status, display_order)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'video',
   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
   'https://picsum.photos/seed/worimo1/720/1280', 30, 'ready', 0),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'video',
   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
   'https://picsum.photos/seed/worimo2/720/1280', 45, 'ready', 0),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'video',
   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
   'https://picsum.photos/seed/worimo3/720/1280', 25, 'ready', 0);

insert into public.property_media (property_id, kind, url, status, display_order) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'image', 'https://picsum.photos/seed/worimo-a/1080/720', 'ready', 1),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'image', 'https://picsum.photos/seed/worimo-b/1080/720', 'ready', 2),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'image', 'https://picsum.photos/seed/worimo-c/1080/720', 'ready', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'image', 'https://picsum.photos/seed/worimo-d/1080/720', 'ready', 2),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'image', 'https://picsum.photos/seed/worimo-e/1080/720', 'ready', 1);

-- Rapport de vérification : le terrain de Diamniadio est "Vérifié Worimo".
insert into public.verifications
  (property_id, level, status, report_number, summary, documents, verified_by, verified_at)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'titre_foncier', 'verified', 'WRM-2026-00001',
  'Titre foncier individuel authentifié auprès de la Conservation foncière de Rufisque. Visite terrain effectuée le 02/07/2026 : bornes en place, aucune occupation, superficie conforme.',
  '[
    {"doc_type": "titre_foncier", "label": "Titre foncier n° 4521/R vérifié à la Conservation foncière", "checked": true},
    {"doc_type": "nicad", "label": "NICAD concordant avec le cadastre", "checked": true},
    {"doc_type": "visite_terrain", "label": "Visite terrain et bornage contradictoire", "checked": true},
    {"doc_type": "identite_vendeur", "label": "Identité du vendeur confirmée (CNI + procuration)", "checked": true}
  ]'::jsonb,
  '22222222-2222-2222-2222-222222222222',
  now()
);

-- Le F4 Almadies est en cours de vérification (badge "en cours" côté UI).
insert into public.verifications (property_id, level, status)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'titre_foncier', 'in_review');
