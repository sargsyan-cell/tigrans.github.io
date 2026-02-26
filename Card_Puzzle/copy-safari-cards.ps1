# Copy 8 Safari album images to assets/cards/ as safari_0.png ... safari_7.png
# Usage:
#   .\copy-safari-cards.ps1 "C:\path\to\folder\with\8\images"
#   (Images in folder must be 8 PNG files; they will be used in alphabetical order.)
# Or drag-and-drop a folder onto this script.

param(
  [Parameter(Mandatory=$false)]
  [string]$SourceFolder
)

$destDir = Join-Path $PSScriptRoot "assets\cards"
if (-not (Test-Path $destDir)) {
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

if (-not $SourceFolder) {
  Write-Host "Usage: .\copy-safari-cards.ps1 ""C:\path\to\folder\with\8\images"""
  Write-Host "The folder should contain 8 PNG files (any names). They will be copied in alphabetical order as safari_0.png ... safari_7.png"
  exit 1
}

$files = Get-ChildItem -Path $SourceFolder -Filter "*.png" | Sort-Object Name
if ($files.Count -lt 8) {
  Write-Host "Found $($files.Count) PNG file(s). Need 8. Add more images to the folder."
  exit 1
}

for ($i = 0; $i -lt 8; $i++) {
  $destPath = Join-Path $destDir "safari_$i.png"
  Copy-Item $files[$i].FullName $destPath -Force
  Write-Host "Copied: safari_$i.png"
}
Write-Host "Done. Refresh the game to see Safari card images."
