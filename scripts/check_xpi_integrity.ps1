Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path (Get-Location).Path 'Livemarks.xpi'
if (-not (Test-Path $zip)) { Write-Error "XPI not found: $zip"; exit 2 }
$errors = @()
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    foreach ($e in $z.Entries) {
        try {
            $name = $e.FullName
            $info = "Entry: $name (Length=$($e.Length) Compressed=$($e.CompressedLength))"
            Write-Host $info
            # Read entire entry as text (avoid multiple opens which can duplicate data)
            $reader = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8, $true)
            $entryContent = $reader.ReadToEnd()
            $reader.Close()

            if ($name -ieq 'manifest.json') {
                try { $null = $entryContent | ConvertFrom-Json } catch { $errors += "manifest.json parse error: $($_.Exception.Message)" }
            }
            if ($name -like '_locales/*/messages.json') {
                try { $null = $entryContent | ConvertFrom-Json } catch { $errors += "$name parse error: $($_.Exception.Message)" }
            }
        } catch {
            $errors += "Failed to read entry $($e.FullName): $($_.Exception.Message)"
        }
    }
} finally { $z.Dispose() }

if ($errors.Count -eq 0) { Write-Host 'XPI integrity check passed.'; exit 0 } else { Write-Host 'XPI integrity check FAILED'; $errors | ForEach-Object { Write-Host " - $_" }; exit 1 }