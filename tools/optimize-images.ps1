# Creates web-optimized JPEG copies of the source photos in assets/img.
# Source files in "picture for project" are only read, never modified.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File tools\optimize-images.ps1

Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root 'picture for project'
$outDir = Join-Path $root 'assets\img'
New-Item -ItemType Directory -Force $outDir | Out-Null

# Source file (by timestamp in its name) -> short web name
$map = [ordered]@{
  '22_16_43' = 'interior'
  '22_20_33' = 'steak'
  '22_21_16' = 'pasta'
  '22_22_15' = 'pizza'
  '22_22_51' = 'risotto'
  '22_23_58' = 'lasagna'
  '22_24_45' = 'tiramisu'
  '22_25_41' = 'bar'
}

# Output widths: large for hero / lightbox, small for cards
$sizes = @{ '' = 1920; '-sm' = 800 }

$codec  = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 80L

foreach ($key in $map.Keys) {
  $file = Get-ChildItem -LiteralPath $srcDir -Filter "*$key*.png" | Select-Object -First 1
  if (-not $file) { Write-Warning "Not found: $key"; continue }

  $img = [System.Drawing.Image]::FromFile($file.FullName)
  try {
    foreach ($suffix in $sizes.Keys) {
      $w = [Math]::Min($sizes[$suffix], $img.Width)
      $h = [int]($img.Height * $w / $img.Width)
      $bmp = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.DrawImage($img, 0, 0, $w, $h)
      $out = Join-Path $outDir ("{0}{1}.jpg" -f $map[$key], $suffix)
      $bmp.Save($out, $codec, $params)
      $g.Dispose(); $bmp.Dispose()
      Write-Host ("{0,-22} {1}x{2}" -f (Split-Path -Leaf $out), $w, $h)
    }
  } finally {
    $img.Dispose()
  }
}
