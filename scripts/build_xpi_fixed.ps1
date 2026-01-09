Param(
    [string]$SourceDir = "$PSScriptRoot\..\livemarks",
    [string]$OutPath = "$PSScriptRoot\..\Livemarks_fixed.xpi",
    [bool]$NoCompression = $false
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
$mode = [System.IO.Compression.ZipArchiveMode]::Create
$fileStream = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
try {
    $zip = New-Object System.IO.Compression.ZipArchive($fileStream, $mode)
    $base = (Resolve-Path $SourceDir).Path
    Get-ChildItem -Recurse -File -Path $base | ForEach-Object {
        $full = $_.FullName
        $rel = $full.Substring($base.Length).TrimStart('\\','/')
        $entryName = $rel -replace '\\','/'
        if ($NoCompression) {
            $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::NoCompression)
            $entryStream = $entry.Open()
            $fileStreamSrc = [System.IO.File]::OpenRead($full)
            $fileStreamSrc.CopyTo($entryStream)
            $fileStreamSrc.Close()
            $entryStream.Close()
        } else {
            $zip.CreateEntryFromFile($full, $entryName)
        }
    }
} finally {
    if ($zip) { $zip.Dispose() }
    $fileStream.Close()
}
Write-Output "Created XPI: $OutPath";
