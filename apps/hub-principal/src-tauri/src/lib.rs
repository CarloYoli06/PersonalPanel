use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use panel_core_sdk::{DependencyStatus, ModuleStateSnapshot};
use panel_mod_optimizer::OptimizerState;
use panel_mod_pdf::PdfState;
use panel_mod_scanner::ScannerState;
use panel_mod_video::VideoState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Theme, WebviewWindow, WindowEvent,
};

// ═══════════════════════════════════════════════════════════════════════════
// Modelos de Datos Compartidos (Espejo de packages/core-sdk/src/ipc-contract.ts)
// ═══════════════════════════════════════════════════════════════════════════

pub const EVENT_TRAY_NAVIGATE: &str = "hub:tray:navigate-to-module";
pub const EVENT_MODULE_STATE_CHANGED: &str = "hub:modules:state-changed";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandingConfig {
    pub mode: String, // "logo" | "initials"
    pub initials: String,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}

impl Default for BrandingConfig {
    fn default() -> Self {
        Self {
            mode: "logo".to_string(),
            initials: "PA".to_string(),
            color: "#8b5cf6".to_string(),
            data_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub enabled: bool,
    pub only_when_unfocused: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            only_when_unfocused: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubAppSettings {
    pub close_to_tray: bool,
    pub branding: BrandingConfig,
    #[serde(default)]
    pub notifications: NotificationSettings,
}

impl Default for HubAppSettings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            branding: BrandingConfig::default(),
            notifications: NotificationSettings::default(),
        }
    }
}

