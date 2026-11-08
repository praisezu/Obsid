# Builds ObsidInstaller.exe with the C# compiler that ships with Windows (no SDK needed).
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe" }
if (-not (Test-Path $csc)) { throw "C# compiler not found (.NET Framework 4.x is required)." }

# --- Generate obsid.ico (PNG-compressed entries) from the same gem drawing used in the app.
Add-Type -AssemblyName System.Drawing
$facets = @(
    @(@(16,2,28,11,23,30,9,30,4,11), "#2a1f3d"),
    @(@(16,2,28,11,16,15), "#a78bfa"),
    @(@(16,2,16,15,4,11), "#7c3aed"),
    @(@(4,11,16,15,9,30), "#4c1d95"),
    @(@(28,11,23,30,16,15), "#5b21b6"),
    @(@(16,15,23,30,9,30), "#3b1a6e")
)
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = $size / 32.0
    foreach ($f in $facets) {
        $c = $f[0]
        $pts = for ($i = 0; $i -lt $c.Count; $i += 2) { New-Object System.Drawing.PointF ($c[$i] * $s), ($c[$i + 1] * $s) }
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($f[1]))
        $g.FillPolygon($brush, [System.Drawing.PointF[]]$pts)
        $brush.Dispose()
    }
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    , $ms.ToArray()
}
$ico = Join-Path $here "obsid.ico"
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$images[$i].Length); $w.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($img in $images) { $w.Write([byte[]]$img) }
$w.Flush()
[System.IO.File]::WriteAllBytes($ico, $out.ToArray())

# --- Compile
$exe = Join-Path $root "ObsidInstaller.exe"
& $csc /nologo /target:winexe /optimize+ /platform:anycpu `
    "/out:$exe" "/win32icon:$ico" `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Core.dll `
    (Join-Path $here "ObsidInstaller.cs")
if ($LASTEXITCODE -ne 0) { throw "Compile failed." }
Write-Host "Built $exe"
