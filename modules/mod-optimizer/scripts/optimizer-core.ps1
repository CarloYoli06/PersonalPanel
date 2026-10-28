param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("get_metrics", "scan_cleaning", "clean_targets", "get_privacy", "apply_privacy", "get_visual", "apply_visual", "list_startup", "toggle_startup", "trim_memory")]
    [string]$Action,
    [string]$PayloadBase64 = "",
    [string]$PayloadJson = "{}"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

function Get-Metrics {
    $os = Get-CimInstance Win32_OperatingSystem
    $totalRam = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
    $freeRam = [math]::Round($os.FreePhysicalMemory / 1024, 0)
    $usedRam = $totalRam - $freeRam

    $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    if ($null -eq $cpu) { $cpu = 0 }

    $drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue
    $freeDisk = 0
    $totalDisk = 0
    if ($drive) {
        $freeDisk = [math]::Round($drive.Free / 1GB, 1)
        $totalDisk = [math]::Round(($drive.Used + $drive.Free) / 1GB, 1)
    }

    @{
        cpuUsagePercent = [math]::Round($cpu, 0)
        totalRamMb = $totalRam
        usedRamMb = $usedRam
        freeRamMb = $freeRam
        systemDriveFreeGb = $freeDisk
        systemDriveTotalGb = $totalDisk
    }
}

function Get-FolderSize($path) {
    if (-not (Test-Path $path)) { return 0 }
    $measure = Get-ChildItem -Path $path -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    if ($null -eq $measure.Sum) { return 0 }
    return [int64]$measure.Sum
}

function Scan-Cleaning {
    $tempUser = [System.IO.Path]::GetTempPath()
    $tempWin = "$env:SystemRoot\Temp"
    $prefetch = "$env:SystemRoot\Prefetch"
    $softDist = "$env:SystemRoot\SoftwareDistribution\Download"

    $results = @(
        @{ id = "temp_user"; name = "Archivos Temporales de Usuario"; description = "Caché de aplicaciones locales y datos temporales"; sizeBytes = (Get-FolderSize $tempUser); requiresAdmin = $false },
        @{ id = "temp_windows"; name = "Temporales de Windows"; description = "Archivos temporales del sistema operativo"; sizeBytes = (Get-FolderSize $tempWin); requiresAdmin = $true },
        @{ id = "prefetch"; name = "Caché Prefetch"; description = "Índice de precarga de ejecutables antiguos"; sizeBytes = (Get-FolderSize $prefetch); requiresAdmin = $true },
        @{ id = "windows_update"; name = "Descargas de Windows Update"; description = "Instaladores residuales de actualizaciones ya aplicadas"; sizeBytes = (Get-FolderSize $softDist); requiresAdmin = $true }
    )
    return $results
}

function Clean-Targets($targets) {
    $freed = 0
    foreach ($target in $targets) {
        $path = switch ($target) {
            "temp_user"      { [System.IO.Path]::GetTempPath() }
            "temp_windows"   { "$env:SystemRoot\Temp" }
            "prefetch"       { "$env:SystemRoot\Prefetch" }
            "windows_update" { "$env:SystemRoot\SoftwareDistribution\Download" }
            default          { $null }
        }
        if ($path -and (Test-Path $path)) {
            $before = Get-FolderSize $path
            Get-ChildItem -Path $path -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            $after = Get-FolderSize $path
            $freed += [math]::Max(0, $before - $after)
        }
    }
    @{ success = $true; freedBytes = $freed; message = "Limpieza completada correctamente." }
}

function Get-Privacy {
    $diagTrackSvc = Get-Service -Name "DiagTrack" -ErrorAction SilentlyContinue
    $diagTrackDisabled = ($diagTrackSvc -and $diagTrackSvc.StartType -eq 'Disabled')

    $advReg = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" -Name "Enabled" -ErrorAction SilentlyContinue
    $advDisabled = ($advReg -and $advReg.Enabled -eq 0)

    $feedbackReg = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Siuf\Rules" -Name "NumberOfSIUFInPeriod" -ErrorAction SilentlyContinue
    $feedbackDisabled = ($feedbackReg -and $feedbackReg.NumberOfSIUFInPeriod -eq 0)

    @{
        disableDiagTrack = [bool]$diagTrackDisabled
        disableAdvertisingId = [bool]$advDisabled
        disableFeedback = [bool]$feedbackDisabled
        disableCortana = $true
    }
}

