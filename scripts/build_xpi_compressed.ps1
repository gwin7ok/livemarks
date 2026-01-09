Param(
    [string]$SourceDir = "$PSScriptRoot\..\livemarks",
    [string]$OutPath = "$PSScriptRoot\..\Livemarks_test.xpi"
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory((Resolve-Path $SourceDir).Path, $OutPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Write-Output "Created XPI: $OutPath";
