# Démarre le worker d'encodage en NATIF Windows (sans Docker).
# Prérequis : ffmpeg + ffprobe dans le PATH (ou installés via Chocolatey),
#             services/encoder/.env rempli (copier .env.example),
#             npm install déjà fait dans services/encoder.
$ErrorActionPreference = "Stop"

$encoderDir = Join-Path $PSScriptRoot "..\services\encoder"
Set-Location $encoderDir

# ffmpeg : PATH, sinon Chocolatey, sinon copie locale du projet (tools/ffmpeg).
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  foreach ($dir in @("C:\ProgramData\chocolatey\bin", (Join-Path $PSScriptRoot "..\tools\ffmpeg\bin"))) {
    if (Test-Path (Join-Path $dir "ffmpeg.exe")) { $env:Path = "$dir;" + $env:Path; break }
  }
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg introuvable. Installez-le (choco install ffmpeg) ou placez-le dans tools\ffmpeg\bin."
}

# Charge les variables de services/encoder/.env
if (-not (Test-Path ".env")) { throw "services/encoder/.env manquant (copier .env.example)." }
Get-Content .env | Where-Object { $_ -match "^\s*[^#]" } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}

npx tsx src/index.ts
