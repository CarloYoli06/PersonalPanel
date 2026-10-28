# scan-native.ps1 — Escanea usando WIA.CommonDialog (el mismo motor que "Fax y Escáner de Windows")
# Este modo abre el selector nativo de Windows para elegir el escáner y escanear.
# Funciona con CUALQUIER escáner que Windows pueda detectar, incluyendo WiFi/red.
param(
    [string]$OutputPath = "$env:TEMP\albedo_native_$(Get-Date -Format 'yyyyMMddHHmmss').png"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$result = [PSCustomObject]@{ success = $false; path = ""; error = "" }

try {
    # Asegurar directorio de destino
    $dir = [System.IO.Path]::GetDirectoryName($OutputPath)
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    # WIA.CommonDialog — el mismo objeto que usa internamente "Fax y Escáner de Windows"
    $dialog = New-Object -ComObject WIA.CommonDialog

    # ShowAcquireImage:
    #   DeviceType     = 1 (Scanner)
    #   Intent         = 1 (Color) — el usuario verá las opciones en el diálogo
    #   Bias           = 4 (MaximumQuality)
    #   FormatID       = PNG
    #   AlwaysSelectDevice = $true (siempre mostrar selector de escáner)
    #   UseCommonUI    = $true (usar UI nativa de Windows)
    #   CancelError    = $false (no lanzar error si el usuario cancela)
    $pngGuid = "{B96B3CB0-0728-11D3-9D7B-0000F81EF32E}"

    $image = $dialog.ShowAcquireImage(
        1,        # ScannerDeviceType
        1,        # ColorIntent
        4,        # MaximumQuality
        $pngGuid, # PNG format
        $true,    # AlwaysSelectDevice
        $true,    # UseCommonUI
        $false    # CancelError
    )

    if ($null -eq $image) {
        $result.error = "CANCELLED"
    } else {
        $image.SaveFile($OutputPath)
        $result.success = $true
        $result.path    = $OutputPath
    }

} catch {
    $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Depth 2