/// Textos del menú de bandeja, enviados por el frontend según el idioma activo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    pub header: String,
    pub dashboard: String,
    pub video: String,
    pub scanner: String,
    pub optimizer: String,
    pub pdf: String,
    pub settings: String,
    pub keep_background: String,
    pub quit: String,
    pub tooltip: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            header: "Panel Personal · Hub Modular".to_string(),
            dashboard: "Abrir Panel Principal".to_string(),
            video: "FileDiet · Control de Videos".to_string(),
            scanner: "Escaner Albedo · Digitalización".to_string(),
            optimizer: "PC Optimizer · Rendimiento & Privacidad".to_string(),
            pdf: "PDF Studio · Control de PDF".to_string(),
            settings: "Configuración y Personalización".to_string(),
            keep_background: "Mantener activo en segundo plano al cerrar".to_string(),
            quit: "Salir completamente".to_string(),
            tooltip: "Panel Personal · Ecosistema Modular".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PersistedHubModules {
    enabled_modules: HashMap<String, bool>,
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado Global del Host Principal (Reemplazo de ModuleHost + AppSettings)
// ═══════════════════════════════════════════════════════════════════════════

pub struct HubState {
    pub settings: Mutex<HubAppSettings>,
    pub modules: Mutex<HashMap<String, ModuleStateSnapshot>>,
    pub is_quitting: AtomicBool,
    pub config_dir: PathBuf,
}

impl HubState {
    pub fn new(config_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&config_dir);

        let settings_path = config_dir.join("panel-hub-settings.json");
        let settings: HubAppSettings = fs::read_to_string(&settings_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let modules_path = config_dir.join("panel-hub-modules.json");
        let persisted: PersistedHubModules = fs::read_to_string(&modules_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let module_ids = ["mod-video", "mod-scanner", "mod-optimizer", "mod-pdf"];
        let mut modules = HashMap::new();

        for id in module_ids {
            let enabled = *persisted.enabled_modules.get(id).unwrap_or(&true);
            let status_text = if enabled {
                "Listo (0 MB en reposo)".to_string()
            } else {
                "Desactivado (0 recursos en uso)".to_string()
            };

            modules.insert(
                id.to_string(),
                ModuleStateSnapshot {
                    id: id.to_string(),
                    enabled,
                    running: false,
                    status_text,
                    progress: None,
                    dependencies_ready: true,
                    dependencies: default_dependencies_for(id),
                },
            );
        }

        Self {
            settings: Mutex::new(settings),
            modules: Mutex::new(modules),
            is_quitting: AtomicBool::new(false),
            config_dir,
        }
    }

    pub fn save_settings(&self, settings: &HubAppSettings) {
        let path = self.config_dir.join("panel-hub-settings.json");
        if let Ok(json) = serde_json::to_string_pretty(settings) {
            let _ = fs::write(path, json);
        }
    }

    pub fn save_modules(&self, modules: &HashMap<String, ModuleStateSnapshot>) {
        let path = self.config_dir.join("panel-hub-modules.json");
        let enabled_modules: HashMap<String, bool> = modules
            .iter()
            .map(|(k, v)| (k.clone(), v.enabled))
            .collect();
        let payload = PersistedHubModules { enabled_modules };
        if let Ok(json) = serde_json::to_string_pretty(&payload) {
            let _ = fs::write(path, json);
        }
    }
}

fn default_dependencies_for(module_id: &str) -> Vec<DependencyStatus> {
    match module_id {
        "mod-video" => vec![
            DependencyStatus {
                name: "FFmpeg Engine (x64)".to_string(),
                description: "Motor de codificación H.264 / NVENC bajo demanda".to_string(),
                ready: true,
                version: Some("6.x-native".to_string()),
                binary_path: None,
                optional: Some(false),
            },
            DependencyStatus {
                name: "FFprobe Analyzer".to_string(),
                description: "Inspector asíncrono de streams de video".to_string(),
                ready: true,
                version: None,
                binary_path: None,
                optional: Some(false),
            },
        ],
        "mod-scanner" => vec![DependencyStatus {
            name: "Windows WIA / PowerShell STA Bridge".to_string(),
            description: "Subproceso efímero bajo demanda para escáneres USB y WiFi".to_string(),
            ready: true,
            version: None,
            binary_path: None,
            optional: Some(false),
        }],
        "mod-optimizer" => vec![DependencyStatus {
            name: "PowerShell System Optimizer".to_string(),
            description: "Ejecutor aislado sin consola para telemetría, servicios y caché"
                .to_string(),
            ready: true,
            version: None,
            binary_path: None,
            optional: Some(false),
        }],
        "mod-pdf" => vec![DependencyStatus {
            name: "Motor PDF Nativo (Rust + PDF.js)".to_string(),
            description: "Manipulación de documentos PDF e inspección local".to_string(),
            ready: true,
            version: None,
            binary_path: None,
            optional: Some(false),
        }],
        _ => vec![],
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades de Ventana, Bandeja del Sistema e Iconos Dinámicos
// ═══════════════════════════════════════════════════════════════════════════

fn show_and_navigate(app: &AppHandle, route: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(target) = route {
            let _ = app.emit(EVENT_TRAY_NAVIGATE, target);
        }
    }
}

fn decode_data_url_to_tauri_image(data_url: &str) -> Option<Image<'static>> {
    let base64_part = data_url.split(',').nth(1)?;
    let bytes = BASE64.decode(base64_part).ok()?;
    let dyn_img = image::load_from_memory(&bytes).ok()?.into_rgba8();
    let (width, height) = dyn_img.dimensions();
    Some(Image::new_owned(dyn_img.into_raw(), width, height))
}

fn apply_branding_icons(app: &AppHandle, branding: &BrandingConfig) {
    let resolved_icon = if branding.mode == "initials" {
        branding
            .data_url
            .as_deref()
            .and_then(decode_data_url_to_tauri_image)
            .or_else(|| app.default_window_icon().cloned())
    } else {
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
            .ok()
            .or_else(|| app.default_window_icon().cloned())
    };

    if let Some(icon) = resolved_icon {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.set_icon(icon.clone());
        }
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_icon(Some(icon));
        }
    }
}

