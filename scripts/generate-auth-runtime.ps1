param(
  [string]$EnvPath = ".env",
  [string]$OutPath = "content/auth.runtime.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Parse-DotEnvLine {
  param([string]$Line)

  $trimmed = $Line.Trim()
  if (-not $trimmed) { return $null }
  if ($trimmed.StartsWith("#")) { return $null }

  $idx = $trimmed.IndexOf("=")
  if ($idx -lt 1) { return $null }

  $key = $trimmed.Substring(0, $idx).Trim()
  $val = $trimmed.Substring($idx + 1).Trim()

  # Strip surrounding quotes if present.
  if (($val.StartsWith("'") -and $val.EndsWith("'")) -or ($val.StartsWith('"') -and $val.EndsWith('"'))) {
    if ($val.Length -ge 2) {
      $val = $val.Substring(1, $val.Length - 2)
    }
  }

  if (-not $key) { return $null }
  return @{ Key = $key; Value = $val }
}

if (-not (Test-Path -LiteralPath $EnvPath)) {
  throw "Missing $EnvPath"
}

$pairs = @{}
Get-Content -LiteralPath $EnvPath | ForEach-Object {
  $parsed = Parse-DotEnvLine $_
  if ($null -ne $parsed) {
    $pairs[$parsed.Key] = $parsed.Value
  }
}

$supabaseUrl = $pairs["SUPABASE_URL"]
$supabaseAnonKey = $pairs["SUPABASE_ANON_KEY"]

if (-not $supabaseUrl -or -not $supabaseAnonKey) {
  throw "SUPABASE_URL and SUPABASE_ANON_KEY must be set in $EnvPath"
}

$payload = [ordered]@{
  version = 1
  supabase = [ordered]@{
    url = $supabaseUrl
    anonKey = $supabaseAnonKey
  }
}

$json = $payload | ConvertTo-Json -Depth 6

$outDir = Split-Path -Parent $OutPath
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

Set-Content -LiteralPath $OutPath -Value $json -Encoding UTF8
Write-Output "Wrote $OutPath"
