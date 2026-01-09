Param([string]$zipPath = 'G:\\Cursor_Folder\\Livemarks\\Livemarks_test.xpi')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
foreach ($e in $zip.Entries) {
    $name = $e.FullName
    $chars = ($name.ToCharArray() | ForEach-Object { [int]$_ }) -join ','
    Write-Output ("ENTRY: $name  (len=$($e.Length))  CHARS: $chars")
}
$zip.Dispose()
