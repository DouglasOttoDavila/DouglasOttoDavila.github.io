param(
  [string]$EnvPath = ".env",
  [string]$OutPath = "content/auth.runtime.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SupabaseProjectRefFromUrl {
  param([string]$Url)

  if (-not $Url) { return "" }
  $match = [regex]::Match($Url.Trim(), '^https://([^.]+)\.supabase\.co/?$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if (-not $match.Success) { return "" }
  return $match.Groups[1].Value
}

function Get-JsonValue {
  param(
    [Parameter(Mandatory = $true)][string]$Json,
    [Parameter(Mandatory = $true)][string]$Property
  )

  try {
    $parsed = $Json | ConvertFrom-Json
    $value = $parsed.$Property
    if ($null -eq $value) { return "" }
    return [string]$value
  } catch {
    return ""
  }
}

function Get-SupabaseProjectRefFromJwt {
  param([string]$Jwt)

  if (-not $Jwt) { return "" }
  $parts = $Jwt.Split('.')
  if ($parts.Length -lt 2) { return "" }

  $payload = $parts[1].Replace('-', '+').Replace('_', '/')
  switch ($payload.Length % 4) {
    2 { $payload += '==' }
    3 { $payload += '=' }
  }

  try {
    $bytes = [Convert]::FromBase64String($payload)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes)
    return Get-JsonValue -Json $json -Property 'ref'
  } catch {
    return ""
  }
}

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

$expectedSupabaseUrl = ""
$configPath = "content/auth.config.json"
if (Test-Path -LiteralPath $configPath) {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $expectedSupabaseUrl = [string]$config.supabase.url
}

if ($expectedSupabaseUrl -and $supabaseUrl -ne $expectedSupabaseUrl) {
  throw "SUPABASE_URL in $EnvPath does not match $configPath. Expected $expectedSupabaseUrl but found $supabaseUrl"
}

$urlRef = Get-SupabaseProjectRefFromUrl -Url $(if ($expectedSupabaseUrl) { $expectedSupabaseUrl } else { $supabaseUrl })
$anonRef = Get-SupabaseProjectRefFromJwt -Jwt $supabaseAnonKey
if ($urlRef -and $anonRef -and $urlRef -ne $anonRef) {
  throw "SUPABASE_ANON_KEY targets project '$anonRef' but SUPABASE_URL targets '$urlRef'"
}

$payload = [ordered]@{
  version = 1
  supabase = [ordered]@{
    url = $(if ($expectedSupabaseUrl) { $expectedSupabaseUrl } else { $supabaseUrl })
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
