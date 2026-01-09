Param([string]$zipPath = 'G:\\Cursor_Folder\\Livemarks\\Livemarks_test.xpi')
Add-Type -AssemblyName System.IO.Compression.FileSystem
Write-Output "Zip: $zipPath"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$zip.Entries | ForEach-Object { "{0} (len={1})" -f $_.FullName,$_.Length } | Write-Output
Write-Output '--- Locales matching entries ---'
$zip.Entries | Where-Object { $_.FullName -like '*_locales/*' } | ForEach-Object { "{0} (len={1})" -f $_.FullName,$_.Length } | Write-Output
Write-Output '--- Entries containing backslash \'
$zip.Entries | Where-Object { $_.FullName -like '*\\*' } | ForEach-Object { "{0} (len={1})" -f $_.FullName,$_.Length } | Write-Output
Write-Output '--- Try GetEntry for _locales/en/messages.json ---'
$entry = $zip.GetEntry('_locales/en/messages.json')
if ($entry) {
    Write-Output "Found entry: $($entry.FullName) length=$($entry.Length)"
    $sr = New-Object System.IO.StreamReader($entry.Open())
    $content = $sr.ReadToEnd()
    $sr.Close()
    Write-Output ("First400:" + $content.Substring(0,[math]::Min(400,$content.Length)))
} else {
    Write-Output 'GetEntry returned null'
    $zip.Entries | Where-Object { $_.FullName -like '*_locales*' } | ForEach-Object { $_.FullName } | Write-Output
}
$zip.Dispose()
