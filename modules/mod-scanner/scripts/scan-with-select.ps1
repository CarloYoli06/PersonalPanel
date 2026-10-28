# scan-with-select.ps1
# Primera vez: muestra selector de dispositivo, guarda el ID
# Siguiente veces: usa el ID guardado, escanea DIRECTAMENTE sin diálogo
param(
    [string]$DeviceId   = "",   # Si está vacío → muestra selector
    [string]$OutputPath = "$env:TEMP\albedo_scan_$(Get-Date -Format 'yyyyMMddHHmmss').png",
    [int]$DPI           = 300,
    [int]$ColorMode     = 2,    # 0=BN  1=Grises  2=Color
    [int]$Brightness    = 0,
    [int]$Contrast      = 0
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

$result = [PSCustomObject]@{
    success    = $false
    path       = ""
    deviceId   = ""
    deviceName = ""
    error      = ""
}

function Invoke-Scan($device) {
    $item = $device.Items(1)

    try { $item.Properties.Item("6147").Value = $DPI        } catch {} # X res
    try { $item.Properties.Item("6148").Value = $DPI        } catch {} # Y res
    try { $item.Properties.Item("4103").Value = $ColorMode  } catch {} # DataType
    $bpp = switch ($ColorMode) { 0 { 1 } 1 { 8 } default { 24 } }
    try { $item.Properties.Item("4104").Value = $bpp        } catch {} # BitsPerPixel
    try { $item.Properties.Item("4110").Value = $Brightness } catch {} # Brightness
    try { $item.Properties.Item("4111").Value = $Contrast   } catch {} # Contrast

    $dir = [System.IO.Path]::GetDirectoryName($OutputPath)
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    # PNG: {B96B3CB0-0728-11D3-9D7B-0000F81EF32E}
    $img = $item.Transfer("{B96B3CB0-0728-11D3-9D7B-0000F81EF32E}")
    $img.SaveFile($OutputPath)
}

try {
    $wia    = New-Object -ComObject WIA.DeviceManager
    $device = $null
    $dName  = ""

    # ── Intentar usar el dispositivo guardado ─────────────────────────────────
    if ($DeviceId -ne "") {
        foreach ($info in $wia.DeviceInfos) {
            if ($info.DeviceID -eq $DeviceId) {
                $device = $info.Connect()
                try { $dName = $info.Properties.Item("Name").Value } catch {}
                break
            }
        }
    }

    # ── Si no hay dispositivo guardado → mostrar selector UNA VEZ ────────────
    if ($null -eq $device) {
        $dialog  = New-Object -ComObject WIA.CommonDialog
        $selDev  = $dialog.ShowSelectDevice(1, $true, $false)  # Scanner, AlwaysSelect

        if ($null -eq $selDev) {
            $result.error = "CANCELLED"
            $result | ConvertTo-Json -Depth 2
            exit 0
        }

        $device   = $selDev
        $DeviceId = $device.DeviceID
        try { $dName = $device.Properties.Item("Name").Value } catch {
            try { $dName = $device.Properties.Item("7216").Value } catch {}
        }
    }

    # ── Escanear con nuestras propias configuraciones ─────────────────────────
    Invoke-Scan $device

    $result.success    = $true
    $result.path       = $OutputPath
    $result.deviceId   = $DeviceId
    $result.deviceName = $dName

} catch {
    $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Depth 2
