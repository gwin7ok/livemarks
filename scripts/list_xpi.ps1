Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path -Path (Get-Location).Path -ChildPath 'Livemarks.xpi'
if (-not (Test-Path $zip)) { Write-Host "XPI not found: $zip"; exit 1 }
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()