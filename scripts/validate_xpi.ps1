Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Get-Location).Path
$zipPath = Join-Path $root 'Livemarks.xpi'
if (-not (Test-Path $zipPath)) { Write-Error "XPI not found: $zipPath"; exit 2 }
$z = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entries = $z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()

# Normalize entries to forward slash and remove trailing slashes
$norm = $entries | ForEach-Object { ($_ -replace '\\','/') -replace '/+$','' }

$errors = @()
# Check manifest at root
if (-not ($norm -contains 'manifest.json')) { $errors += 'manifest.json missing at XPI root' }
# Check for unwanted top-level folders
$top = $norm | ForEach-Object { $_.Split('/')[0] } | Where-Object { $_ -ne '' } | Sort-Object -Unique
if ($top -contains 'xpi_contents') { $errors += 'xpi_contents present at top level' }
if ($top -contains 'livemarks') { $errors += 'livemarks present at top level' }

# Load manifest from workspace (source) to inspect referenced files
$srcManifestPath = Join-Path $root 'livemarks\manifest.json'
if (-not (Test-Path $srcManifestPath)) { $errors += 'Source manifest livemarks\manifest.json not found' }
else {
    $manifest = Get-Content $srcManifestPath -Raw | ConvertFrom-Json
    # Background scripts
    if ($manifest.background -and $manifest.background.scripts) {
        foreach ($s in $manifest.background.scripts) {
            if (-not ($norm -contains $s)) { $errors += "Missing background script in XPI: $s" }
        }
    }
    # Content scripts
    if ($manifest.content_scripts) {
        foreach ($cs in $manifest.content_scripts) {
            foreach ($s in $cs.js) { if (-not ($norm -contains $s)) { $errors += "Missing content_script js: $s" } }
        }
    }
    # Options UI page
    if ($manifest.options_ui -and $manifest.options_ui.page) {
        $p = $manifest.options_ui.page
        if (-not ($norm -contains $p)) { $errors += "Missing options page: $p" }
    }
    # Page action popup
    if ($manifest.page_action -and $manifest.page_action.default_popup) {
        $pp = $manifest.page_action.default_popup
        if (-not ($norm -contains $pp)) { $errors += "Missing page_action popup: $pp" }
    }
    # Icons
    if ($manifest.icons) {
        foreach ($k in $manifest.icons.PSObject.Properties.Name) {
            $icon = $manifest.icons.$k
            if (-not ($norm -contains $icon)) { $errors += "Missing icon: $icon" }
        }
    }
    # Locales: default_locale
    $def = $manifest.default_locale
    if ($def) {
        $localeEntry = "_locales/$def/messages.json"
        if (-not ($norm -contains $localeEntry)) { $errors += "Missing default locale messages: $localeEntry" }
    }
}

if ($errors.Count -eq 0) {
    Write-Host "Validation passed: XPI structure looks correct." -ForegroundColor Green
    Write-Host "Top-level entries:"; $top | ForEach-Object { Write-Host " - $_" }
    exit 0
} else {
    Write-Host "Validation FAILED:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host " - $_" }
    Write-Host "Top-level entries:"; $top | ForEach-Object { Write-Host " - $_" }
    exit 1
}
