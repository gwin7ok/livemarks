param(
  [string]$ProfilePath = 'G:\xkvvo1ku.main2forG',
  [string]$AddonId = '{c5867acc-54c9-4074-9574-04d8818d53e8}'
)
$pref = Join-Path $ProfilePath 'prefs.js'
if (-not (Test-Path $pref)) { Write-Error "prefs.js not found: $pref"; exit 2 }

$line = Get-Content $pref -ErrorAction Stop | Select-String 'extensions.webextensions.uuids' -SimpleMatch -List
if (-not $line) { Write-Output 'prefs.js has no extensions.webextensions.uuids entry'; exit 0 }

# 抽出: user_pref(...,"<escaped-json-string>"); の中身を取り出す
# まず先頭と末尾のラッパーを除去
$jsonText = $line.Line -replace '^[^\"]*"extensions\.webextensions\.uuids"\s*,\s*"','' -replace '"\);\s*$',''

# Unescape the extracted string (try multiple methods for robustness)
try{
  $unescaped = [System.Text.RegularExpressions.Regex]::Unescape($jsonText)
} catch {
  $unescaped = $jsonText -replace '\\"','"' -replace '\\\\','\\'
}

# JSON パース
try{
  $map = $unescaped | ConvertFrom-Json -ErrorAction Stop
} catch {
  Write-Output 'Failed to parse JSON. Dumping extracted strings for manual inspection:'
  Write-Output '--- RAW ESCAPED ---'
  Write-Output $jsonText
  Write-Output '--- UNESCAPED ---'
  Write-Output $unescaped
  exit 3
}

# 結果表示
$WriteOutHeader = 'extensions.webextensions.uuids mapping (truncated):'
Write-Output $WriteOutHeader
$map | ConvertTo-Json -Depth 5

if ($map.PSObject.Properties.Name -contains $AddonId) {
  $runtime = $map.$AddonId
  Write-Output "runtime UUID: $runtime"
} else {
  Write-Output "addon id not found in mapping: $AddonId"
}
