Param(
    [string]$SourceDir = (Join-Path $PSScriptRoot 'livemarks'),
    [string]$OutPath = (Join-Path $PSScriptRoot 'Livemarks_store.xpi')
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $OutPath) { Remove-Item -LiteralPath $OutPath -Force }
$temp = Join-Path $PSScriptRoot 'xpi_tmp_store'
if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null

# copy contents
Get-ChildItem -Path $SourceDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($SourceDir.Length + 1).TrimStart('\')
    $dest = Join-Path $temp $rel
    $d = Split-Path $dest -Parent
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
}

# create zip with store (no compression)
$fileStream = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
$zipArchive = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $filesToAdd = Get-ChildItem -Path $temp -Recurse -File
    foreach ($f in $filesToAdd) {
        $entryName = $f.FullName.Substring($temp.Length + 1).TrimStart([IO.Path]::DirectorySeparatorChar).Replace('\\','/')
        $entry = $zipArchive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::NoCompression)
        $entryStream = $entry.Open()
        $fs = [System.IO.File]::OpenRead($f.FullName)
        try { $fs.CopyTo($entryStream) } finally { $fs.Close(); $entryStream.Close() }
    }
} finally {
    $zipArchive.Dispose()
    $fileStream.Close()
}

Remove-Item -LiteralPath $temp -Recurse -Force
Write-Host "Created XPI (store): $OutPath"