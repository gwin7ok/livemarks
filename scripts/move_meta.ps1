$root = Get-Location
$src = Join-Path $root 'livemarks'
$candidates = @('.github','.tx','.eslintignore','.eslintrc.js','.gitignore','.npmrc','renovate.json','README.md','LICENSE','package.json')
foreach ($name in $candidates) {
    $p = Join-Path $src $name
    if (Test-Path $p) {
        Write-Host "Moving: $name"
        Move-Item -LiteralPath $p -Destination (Join-Path $root $name) -Force
    } else {
        Write-Host "Not found: $name"
    }
}
# remove any staging dirs
if (Test-Path (Join-Path $root 'xpi_contents')) {
    Remove-Item (Join-Path $root 'xpi_contents') -Recurse -Force
    Write-Host 'Removed xpi_contents in root'
}
if (Test-Path (Join-Path $src 'xpi_contents')) {
    Remove-Item (Join-Path $src 'xpi_contents') -Recurse -Force
    Write-Host 'Removed xpi_contents in livemarks'
}
Write-Host '--- Root now:'
Get-ChildItem -LiteralPath $root -Force | Sort-Object @{Expression={$_.PSIsContainer};Descending=$true},Name | ForEach-Object { Write-Host $_.Name }
