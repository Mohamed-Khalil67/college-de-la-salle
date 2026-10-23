# Creates deploy/.env from deploy/.env.example with fresh random secrets. Refuses to overwrite.
#   powershell -ExecutionPolicy Bypass -File deploy\scripts\generate-env.ps1
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $PSScriptRoot
$target = Join-Path $dir '.env'
if (Test-Path $target) {
  throw "$target exists; delete it first if you really want new secrets (they would invalidate every session and the database password)."
}
function New-Secret([int]$length) {
  $bytes = New-Object byte[] ($length / 2)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
$text = Get-Content (Join-Path $dir '.env.example') -Raw -Encoding UTF8
$text = $text -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$(New-Secret 40)"
$text = $text -replace '(?m)^JWT_ACCESS_SECRET=.*$', "JWT_ACCESS_SECRET=$(New-Secret 64)"
$text = $text -replace '(?m)^JWT_REFRESH_SECRET=.*$', "JWT_REFRESH_SECRET=$(New-Secret 64)"
[System.IO.File]::WriteAllText($target, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote $target. Now edit PUBLIC_WEB_URL, SCHOOL_EMAIL_DOMAIN, SMTP_* and TUNNEL_TOKEN (or DOMAIN)."
