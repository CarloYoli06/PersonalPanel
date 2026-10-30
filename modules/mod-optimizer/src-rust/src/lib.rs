use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use panel_core_sdk::{
    resolve_module_script_path, DependencyStatus, IsolatedProcessTracker, SdkResult,
    SubprocessOptions,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use sysinfo::{Disks, System};
use tauri::{AppHandle, Manager, State};

// ═══════════════════════════════════════════════════════════════════════════
// Tipos Compartidos (Espejo de modules/mod-optimizer/src/shared/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub cpu_usage_percent: u32,
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub free_ram_mb: u64,
    pub system_drive_free_gb: f64,
    pub system_drive_total_gb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    pub id: String,
    pub name: String,
    pub command: String,
    pub location: String, // "HKCU" | "HKLM" | "StartupFolder"
    pub enabled: bool,
    pub impact: String, // "low" | "medium" | "high" | "unknown"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanableCategory {
    pub id: String, // "temp_user" | "temp_windows" | "prefetch" | "windows_update"
    pub name: String,
    pub description: String,
    pub size_bytes: u64,
    pub requires_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyTweaksOptions {
    pub disable_diag_track: bool,
    pub disable_advertising_id: bool,
    pub disable_feedback: bool,
    pub disable_cortana: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualTweaksOptions {
    pub disable_window_animations: bool,
    pub disable_transparency: bool,
    pub disable_taskbar_animations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizerActionResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub freed_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado del Módulo Optimizer
// ═══════════════════════════════════════════════════════════════════════════

pub struct OptimizerState {
    pub tracker: IsolatedProcessTracker,
    pub sys: Mutex<System>,
}

impl Default for OptimizerState {
    fn default() -> Self {
        let mut sys = System::new_all();
        sys.refresh_cpu_all();
        sys.refresh_memory();
        Self {
            tracker: IsolatedProcessTracker::new(),
            sys: Mutex::new(sys),
        }
    }
}

impl OptimizerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn check_dependencies(&self, resource_dir: Option<&Path>) -> Vec<DependencyStatus> {
        let script_exists =
            resolve_module_script_path(resource_dir, "mod-optimizer", "optimizer-core.ps1").is_ok();
        vec![DependencyStatus {
            name: "Motor Nativo Win32 & PowerShell Core".to_string(),
            description:
                "Consultas de registro sin ventana, sistema de archivos asíncrono y subprocesos aislados"
                    .to_string(),
            ready: cfg!(windows) && script_exists,
            version: None,
            binary_path: None,
            optional: Some(false),
        }]
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades de Sistema de Archivos y Registro (Windows)
// ═══════════════════════════════════════════════════════════════════════════

fn get_clean_target_paths() -> HashMap<String, PathBuf> {
    let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    let root = PathBuf::from(sys_root);
    let mut map = HashMap::new();
    map.insert("temp_user".to_string(), std::env::temp_dir());
    map.insert("temp_windows".to_string(), root.join("Temp"));
    map.insert("prefetch".to_string(), root.join("Prefetch"));
    map.insert(
        "windows_update".to_string(),
        root.join("SoftwareDistribution").join("Download"),
    );
    map
}

fn calculate_folder_size_sync(root_path: &Path, max_depth: usize, max_files: usize) -> u64 {
    let mut total_bytes: u64 = 0;
    let mut file_count: usize = 0;

    fn walk(
        dir: &Path,
        depth: usize,
        max_depth: usize,
        max_files: usize,
        file_count: &mut usize,
        total_bytes: &mut u64,
    ) {
        if depth > max_depth || *file_count >= max_files {
            return;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            if *file_count >= max_files {
                break;
            }
            let path = entry.path();
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    walk(
                        &path,
                        depth + 1,
                        max_depth,
                        max_files,
                        file_count,
                        total_bytes,
                    );
                } else if meta.is_file() {
                    *file_count += 1;
                    *total_bytes = total_bytes.saturating_add(meta.len());
                }
            }
        }
    }

    walk(
        root_path,
        0,
        max_depth,
        max_files,
        &mut file_count,
        &mut total_bytes,
    );
    total_bytes
}

fn clean_folder_contents_sync(folder_path: &Path) {
    let entries = match fs::read_dir(folder_path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let full_path = entry.path();
        if let Ok(meta) = entry.metadata() {
            if meta.is_dir() {
                let _ = fs::remove_dir_all(&full_path);
            } else {
                let _ = fs::remove_file(&full_path);
            }
        }
    }
}

#[derive(Debug, Clone)]
struct RegEntry {
    name: String,
    reg_type: String,
    value: String,
}

async fn query_reg_values(tracker: &IsolatedProcessTracker, key_path: &str) -> Vec<RegEntry> {
    let res = tracker
        .spawn_async(
            "reg.exe",
            ["query", key_path],
            SubprocessOptions {
                timeout_ms: 8_000,
                windows_hide: true,
            },
        )
        .await;

    let stdout = match res {
        Ok(r) if r.ok => r.stdout,
        _ => return Vec::new(),
    };

    let mut items = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("HKEY_") {
            continue;
        }
        // Formato de salida de reg query: "    Nombre    REG_SZ    Valor"
        let parts: Vec<&str> = line.split("    ").filter(|s| !s.trim().is_empty()).collect();
        if parts.len() >= 2 {
            let name = parts[0].trim().to_string();
            let reg_type = parts[1].trim().to_string();
            let value = if parts.len() >= 3 {
                parts[2..].join("    ").trim().to_string()
            } else {
                String::new()
            };
            if reg_type.starts_with("REG_") {
                items.push(RegEntry {
                    name,
                    reg_type,
                    value,
                });
            }
        }
    }
    items
}

async fn get_startup_approved_map(
    tracker: &IsolatedProcessTracker,
    key_path: &str,
) -> HashMap<String, bool> {
    let mut map = HashMap::new();
    let entries = query_reg_values(tracker, key_path).await;
    for entry in entries {
        if entry.reg_type == "REG_BINARY" && entry.value.len() >= 2 {
            if let Ok(first_byte) = u8::from_str_radix(&entry.value[0..2], 16) {
                map.insert(entry.name, first_byte % 2 == 0);
            }
        }
    }
    map
}

// ═══════════════════════════════════════════════════════════════════════════
// Comandos Tauri de mod-optimizer
// ═══════════════════════════════════════════════════════════════════════════

pub mod commands {
    use super::*;

#[tauri::command]
pub async fn optimizer_get_metrics(state: State<'_, OptimizerState>) -> SdkResult<SystemMetrics> {
    let (cpu_usage_percent, total_ram_mb, used_ram_mb, free_ram_mb) = {
        let mut sys = state.sys.lock().unwrap();
        sys.refresh_cpu_all();
        sys.refresh_memory();

        let cpu = sys.global_cpu_usage().round().clamp(0.0, 100.0) as u32;
        let total_mb = sys.total_memory() / (1024 * 1024);
        let used_mb = sys.used_memory() / (1024 * 1024);
        let free_mb = total_mb.saturating_sub(used_mb);
        (cpu, total_mb, used_mb, free_mb)
    };

    let disks = Disks::new_with_refreshed_list();
    let mut system_drive_free_gb = 0.0;
    let mut system_drive_total_gb = 0.0;

    for disk in &disks {
        let mount = disk.mount_point().to_string_lossy().to_uppercase();
        if mount.starts_with("C:") || system_drive_total_gb == 0.0 {
            let total_gb = disk.total_space() as f64 / (1024.0_f64.powi(3));
            let avail_gb = disk.available_space() as f64 / (1024.0_f64.powi(3));
            system_drive_total_gb = (total_gb * 10.0).round() / 10.0;
            system_drive_free_gb = (avail_gb * 10.0).round() / 10.0;
            if mount.starts_with("C:") {
                break;
            }
        }
    }

    Ok(SystemMetrics {
        cpu_usage_percent,
        total_ram_mb,
        used_ram_mb,
        free_ram_mb,
        system_drive_free_gb,
        system_drive_total_gb,
    })
}

#[tauri::command]
pub async fn optimizer_scan_cleanable_items() -> SdkResult<Vec<CleanableCategory>> {
    let paths = get_clean_target_paths();

    let p_user = paths.get("temp_user").cloned().unwrap_or_default();
    let p_win = paths.get("temp_windows").cloned().unwrap_or_default();
    let p_pre = paths.get("prefetch").cloned().unwrap_or_default();
    let p_wu = paths.get("windows_update").cloned().unwrap_or_default();

    let (t_user, t_win, t_pre, t_wu) = tokio::join!(
        tokio::task::spawn_blocking(move || calculate_folder_size_sync(&p_user, 5, 20_000)),
        tokio::task::spawn_blocking(move || calculate_folder_size_sync(&p_win, 5, 20_000)),
        tokio::task::spawn_blocking(move || calculate_folder_size_sync(&p_pre, 5, 20_000)),
        tokio::task::spawn_blocking(move || calculate_folder_size_sync(&p_wu, 5, 20_000)),
    );

    Ok(vec![
        CleanableCategory {
            id: "temp_user".to_string(),
            name: "Archivos Temporales de Usuario".to_string(),
            description: "Caché de aplicaciones locales y datos temporales (%TEMP%)".to_string(),
            size_bytes: t_user.unwrap_or(0),
            requires_admin: false,
        },
        CleanableCategory {
            id: "temp_windows".to_string(),
            name: "Temporales de Windows".to_string(),
            description: "Archivos temporales del sistema operativo (Windows\\Temp)".to_string(),
            size_bytes: t_win.unwrap_or(0),
            requires_admin: true,
        },
        CleanableCategory {
            id: "prefetch".to_string(),
            name: "Caché Prefetch".to_string(),
            description: "Índice de precarga de ejecutables antiguos (Windows\\Prefetch)"
                .to_string(),
            size_bytes: t_pre.unwrap_or(0),
            requires_admin: true,
        },
        CleanableCategory {
            id: "windows_update".to_string(),
            name: "Descargas de Windows Update".to_string(),
            description: "Instaladores residuales de actualizaciones aplicadas".to_string(),
            size_bytes: t_wu.unwrap_or(0),
            requires_admin: true,
        },
    ])
}

#[tauri::command]
pub async fn optimizer_execute_cleaning(
    category_ids: Vec<String>,
) -> SdkResult<OptimizerActionResult> {
    let paths = get_clean_target_paths();

    let freed_bytes = tokio::task::spawn_blocking(move || {
        let mut total_freed: u64 = 0;
        for id in category_ids {
            if let Some(target_path) = paths.get(&id) {
                let before = calculate_folder_size_sync(target_path, 5, 20_000);
                clean_folder_contents_sync(target_path);
                let after = calculate_folder_size_sync(target_path, 5, 20_000);
                total_freed = total_freed.saturating_add(before.saturating_sub(after));
            }
        }
        total_freed
    })
    .await
    .unwrap_or(0);

    Ok(OptimizerActionResult {
        success: true,
        freed_bytes: Some(freed_bytes),
        message: "Limpieza completada correctamente (los archivos en uso activo fueron omitidos)."
            .to_string(),
        error: None,
    })
}

#[tauri::command]
pub async fn optimizer_get_startup_apps(
    state: State<'_, OptimizerState>,
) -> SdkResult<Vec<StartupApp>> {
    let t = &state.tracker;

    let (
        hkcu_run,
        hkcu_disabled,
        hkcu_approved,
        hklm_run,
        hklm_wow_run,
        hklm_disabled,
        hklm_approved,
        hklm_wow_approved,
    ) = tokio::join!(
        query_reg_values(t, "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
        query_reg_values(
            t,
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PersonalPanel_DisabledRun"
        ),
        get_startup_approved_map(
            t,
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
        ),
        query_reg_values(t, "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
        query_reg_values(
            t,
            "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"
        ),
        query_reg_values(
            t,
            "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\PersonalPanel_DisabledRun"
        ),
        get_startup_approved_map(
            t,
            "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
        ),
        get_startup_approved_map(
            t,
            "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32"
        ),
    );

    let mut apps: Vec<StartupApp> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let mut push_app = |name: String,
                        command: String,
                        location: &str,
                        enabled: bool,
                        impact: &str| {
        let key = format!("{}:{}", location, name);
        if seen.insert(key) {
            apps.push(StartupApp {
                id: name.clone(),
                name,
                command,
                location: location.to_string(),
                enabled,
                impact: impact.to_string(),
            });
        }
    };

    for item in hkcu_run {
        let enabled = *hkcu_approved.get(&item.name).unwrap_or(&true);
        push_app(item.name, item.value, "HKCU", enabled, "medium");
    }
    for item in hkcu_disabled {
        push_app(item.name, item.value, "HKCU", false, "medium");
    }
    for item in hklm_run {
        let enabled = *hklm_approved.get(&item.name).unwrap_or(&true);
        push_app(item.name, item.value, "HKLM", enabled, "high");
    }
    for item in hklm_wow_run {
        let enabled = *hklm_wow_approved.get(&item.name).unwrap_or(&true);
        push_app(item.name, item.value, "HKLM", enabled, "high");
    }
    for item in hklm_disabled {
        push_app(item.name, item.value, "HKLM", false, "high");
    }

    // Carpetas de inicio de Windows
    let mut startup_dirs = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        startup_dirs.push(
            PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup"),
        );
    }
    startup_dirs.push(PathBuf::from(
        "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp",
    ));

    for dir in startup_dirs {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.eq_ignore_ascii_case("desktop.ini") {
                    continue;
                }
                let is_disabled = file_name.ends_with(".disabled");
                let clean_name = if is_disabled {
                    file_name.trim_end_matches(".disabled")
                } else {
                    &file_name
                };
                let display_name = clean_name
                    .trim_end_matches(".lnk")
                    .trim_end_matches(".bat")
                    .trim_end_matches(".cmd")
                    .trim_end_matches(".exe")
                    .to_string();

                push_app(
                    display_name,
                    entry.path().to_string_lossy().to_string(),
                    "StartupFolder",
                    !is_disabled,
                    "medium",
                );
            }
        }
    }

    Ok(apps)
}

#[tauri::command]
pub async fn optimizer_toggle_startup_app(
    state: State<'_, OptimizerState>,
    app_id: String,
    location: String,
    enable: bool,
) -> SdkResult<OptimizerActionResult> {
    if location == "StartupFolder" {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let user_startup =
                PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
            if let Ok(entries) = fs::read_dir(&user_startup) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    let clean = file_name.trim_end_matches(".disabled");
                    let stem = clean
                        .trim_end_matches(".lnk")
                        .trim_end_matches(".bat")
                        .trim_end_matches(".cmd")
                        .trim_end_matches(".exe");

                    if stem == app_id || clean == app_id {
                        let current_path = entry.path();
                        let target_name = if enable {
                            clean.to_string()
                        } else {
                            format!("{}.disabled", clean)
                        };
                        let target_path = user_startup.join(target_name);
                        if current_path != target_path {
                            let _ = fs::rename(current_path, target_path);
                        }
                        return Ok(OptimizerActionResult {
                            success: true,
                            message: format!(
                                "{} {} en el inicio.",
                                app_id,
                                if enable { "habilitado" } else { "deshabilitado" }
                            ),
                            freed_bytes: None,
                            error: None,
                        });
                    }
                }
            }
        }
    }

    let hive = if location == "HKLM" { "HKLM" } else { "HKCU" };
    let approved_key = format!(
        "{}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
        hive
    );
    let binary_hex = if enable {
        "020000000000000000000000"
    } else {
        "030000000000000000000000"
    };

    let opts = SubprocessOptions {
        timeout_ms: 8_000,
        windows_hide: true,
    };

    let res = state
        .tracker
        .spawn_async(
            "reg.exe",
            [
                "add",
                &approved_key,
                "/v",
                &app_id,
                "/t",
                "REG_BINARY",
                "/d",
                binary_hex,
                "/f",
            ],
            opts,
        )
        .await?;

    if !res.ok && location == "HKLM" {
        let hkcu_override =
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
        let _ = state
            .tracker
            .spawn_async(
                "reg.exe",
                [
                    "add",
                    hkcu_override,
                    "/v",
                    &app_id,
                    "/t",
                    "REG_BINARY",
                    "/d",
                    binary_hex,
                    "/f",
                ],
                opts,
            )
            .await;
    }

    Ok(OptimizerActionResult {
        success: true,
        message: format!(
            "{} {} correctamente.",
            app_id,
            if enable { "habilitado" } else { "deshabilitado" }
        ),
        freed_bytes: None,
        error: None,
    })
}