function Apply-Privacy($cfg) {
    try {
        if ($cfg.disableDiagTrack) {
            Stop-Service -Name "DiagTrack" -Force -ErrorAction SilentlyContinue
            Set-Service -Name "DiagTrack" -StartupType Disabled -ErrorAction SilentlyContinue
            
            $telemetryPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection"
            if (-not (Test-Path $telemetryPath)) { New-Item -Path $telemetryPath -Force | Out-Null }
            Set-ItemProperty -Path $telemetryPath -Name "AllowTelemetry" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        }

        if ($cfg.disableAdvertisingId) {
            $advPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo"
            if (-not (Test-Path $advPath)) { New-Item -Path $advPath -Force | Out-Null }
            Set-ItemProperty -Path $advPath -Name "Enabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        }

        if ($cfg.disableFeedback) {
            $siufPath = "HKCU:\Software\Microsoft\Siuf\Rules"
            if (-not (Test-Path $siufPath)) { New-Item -Path $siufPath -Force | Out-Null }
            Set-ItemProperty -Path $siufPath -Name "NumberOfSIUFInPeriod" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        }

        @{ success = $true; message = "Ajustes de privacidad y telemetría aplicados." }
    } catch {
        @{ success = $false; error = $_.Exception.Message }
    }
}

function Get-Visual {
    $minAnimate = (Get-ItemProperty -Path "HKCU:\Control Panel\Desktop\WindowMetrics" -Name "MinAnimate" -ErrorAction SilentlyContinue).MinAnimate
    $transparency = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" -Name "EnableTransparency" -ErrorAction SilentlyContinue).EnableTransparency
    
    @{
        disableWindowAnimations = ($minAnimate -eq "0")
        disableTransparency = ($transparency -eq 0)
        disableTaskbarAnimations = $false
    }
}

function Apply-Visual($cfg) {
    try {
        $desktopPath = "HKCU:\Control Panel\Desktop\WindowMetrics"
        if ($cfg.disableWindowAnimations) {
            Set-ItemProperty -Path $desktopPath -Name "MinAnimate" -Value "0" -Force -ErrorAction SilentlyContinue
        } else {
            Set-ItemProperty -Path $desktopPath -Name "MinAnimate" -Value "1" -Force -ErrorAction SilentlyContinue
        }

        if ($cfg.disableTransparency) {
            Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" -Name "EnableTransparency" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        } else {
            Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" -Name "EnableTransparency" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        }

        @{ success = $true; message = "Ajustes de rendimiento visual configurados." }
    } catch {
        @{ success = $false; error = $_.Exception.Message }
    }
}

function List-Startup {
    $apps = @()
    
    # 1. HKCU Run
    $hkcuPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $hkcuProps = Get-ItemProperty -Path $hkcuPath -ErrorAction SilentlyContinue
    if ($hkcuProps) {
        $hkcuProps.PSObject.Properties | Where-Object { $_.Name -notmatch "^PS" } | ForEach-Object {
            $apps += @{
                id = $_.Name
                name = $_.Name
                command = [string]$_.Value
                location = "HKCU"
                enabled = $true
                impact = "medium"
            }
        }
    }

    # 2. HKLM Run
    $hklmPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
    $hklmProps = Get-ItemProperty -Path $hklmPath -ErrorAction SilentlyContinue
    if ($hklmProps) {
        $hklmProps.PSObject.Properties | Where-Object { $_.Name -notmatch "^PS" } | ForEach-Object {
            $apps += @{
                id = $_.Name
                name = $_.Name
                command = [string]$_.Value
                location = "HKLM"
                enabled = $true
                impact = "high"
            }
        }
    }

    return $apps
}

function Toggle-Startup($payload) {
    try {
        $keyPath = if ($payload.location -eq "HKLM") { "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run" } else { "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" }
        $backupPath = if ($payload.location -eq "HKLM") { "HKLM:\Software\Microsoft\Windows\CurrentVersion\PersonalPanel_DisabledRun" } else { "HKCU:\Software\Microsoft\Windows\CurrentVersion\PersonalPanel_DisabledRun" }

        if (-not (Test-Path $backupPath)) { New-Item -Path $backupPath -Force | Out-Null }

        if ($payload.enable) {
            $val = (Get-ItemProperty -Path $backupPath -Name $payload.id -ErrorAction SilentlyContinue).$($payload.id)
            if ($val) {
                Set-ItemProperty -Path $keyPath -Name $payload.id -Value $val -Force -ErrorAction SilentlyContinue
                Remove-ItemProperty -Path $backupPath -Name $payload.id -Force -ErrorAction SilentlyContinue
            }
        } else {
            $val = (Get-ItemProperty -Path $keyPath -Name $payload.id -ErrorAction SilentlyContinue).$($payload.id)
            if ($val) {
                Set-ItemProperty -Path $backupPath -Name $payload.id -Value $val -Force -ErrorAction SilentlyContinue
                Remove-ItemProperty -Path $keyPath -Name $payload.id -Force -ErrorAction SilentlyContinue
            }
        }
        @{ success = $true; message = "Estado de inicio actualizado." }
    } catch {
        @{ success = $false; error = $_.Exception.Message }
    }
}

function Trim-Memory {
    try {
        Add-Type -MemberDefinition '[DllImport("psapi.dll")] public static extern int EmptyWorkingSet(IntPtr hwProc);' -Name "MemUtil" -Namespace "Win32" -ErrorAction SilentlyContinue
        Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.ProcessName -notmatch "^(Idle|System|Registry|smss|csrss|wininit|services|lsass)$" } | ForEach-Object {
            try { [Win32.MemUtil]::EmptyWorkingSet($_.Handle) | Out-Null } catch {}
        }
    } catch {}
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    @{ success = $true; message = "Memoria RAM de trabajo optimizada y buffers liberados." }
}

if ($PayloadBase64 -and $PayloadBase64.Length -gt 0) {
    $DecodedJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PayloadBase64))
    $payload = $DecodedJson | ConvertFrom-Json -ErrorAction SilentlyContinue
} else {
    $payload = $PayloadJson | ConvertFrom-Json -ErrorAction SilentlyContinue
}

$output = switch ($Action) {
    "get_metrics"     { Get-Metrics }
    "scan_cleaning"   { Scan-Cleaning }
    "clean_targets"   { Clean-Targets ($payload.categories) }
    "get_privacy"     { Get-Privacy }
    "apply_privacy"   { Apply-Privacy ($payload) }
    "get_visual"      { Get-Visual }
    "apply_visual"    { Apply-Visual ($payload) }
    "list_startup"    { List-Startup }
    "toggle_startup"  { Toggle-Startup ($payload) }
    "trim_memory"     { Trim-Memory }
    default           { @{ error = "Acción no soportada" } }
}

$output | ConvertTo-Json -Depth 5 -Compress

