Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\public\icons'
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

function New-DevForgeIcon {
    param([int]$Size, [string]$FileName)

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bitmap.SetResolution(144, 144)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $bounds = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bounds,
        [System.Drawing.ColorTranslator]::FromHtml('#6D5DFB'),
        [System.Drawing.ColorTranslator]::FromHtml('#1D4ED8'),
        42
    )
    $graphics.FillRectangle($gradient, $bounds)

    # Subtle cyan light gives the tile depth without compromising small-size clarity.
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse([int]($Size * .48), [int](-$Size * .22), [int]($Size * .78), [int]($Size * .78))
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(115, 94, 234, 212)
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 94, 234, 212))
    $graphics.FillPath($glowBrush, $glowPath)

    # Bold geometric DevForge monogram, sized inside the Android maskable safe zone.
    $mark = New-Object System.Drawing.Drawing2D.GraphicsPath
    $mark.StartFigure()
    $mark.AddPolygon(@(
        [System.Drawing.PointF]::new([single]($Size * .235), [single]($Size * .225)),
        [System.Drawing.PointF]::new([single]($Size * .690), [single]($Size * .225)),
        [System.Drawing.PointF]::new([single]($Size * .765), [single]($Size * .305)),
        [System.Drawing.PointF]::new([single]($Size * .690), [single]($Size * .385)),
        [System.Drawing.PointF]::new([single]($Size * .405), [single]($Size * .385)),
        [System.Drawing.PointF]::new([single]($Size * .405), [single]($Size * .775)),
        [System.Drawing.PointF]::new([single]($Size * .235), [single]($Size * .775))
    ))
    $mark.CloseFigure()
    $mark.StartFigure()
    $mark.AddPolygon(@(
        [System.Drawing.PointF]::new([single]($Size * .405), [single]($Size * .485)),
        [System.Drawing.PointF]::new([single]($Size * .665), [single]($Size * .485)),
        [System.Drawing.PointF]::new([single]($Size * .720), [single]($Size * .555)),
        [System.Drawing.PointF]::new([single]($Size * .665), [single]($Size * .625)),
        [System.Drawing.PointF]::new([single]($Size * .405), [single]($Size * .625))
    ))
    $mark.CloseFigure()
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.FillPath($white, $mark)

    $path = Join-Path $outputDirectory $FileName
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $white.Dispose(); $mark.Dispose(); $glowBrush.Dispose(); $glowPath.Dispose()
    $gradient.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-DevForgeIcon -Size 96 -FileName 'icon-96.png'
New-DevForgeIcon -Size 192 -FileName 'icon-192.png'
New-DevForgeIcon -Size 512 -FileName 'icon-512.png'
New-DevForgeIcon -Size 512 -FileName 'icon-maskable-512.png'
New-DevForgeIcon -Size 180 -FileName 'apple-touch-icon.png'