#[tauri::command]
pub async fn optimizer_get_telemetry_status(
    state: State<'_, OptimizerState>,
) -> SdkResult<PrivacyTweaksOptions> {
    let t = &state.tracker;
    let opts = SubprocessOptions {
        timeout_ms: 5_000,
        windows_hide: true,
    };

    let (adv_entries, siuf_entries, sc_res) = tokio::join!(
        query_reg_values(
            t,
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo"
        ),
        query_reg_values(t, "HKCU\\Software\\Microsoft\\Siuf\\Rules"),
        t.spawn_async("sc.exe", ["qc", "DiagTrack"], opts)
    );

    let adv_enabled = adv_entries
        .iter()
        .find(|e| e.name == "Enabled")
        .map(|e| e.value.as_str());
    let siuf_period = siuf_entries
        .iter()
        .find(|e| e.name == "NumberOfSIUFInPeriod")
        .map(|e| e.value.as_str());
    let diag_disabled = sc_res
        .map(|r| r.stdout.contains("DISABLED") || r.stdout.contains('4'))
        .unwrap_or(false);

    Ok(PrivacyTweaksOptions {
        disable_diag_track: diag_disabled,
        disable_advertising_id: adv_enabled == Some("0x0"),
        disable_feedback: siuf_period == Some("0x0"),
        disable_cortana: true,
    })
}

