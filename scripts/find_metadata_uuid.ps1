$root='G:\xkvvo1ku.main2forG'
$outPaths='metadata_v2_paths.txt'
$outMatches='metadata_v2_uuid_matches.txt'

# Collect files
$files=Get-ChildItem -Path $root -Recurse -Force -Filter '.metadata-v2' -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Sort-Object
$files | Tee-Object -FilePath $outPaths | Out-Null

$uuid='3724a998-a5cb-4d6c-b71a-458ae2deb3fd'
$encs=@([System.Text.Encoding]::UTF8,[System.Text.Encoding]::Unicode,[System.Text.Encoding]::BigEndianUnicode)

# initialize output
'' | Out-File -FilePath $outMatches -Encoding UTF8

foreach($f in $files){
  $textMatch='no'
  try{
    if(Select-String -Path $f -Pattern $uuid -SimpleMatch -Quiet){ $textMatch='yes' }
  } catch { }

  $binMatch='no'
  try{
    $bytes=[System.IO.File]::ReadAllBytes($f)
    foreach($enc in $encs){
      $needle=$enc.GetBytes($uuid)
      if($needle.Length -le $bytes.Length){
        for($i=0;$i -le $bytes.Length-$needle.Length;$i++){
          $ok=$true
          for($j=0;$j -lt $needle.Length;$j++){ if($bytes[$i+$j] -ne $needle[$j]){ $ok=$false; break } }
          if($ok){ $binMatch='yes'; break }
        }
      }
      if($binMatch -eq 'yes'){ break }
    }
  } catch { }

  "$f|text=$textMatch|binary=$binMatch" | Out-File -FilePath $outMatches -Append -Encoding UTF8
}

Write-Output 'RESULTS:'
$matches = Get-Content $outMatches | Select-String -Pattern 'text=yes|binary=yes' -SimpleMatch
if($matches){ $matches | ForEach-Object { $_.ToString() } } else { Write-Output 'No matches' }