fn build_tray_menu(
    app: &AppHandle,
    labels: &TrayLabels,
    close_to_tray: bool,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let header = MenuItemBuilder::with_id("header", &labels.header)
        .enabled(false)
        .build(app)?;
    let nav_dashboard = MenuItemBuilder::with_id("nav_dashboard", &labels.dashboard).build(app)?;
    let nav_video = MenuItemBuilder::with_id("nav_video", &labels.video).build(app)?;
    let nav_scanner = MenuItemBuilder::with_id("nav_scanner", &labels.scanner).build(app)?;
    let nav_optimizer = MenuItemBuilder::with_id("nav_optimizer", &labels.optimizer).build(app)?;
    let nav_pdf = MenuItemBuilder::with_id("nav_pdf", &labels.pdf).build(app)?;
    let nav_settings = MenuItemBuilder::with_id("nav_settings", &labels.settings).build(app)?;

    let toggle_tray =
        CheckMenuItemBuilder::with_id("toggle_close_to_tray", &labels.keep_background)
            .checked(close_to_tray)
            .build(app)?;

    let quit_item = MenuItemBuilder::with_id("quit", &labels.quit).build(app)?;

    MenuBuilder::new(app)
        .item(&header)
        .separator()
        .item(&nav_dashboard)
        .item(&nav_video)
        .item(&nav_scanner)
        .item(&nav_optimizer)
        .item(&nav_pdf)
        .item(&nav_settings)
        .separator()
        .item(&toggle_tray)
        .separator()
        .item(&quit_item)
        .build()
}

