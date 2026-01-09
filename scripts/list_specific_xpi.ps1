Param(
    [string]$ZipPath = (Join-Path (Get-Location).Path 'Livemarks_store.xpi')
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not (Test-Path $ZipPath)) { Write-Error "XPI not found: $ZipPath"; exit 2 }
$z = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
$z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()