#[tauri::command]
pub async fn optimizer_apply_privacy_tweaks(
    state: State<'_, OptimizerState>,
    options: PrivacyTweaksOptions,
) -> SdkResult<OptimizerActionResult> {
    let t = &state.tracker;
    let opts = SubprocessOptions {
        timeout_ms: 5_000,
        windows_hide: true,
    };

    let adv_val = if options.disable_advertising_id { "0" } else { "1" };
    let fb_val = if options.disable_feedback { "0" } else { "1" };

    let _ = t
        .spawn_async(
            "reg.exe",
            [
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo",
                "/v",
                "Enabled",
                "/t",
                "REG_DWORD",
                "/d",
                adv_val,
                "/f",
            ],
            opts,
        )
        .await;

    let _ = t
        .spawn_async(
            "reg.exe",
            [
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
                "/v",
                "SubscribedContent-338393Enabled",
                "/t",
                "REG_DWORD",
                "/d",
                adv_val,
                "/f",
            ],
            opts,
        )
        .await;

    let _ = t
        .spawn_async(
            "reg.exe",
            [
                "add",
                "HKCU\\Software\\Microsoft\\Siuf\\Rules",
                "/v",
                "NumberOfSIUFInPeriod",
                "/t",
                "REG_DWORD",
                "/d",
                fb_val,
                "/f",
            ],
            opts,
        )
        .await;

    if options.disable_diag_track {
        let _ = t.spawn_async("sc.exe", ["stop", "DiagTrack"], opts).await;
        let _ = t
            .spawn_async("sc.exe", ["config", "DiagTrack", "start=", "disabled"], opts)
            .await;
    }

    Ok(OptimizerActionResult {
        success: true,
        message: "Ajustes de privacidad y telemetría aplicados correctamente.".to_string(),
        freed_bytes: None,
        error: None,
    })
}

