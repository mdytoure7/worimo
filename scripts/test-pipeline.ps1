# =============================================================================
# Test de bout en bout du pipeline vidéo Worimo (environnement local).
#
# Rejoue le parcours exact de l'app :
#   1. Connexion (compte démo agence)
#   2. Création d'une annonce (draft)
#   3. sign-upload  -> URL présignée vers le bucket staging
#   4. PUT de la vidéo sur l'URL signée
#   5. finalize-video -> job mis en file
#   6. Attente de l'encodage (le worker Docker transcode en HLS)
#   7. Vérification du manifeste HLS publié
#
# Usage :  .\scripts\test-pipeline.ps1 -VideoPath C:\chemin\video.mp4
# Prérequis : supabase start + docker compose up (MinIO + encoder) actifs.
# =============================================================================
param(
  [Parameter(Mandatory = $true)][string]$VideoPath,
  [string]$SupabaseUrl = "http://127.0.0.1:56321",
  [string]$Email = "demo@worimo.com",
  [string]$Password = "password123"
)

$ErrorActionPreference = "Stop"
# PS 5.1 : la barre de progression rend Invoke-WebRequest extrêmement lent.
$ProgressPreference = "SilentlyContinue"

if (-not (Test-Path $VideoPath)) { throw "Vidéo introuvable : $VideoPath" }

# PS 5.1 encode les corps texte en Latin-1 : on envoie explicitement de l'UTF-8.
function Invoke-JsonPost($Uri, $Headers, $BodyObject) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($BodyObject | ConvertTo-Json))
  Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers `
    -ContentType "application/json; charset=utf-8" -Body $bytes
}

# --- Clé anon depuis la CLI ---------------------------------------------------
Write-Host "Récupération des clés locales…" -ForegroundColor Cyan
# PS 5.1 : ne pas rediriger le stderr d'une commande native avec EAP=Stop
# (les WARN de la CLI deviendraient des exceptions).
$previousEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$statusEnv = npx supabase status -o env 2>$null
$ErrorActionPreference = $previousEap
$anonKey = ($statusEnv | Select-String '^ANON_KEY="?([^"]+)"?').Matches[0].Groups[1].Value
if (-not $anonKey) { throw "Impossible de lire ANON_KEY — supabase start est-il lancé ?" }

# --- 1. Connexion -------------------------------------------------------------
Write-Host "1/7 Connexion en $Email…" -ForegroundColor Cyan
$auth = Invoke-JsonPost "$SupabaseUrl/auth/v1/token?grant_type=password" `
  @{ apikey = $anonKey } `
  @{ email = $Email; password = $Password }
$token = $auth.access_token
$userId = $auth.user.id
Write-Host "    OK (user $userId)"

$restHeaders = @{
  apikey        = $anonKey
  Authorization = "Bearer $token"
  Prefer        = "return=representation"
}

# --- 2. Création de l'annonce ---------------------------------------------------
Write-Host "2/7 Création de l'annonce (draft)…" -ForegroundColor Cyan
$property = Invoke-JsonPost "$SupabaseUrl/rest/v1/properties" $restHeaders @{
  owner_id   = $userId
  title      = "TEST pipeline vidéo $(Get-Date -Format 'HH:mm:ss')"
  type       = "apartment"
  offer_type = "sale"
  price      = 10000000
  city       = "Dakar"
  status     = "draft"
}
$propertyId = $property[0].id
Write-Host "    OK (annonce $propertyId)"

# --- 3. URL présignée -----------------------------------------------------------
Write-Host "3/7 Demande d'URL signée (sign-upload)…" -ForegroundColor Cyan
$videoSize = (Get-Item $VideoPath).Length
$sign = Invoke-JsonPost "$SupabaseUrl/functions/v1/sign-upload" `
  @{ apikey = $anonKey; Authorization = "Bearer $token" } `
  @{
    property_id  = $propertyId
    kind         = "video"
    content_type = "video/mp4"
    size_bytes   = $videoSize
  }
Write-Host "    OK (job $($sign.job_id))"

# --- 4. Upload de la vidéo -------------------------------------------------------
# curl.exe plutôt qu'Invoke-WebRequest : PUT de gros fichiers fiable et rapide.
Write-Host "4/7 Upload de la vidéo ($([math]::Round($videoSize/1MB, 1)) Mo)…" -ForegroundColor Cyan
curl.exe -sS -f -X PUT -T $VideoPath -H "Content-Type: video/mp4" $sign.upload_url
if ($LASTEXITCODE -ne 0) { throw "Upload échoué (curl code $LASTEXITCODE)" }
Write-Host "    OK"

# --- 5. Finalisation -------------------------------------------------------------
Write-Host "5/7 Finalisation (finalize-video)…" -ForegroundColor Cyan
$finalize = Invoke-JsonPost "$SupabaseUrl/functions/v1/finalize-video" `
  @{ apikey = $anonKey; Authorization = "Bearer $token" } `
  @{ job_id = $sign.job_id }
Write-Host "    OK (statut : $($finalize.status))"

# --- 6. Attente de l'encodage ------------------------------------------------------
Write-Host "6/7 Encodage en cours (worker ffmpeg)…" -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(5)
do {
  Start-Sleep -Seconds 5
  $media = Invoke-RestMethod -Method Get `
    -Uri "$SupabaseUrl/rest/v1/property_media?id=eq.$($sign.media_id)&select=status,manifest_url,duration_seconds,width,height" `
    -Headers $restHeaders
  $status = $media[0].status
  Write-Host "    statut : $status"
} while ($status -notin @("ready", "failed") -and (Get-Date) -lt $deadline)

if ($status -ne "ready") {
  Write-Host "ÉCHEC : la vidéo est en statut '$status'. Logs worker : docker compose logs encoder" -ForegroundColor Red
  exit 1
}

# --- 7. Vérification du manifeste HLS ------------------------------------------------
$manifestUrl = $media[0].manifest_url
Write-Host "7/7 Vérification du manifeste : $manifestUrl" -ForegroundColor Cyan
$manifest = curl.exe -s $manifestUrl | Out-String
$renditions = ([regex]::Matches($manifest, "index\.m3u8")).Count
if ($manifest -match "\\") { throw "Manifeste invalide : antislashs détectés dans les URI HLS" }

Write-Host ""
Write-Host "================ PIPELINE OK ================" -ForegroundColor Green
Write-Host " Durée détectée : $($media[0].duration_seconds) s ($($media[0].width)x$($media[0].height))"
Write-Host " Rendus HLS     : $renditions variante(s)"
Write-Host " Manifeste      : $manifestUrl"
Write-Host " Annonce test   : $propertyId (statut draft — supprimable depuis /profil)"
Write-Host "============================================="
