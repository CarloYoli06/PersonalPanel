# scan.ps1 — Escanea usando WIA
param(
    [string]$DeviceId   = "",
    [string]$OutputPath = "$env:TEMP\albedo_scan_$(Get-Date -Format 'yyyyMMddHHmmss').png",
    [int]$DPI           = 300,
    [int]$ColorMode     = 2,   # 0=Blanco/Negro  1=Escala de grises  2=Color
    [int]$Brightness    = 0,   # -1000 a 1000
    [int]$Contrast      = 0    # -1000 a 1000
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$result = [PSCustomObject]@{ success = $false; path = ""; error = "" }

try {
    $wia    = New-Object -ComObject WIA.DeviceManager
    $device = $null

    foreach ($info in $wia.DeviceInfos) {
        if ($info.Type -eq 1) {
            if ($DeviceId -eq "" -or $info.DeviceID -eq $DeviceId) {
                $device = $info.Connect()
                break
            }
        }
    }

    if (-not $device) { throw "No se encontró ningún escáner WIA disponible." }

    $item = $device.Items(1)

    # --- Resolución ---
    try { $item.Properties.Item("6147").Value = $DPI } catch {} # WIA_IPS_XRES
    try { $item.Properties.Item("6148").Value = $DPI } catch {} # WIA_IPS_YRES

    # --- Modo color (WIA_IPA_DATATYPE = 4103) ---
    try { $item.Properties.Item("4103").Value = $ColorMode } catch {}

    # --- Bits por pixel según modo ---
    $bpp = switch ($ColorMode) { 0 { 1 } 1 { 8 } default { 24 } }
    try { $item.Properties.Item("4104").Value = $bpp } catch {} # WIA_IPA_DEPTH

    # --- Brillo y contraste ---
    try { $item.Properties.Item("4110").Value = $Brightness } catch {} # WIA_IPA_BRIGHTNESS
    try { $item.Properties.Item("4111").Value = $Contrast   } catch {} # WIA_IPA_CONTRAST

    # --- Asegurar directorio destino ---
    $dir = [System.IO.Path]::GetDirectoryName($OutputPath)
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    # --- Transferir imagen (PNG) ---
    # GUID PNG: {B96B3CB0-0728-11D3-9D7B-0000F81EF32E}
    $image = $item.Transfer("{B96B3CB0-0728-11D3-9D7B-0000F81EF32E}")
    $image.SaveFile($OutputPath)

    $result.success = $true
    $result.path    = $OutputPath

} catch {
    $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Depth 2