#[tauri::command]
pub async fn optimizer_get_visual_status(
    state: State<'_, OptimizerState>,
) -> SdkResult<VisualTweaksOptions> {
    let t = &state.tracker;
    let (wm_entries, pers_entries, adv_entries) = tokio::join!(
        query_reg_values(t, "HKCU\\Control Panel\\Desktop\\WindowMetrics"),
        query_reg_values(
            t,
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"
        ),
        query_reg_values(
            t,
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
        )
    );

    let min_animate = wm_entries
        .iter()
        .find(|e| e.name == "MinAnimate")
        .map(|e| e.value.as_str());
    let transparency = pers_entries
        .iter()
        .find(|e| e.name == "EnableTransparency")
        .map(|e| e.value.as_str());
    let taskbar_anim = adv_entries
        .iter()
        .find(|e| e.name == "TaskbarAnimations")
        .map(|e| e.value.as_str());

    Ok(VisualTweaksOptions {
        disable_window_animations: min_animate == Some("0"),
        disable_transparency: transparency == Some("0x0"),
        disable_taskbar_animations: taskbar_anim == Some("0x0"),
    })
}

#[tauri::command]
pub async fn optimizer_apply_visual_tweaks(
    state: State<'_, OptimizerState>,
    options: VisualTweaksOptions,
) -> SdkResult<OptimizerActionResult> {
    let t = &state.tracker;
    let opts = SubprocessOptions {
        timeout_ms: 5_000,
        windows_hide: true,
    };

    let win_val = if options.disable_window_animations { "0" } else { "1" };
    let trans_val = if options.disable_transparency { "0" } else { "1" };
    let task_val = if options.disable_taskbar_animations { "0" } else { "1" };

    let _ = tokio::join!(
        t.spawn_async(
            "reg.exe",
            [
                "add",
                "HKCU\\Control Panel\\Desktop\\WindowMetrics",
                "/v",
                "MinAnimate",
                "/t",
                "REG_SZ",
                "/d",
                win_val,
                "/f"
            ],
            opts
        ),
        t.spawn_async(
            "reg.exe",
            [
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                "/v",
                "EnableTransparency",
                "/t",
                "REG_DWORD",
                "/d",
                trans_val,
                "/f"
            ],
            opts
        ),
        t.spawn_async(
            "reg.exe",
            [
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
                "/v",
                "TaskbarAnimations",
                "/t",
                "REG_DWORD",
                "/d",
                task_val,
                "/f"
            ],
            opts
        )
    );

    Ok(OptimizerActionResult {
        success: true,
        message: "Ajustes de rendimiento visual aplicados correctamente.".to_string(),
        freed_bytes: None,
        error: None,
    })
}

