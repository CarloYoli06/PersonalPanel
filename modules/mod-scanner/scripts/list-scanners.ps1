# list-scanners.ps1 — Lista dispositivos WIA (incluyendo escáneres WiFi/red)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

$result = @()

try {
    $wia = New-Object -ComObject WIA.DeviceManager

    foreach ($info in $wia.DeviceInfos) {
        # Tipo 1 = Escáner (incluye escáneres USB y de red vía WSD/WIA proxy)
        # Algunos escáneres WiFi se registran como tipo 0 (desconocido) o con drivers WIA proxy
        $name = ""
        try { $name = $info.Properties.Item("Name").Value }        catch {}
        try { if (-not $name) { $name = $info.Properties.Item("7216").Value } } catch {}
        try { if (-not $name) { $name = $info.Properties.Item("Description").Value } } catch {}
        if (-not $name) { $name = "Dispositivo WIA ($($info.DeviceID))" }

        $type = $info.Type
        # Incluir tipo 1 (escáner) y tipo 0 (desconocido, algunos WiFi)
        if ($type -eq 1 -or $type -eq 0) {
            $result += [PSCustomObject]@{
                id   = $info.DeviceID
                name = $name
                type = $type
            }
        }
    }
} catch {
    # En lugar de fallar, devolvemos el error como parte del JSON para debugging
    $result += [PSCustomObject]@{
        id   = "__error__"
        name = "Error WIA: $($_.Exception.Message)"
        type = -1
    }
}

# Siempre devolver array JSON válido
if ($result.Count -eq 0) {
    Write-Output "[]"
} else {
    , $result | ConvertTo-Json -Depth 3 -Compress
}
