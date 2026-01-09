 # Ensure Param is the first statement so PowerShell recognizes it in all invocation modes
Param(
    [string]$SourceDir,
    [string]$OutPath
)

$SetErrorActionPreference = 'Stop'

# Allow running the script by double-click from Explorer with no parameters.
# If parameters are not supplied, use the script folder's livemarks/ as SourceDir
# and Livemarks.xpi in the script folder as OutPath.
if (-not $SourceDir -or $SourceDir -eq '') {
    $SourceDir = Join-Path -Path $PSScriptRoot -ChildPath 'livemarks'
}
if (-not $OutPath -or $OutPath -eq '') {
    $OutPath = Join-Path -Path $PSScriptRoot -ChildPath 'Livemarks.xpi'
}

Set-Location -LiteralPath $SourceDir
# Files/entries to exclude from the archive (names only)
$exclude = @('build_xpi.bat', 'build_xpi.ps1', '.git', '.gitignore')
$files = Get-ChildItem -Recurse -File -Force | Where-Object { -not ($exclude -contains $_.Name) } | Select-Object -ExpandProperty FullName
if ($files) {
    $outExt = [IO.Path]::GetExtension($OutPath)
    if ($outExt -ieq '.zip') {
        $zipPath = $OutPath
    }
    else {
        $zipPath = [IO.Path]::ChangeExtension($OutPath, '.zip')
    }
        # Remove previous output files to avoid embedding them
    try {
        if (Test-Path -LiteralPath $OutPath) { Remove-Item -LiteralPath $OutPath -Force }
        if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
        # also remove stray files like '#.zip' created by prior mis-invocations
        $hashZip = Join-Path -Path $PSScriptRoot -ChildPath '#.zip'
        if (Test-Path -LiteralPath $hashZip) { Remove-Item -LiteralPath $hashZip -Force }
        # remove temporary extracted folder if present to avoid including stale files
        $tempDir = Join-Path -Path $PSScriptRoot -ChildPath 'xpi_contents'
        if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
    }
    catch {
        Write-Host "Warning: could not remove previous artifacts: $($_.Exception.Message)"
    }
    try {
        # Create a temporary staging folder with the files to be archived (preserve directory structure)
        $outName = [IO.Path]::GetFileName($OutPath)
        $zipName = [IO.Path]::GetFileName($zipPath)
        if (-not ($exclude -contains $outName)) { $exclude += $outName }
        if (-not ($exclude -contains $zipName)) { $exclude += $zipName }

        # Create staging folder at script root to avoid nesting inside the source directory
        $tempStaging = Join-Path -Path $PSScriptRoot -ChildPath 'xpi_contents'
        if (Test-Path -LiteralPath $tempStaging) { Remove-Item -LiteralPath $tempStaging -Recurse -Force }
        New-Item -ItemType Directory -Path $tempStaging | Out-Null

        $items = Get-ChildItem -Path $SourceDir -Recurse -File -Force | Where-Object {
            -not ($exclude -contains $_.Name) -and
            ($_.FullName -notmatch '\.git')
        }
        if ($items.Count -eq 0) { Write-Error "No files to compress."; exit 1 }

        foreach ($it in $items) {
            $rel = $it.FullName.Substring($SourceDir.Length + 1)
            $dest = Join-Path -Path $tempStaging -ChildPath $rel
            $destDir = Split-Path -Path $dest -Parent
            if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Copy-Item -LiteralPath $it.FullName -Destination $dest -Force
        }

        # Create ZIP using Compress-Archive for maximum compatibility, then normalize entries if needed.
        if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
        try {
            Compress-Archive -Path (Join-Path -Path $tempStaging -ChildPath '*') -DestinationPath $zipPath -Force
        }
        catch {
            Write-Error "Compress-Archive failed: $($_.Exception.Message)"
            exit 1
        }
    }
    catch {
        Write-Error "Compress-Archive failed: $($_.Exception.Message)"
        exit 1
    }

    if ($zipPath -ne $OutPath) {
        try {
            Move-Item -LiteralPath $zipPath -Destination $OutPath -Force
        }
        catch {
            Write-Error ("Failed to rename {0} to {1}: {2}" -f $zipPath, $OutPath, $_.Exception.Message)
            exit 1
        }
    }

    Write-Host "Created XPI: $OutPath"

}
else {
    Write-Error "No files to compress."
    exit 1
}