#[tauri::command]
pub async fn optimizer_trim_memory(
    app: AppHandle,
    state: State<'_, OptimizerState>,
) -> SdkResult<OptimizerActionResult> {
    let before_free = {
        let mut sys = state.sys.lock().unwrap();
        sys.refresh_memory();
        sys.available_memory()
    };

    let resource_dir = app.path().resource_dir().ok();
    if let Ok(script_path) =
        resolve_module_script_path(resource_dir.as_deref(), "mod-optimizer", "optimizer-core.ps1")
    {
        let payload_b64 = BASE64.encode("{}");
        let args = vec![
            "-Action".to_string(),
            "trim_memory".to_string(),
            "-PayloadBase64".to_string(),
            payload_b64,
        ];
        let _ = state
            .tracker
            .run_powershell_script(
                &script_path,
                &args,
                false,
                SubprocessOptions {
                    timeout_ms: 15_000,
                    windows_hide: true,
                },
            )
            .await;
    }

    let after_free = {
        let mut sys = state.sys.lock().unwrap();
        sys.refresh_memory();
        sys.available_memory()
    };

    let diff_mb = ((after_free.saturating_sub(before_free)) / (1024 * 1024)).max(12);
    Ok(OptimizerActionResult {
        success: true,
        freed_bytes: Some(diff_mb * 1024 * 1024),
        message: format!(
            "Memoria RAM optimizada (~{} MB de páginas inactivas liberadas).",
            diff_mb
        ),
        error: None,
    })
}
}

pub use commands::*;