fn setup_system_tray(app: &AppHandle, close_to_tray: bool) -> tauri::Result<()> {
    let labels = TrayLabels::default();
    let menu = build_tray_menu(app, &labels, close_to_tray)?;

    let mut tray_builder = TrayIconBuilder::with_id("main-tray")
        .tooltip(&labels.tooltip)
        .menu(&menu)
        .on_menu_event(move |app_handle, event| match event.id().as_ref() {
            "nav_dashboard" => show_and_navigate(app_handle, Some("dashboard")),
            "nav_video" => show_and_navigate(app_handle, Some("mod-video")),
            "nav_scanner" => show_and_navigate(app_handle, Some("mod-scanner")),
            "nav_optimizer" => show_and_navigate(app_handle, Some("mod-optimizer")),
            "nav_pdf" => show_and_navigate(app_handle, Some("mod-pdf")),
            "nav_settings" => show_and_navigate(app_handle, Some("settings")),
            "toggle_close_to_tray" => {
                let state = app_handle.state::<HubState>();
                let mut cfg = state.settings.lock().unwrap();
                cfg.close_to_tray = !cfg.close_to_tray;
                state.save_settings(&cfg);
            }
            "quit" => {
                let state = app_handle.state::<HubState>();
                state.is_quitting.store(true, Ordering::SeqCst);
                app_handle.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app_handle = tray.app_handle();
                if let Some(win) = app_handle.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) && win.is_focused().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        show_and_navigate(app_handle, None);
                    }
                }
            }
        });

    let initial_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
        .ok()
        .or_else(|| app.default_window_icon().cloned());

    if let Some(default_icon) = initial_icon {
        tray_builder = tray_builder.icon(default_icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════
// Comandos Tauri del Hub Principal (IPC Bridge)
// ═══════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn hub_window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn hub_window_maximize(window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn hub_window_close(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
fn hub_window_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn hub_theme_set_native(window: WebviewWindow, resolved_theme: String) {
    let theme = if resolved_theme == "light" {
        Some(Theme::Light)
    } else {
        Some(Theme::Dark)
    };
    let _ = window.set_theme(theme);
}

#[tauri::command]
fn hub_app_get_settings(state: State<'_, HubState>) -> HubAppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn hub_app_set_branding(
    app: AppHandle,
    state: State<'_, HubState>,
    branding: BrandingConfig,
) -> HubAppSettings {
    let mut settings = state.settings.lock().unwrap();
    settings.branding = branding.clone();
    state.save_settings(&settings);
    let updated = settings.clone();
    drop(settings);

    apply_branding_icons(&app, &branding);
    updated
}

#[tauri::command]
fn hub_app_set_close_to_tray(
    state: State<'_, HubState>,
    close_to_tray: bool,
) -> HubAppSettings {
    let mut settings = state.settings.lock().unwrap();
    settings.close_to_tray = close_to_tray;
    state.save_settings(&settings);
    settings.clone()
}

#[tauri::command]
fn hub_app_set_notifications(
    state: State<'_, HubState>,
    notifications: NotificationSettings,
) -> HubAppSettings {
    let mut settings = state.settings.lock().unwrap();
    settings.notifications = notifications;
    state.save_settings(&settings);
    settings.clone()
}

#[tauri::command]
fn hub_tray_set_labels(app: AppHandle, state: State<'_, HubState>, labels: TrayLabels) {
    let close_to_tray = state.settings.lock().unwrap().close_to_tray;
    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Ok(menu) = build_tray_menu(&app, &labels, close_to_tray) {
            let _ = tray.set_menu(Some(menu));
        }
        let _ = tray.set_tooltip(Some(labels.tooltip.as_str()));
    }
}

#[tauri::command]
fn hub_modules_get_states(
    state: State<'_, HubState>,
) -> HashMap<String, ModuleStateSnapshot> {
    state.modules.lock().unwrap().clone()
}

#[tauri::command]
fn hub_modules_set_enabled(
    app: AppHandle,
    state: State<'_, HubState>,
    module_id: String,
    enabled: bool,
) -> Result<ModuleStateSnapshot, String> {
    let mut modules = state.modules.lock().unwrap();
    let entry = modules
        .entry(module_id.clone())
        .or_insert_with(|| ModuleStateSnapshot {
            id: module_id.clone(),
            enabled,
            running: false,
            status_text: String::new(),
            progress: None,
            dependencies_ready: true,
            dependencies: default_dependencies_for(&module_id),
        });

    entry.enabled = enabled;
    entry.running = false;
    entry.status_text = if enabled {
        "Listo (0 MB en reposo)".to_string()
    } else {
        "Desactivado (0 recursos en uso)".to_string()
    };

    let snapshot = entry.clone();
    state.save_modules(&modules);
    drop(modules);

    let _ = app.emit(EVENT_MODULE_STATE_CHANGED, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn hub_modules_check_deps(
    app: AppHandle,
    state: State<'_, HubState>,
    optimizer_state: State<'_, OptimizerState>,
    scanner_state: State<'_, ScannerState>,
    video_state: State<'_, VideoState>,
    pdf_state: State<'_, PdfState>,
    module_id: String,
) -> Result<Vec<DependencyStatus>, String> {
    let resource_dir = app.path().resource_dir().ok();
    let deps = match module_id.as_str() {
        "mod-optimizer" => optimizer_state.check_dependencies(resource_dir.as_deref()),
        "mod-scanner" => scanner_state.check_dependencies(resource_dir.as_deref()),
        "mod-video" => video_state.check_dependencies(&app).await,
        "mod-pdf" => pdf_state.check_dependencies().await,
        _ => default_dependencies_for(&module_id),
    };
    let mut modules = state.modules.lock().unwrap();
    if let Some(entry) = modules.get_mut(&module_id) {
        entry.dependencies = deps.clone();
        entry.dependencies_ready = deps
            .iter()
            .filter(|d| !d.optional.unwrap_or(false))
            .all(|d| d.ready);
        let snap = entry.clone();
        let _ = app.emit(EVENT_MODULE_STATE_CHANGED, &snap);
    }
    Ok(deps)
}

#[tauri::command]
fn hub_modules_stop_processes(
    app: AppHandle,
    state: State<'_, HubState>,
    optimizer_state: State<'_, OptimizerState>,
    scanner_state: State<'_, ScannerState>,
    video_state: State<'_, VideoState>,
    pdf_state: State<'_, PdfState>,
    module_id: String,
) -> bool {
    match module_id.as_str() {
        "mod-optimizer" => optimizer_state.tracker.kill_all(),
        "mod-scanner" => scanner_state.tracker.kill_all(),
        "mod-video" => {
            video_state.cancel_active();
            video_state.tracker.kill_all();
        }
        "mod-pdf" => pdf_state.tracker.kill_all(),
        _ => {}
    }
    let mut modules = state.modules.lock().unwrap();
    if let Some(entry) = modules.get_mut(&module_id) {
        entry.running = false;
        entry.status_text = "Listo (0 MB en reposo)".to_string();
        let snap = entry.clone();
        let _ = app.emit(EVENT_MODULE_STATE_CHANGED, &snap);
    }
    true
}

// ═══════════════════════════════════════════════════════════════════════════
// Inicialización del Host de Tauri v2
// ═══════════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            let hub_state = HubState::new(config_dir.clone());
            let initial_settings = hub_state.settings.lock().unwrap().clone();
            app.manage(hub_state);
            app.manage(OptimizerState::new());
            app.manage(ScannerState::new(config_dir));
            app.manage(VideoState::new());
            app.manage(PdfState::new());

            setup_system_tray(app.handle(), initial_settings.close_to_tray)?;
            apply_branding_icons(app.handle(), &initial_settings.branding);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle();
                let state = app_handle.state::<HubState>();
                let is_quitting = state.is_quitting.load(Ordering::SeqCst);
                let close_to_tray = state.settings.lock().unwrap().close_to_tray;

                if !is_quitting && close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            hub_window_minimize,
            hub_window_maximize,
            hub_window_close,
            hub_window_is_maximized,
            hub_theme_set_native,
            hub_app_get_settings,
            hub_app_set_branding,
            hub_app_set_close_to_tray,
            hub_app_set_notifications,
            hub_tray_set_labels,
            hub_modules_get_states,
            hub_modules_set_enabled,
            hub_modules_check_deps,
            hub_modules_stop_processes,
            // Comandos de mod-optimizer (Fase 3)
            panel_mod_optimizer::optimizer_get_metrics,
            panel_mod_optimizer::optimizer_scan_cleanable_items,
            panel_mod_optimizer::optimizer_execute_cleaning,
            panel_mod_optimizer::optimizer_get_startup_apps,
            panel_mod_optimizer::optimizer_toggle_startup_app,
            panel_mod_optimizer::optimizer_get_telemetry_status,
            panel_mod_optimizer::optimizer_apply_privacy_tweaks,
            panel_mod_optimizer::optimizer_get_visual_status,
            panel_mod_optimizer::optimizer_apply_visual_tweaks,
            panel_mod_optimizer::optimizer_trim_memory,
            // Comandos de mod-scanner (Fase 4)
            panel_mod_scanner::scanner_get_config,
            panel_mod_scanner::scanner_set_config,
            panel_mod_scanner::scanner_reset_device,
            panel_mod_scanner::scanner_list,
            panel_mod_scanner::scanner_scan_smart,
            panel_mod_scanner::scanner_scan,
            panel_mod_scanner::scanner_save_image,
            panel_mod_scanner::scanner_save_pdf,
            panel_mod_scanner::scanner_read_base64,
            panel_mod_scanner::scanner_show_open_folder,
            panel_mod_scanner::scanner_get_docs_path,
            panel_mod_scanner::scanner_open_path,
            // Comandos de mod-video (Fase 5)
            panel_mod_video::video_select_files,
            panel_mod_video::video_select_folder,
            panel_mod_video::video_get_system_info,
            panel_mod_video::video_probe_files,
            panel_mod_video::video_compress,
            panel_mod_video::video_cancel,
            panel_mod_video::video_show_in_folder,
            // Comandos de mod-pdf (Fase 6)
            panel_mod_pdf::pdf_select_pdf_files,
            panel_mod_pdf::pdf_select_image_files,
            panel_mod_pdf::pdf_select_output_folder,
            panel_mod_pdf::pdf_inspect_pdfs,
            panel_mod_pdf::pdf_inspect_images,
            panel_mod_pdf::pdf_read_pdf_bytes,
            panel_mod_pdf::pdf_read_image_data_url,
            panel_mod_pdf::pdf_merge,
            panel_mod_pdf::pdf_split,
            panel_mod_pdf::pdf_organize,
            panel_mod_pdf::pdf_compress,
            panel_mod_pdf::pdf_images_to_pdf,
            panel_mod_pdf::pdf_save_exported_images,
            panel_mod_pdf::pdf_stamp,
            panel_mod_pdf::pdf_update_metadata_security,
            panel_mod_pdf::pdf_reveal_in_folder,
            panel_mod_pdf::pdf_open_file,
        ])
        .run(tauri::generate_context!())
        .expect("Error crítico al ejecutar Panel Personal Hub en Tauri v2");
}

