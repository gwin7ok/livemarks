param([string]$p = 'G:\\Cursor_Folder\\Livemarks\\scripts\\Livemarks_store.xpi')
Write-Output "Path: $p"
Write-Output 'Size (bytes):'
(Get-Item $p).Length
Write-Output ''
Write-Output 'SHA256:'
Get-FileHash -Algorithm SHA256 $p | Format-List

Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
	$z = [System.IO.Compression.ZipFile]::OpenRead($p)
	Write-Output "Entries: $($z.Entries.Count)"
	$z.Dispose()
} catch {
	Write-Output "Zip open error: $_"
}

$fs = [System.IO.File]::Open($p,'Open','Read','Read')
$buf = New-Object byte[] 1024
$read = $fs.Read($buf,0,$buf.Length)
Write-Output "ReadBytes: $read"
$fs.Close()
