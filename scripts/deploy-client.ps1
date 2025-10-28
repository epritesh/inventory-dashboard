param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

try {
  # Move to repo root (script is in scripts/)
  Set-Location (Join-Path $PSScriptRoot '..')

  if (-not $SkipInstall) {
    Write-Host 'Installing web dependencies...' -ForegroundColor Cyan
    npm --prefix web ci
  }

  Write-Host 'Building client (Vite outDir -> ../client)...' -ForegroundColor Cyan
  npm --prefix web run build

  # postbuild copies 404.html via web/package.json

  Write-Host 'Deploying client via Catalyst CLI...' -ForegroundColor Cyan
  catalyst.cmd deploy --only client

  Write-Host 'Client deploy complete.' -ForegroundColor Green
}
catch {
  Write-Error $_
  exit 1
}
