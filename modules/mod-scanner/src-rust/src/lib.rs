use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{codecs::jpeg::JpegEncoder, DynamicImage};
use lopdf::{
    content::{Content, Operation},
    dictionary, Document as LoPdfDocument, Object, Stream,
};
use panel_core_sdk::{
    configure_std_command, resolve_module_script_path, DependencyStatus, IsolatedProcessTracker,
    SdkError, SdkResult, SubprocessOptions,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

// ═══════════════════════════════════════════════════════════════════════════
// Tipos Compartidos (Espejo de modules/mod-scanner/src/shared/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannerDevice {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannerConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dpi: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_mode: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub device_id: Option<String>,
    pub force_select: Option<bool>,
    pub dpi: Option<u32>,
    pub color_mode: Option<u32>,
    pub brightness: Option<i32>,
    pub contrast: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temp_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImagePayload {
    pub base64: String,
    pub dest_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePdfPayload {
    pub image_paths: Vec<String>,
    pub dest_path: String,
    pub page_size: String, // "a4" | "letter"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFolderDialogResult {
    pub canceled: bool,
    pub file_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PsScanScriptOutput {
    success: bool,
    #[serde(default)]
    path: String,
    #[serde(default)]
    device_id: String,
    #[serde(default)]
    device_name: String,
    #[serde(default)]
    error: String,
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado del Módulo Scanner
// ═══════════════════════════════════════════════════════════════════════════

pub struct ScannerState {
    pub tracker: IsolatedProcessTracker,
    pub config: Mutex<ScannerConfig>,
    pub config_path: PathBuf,
    pub temp_dir: PathBuf,
}

impl ScannerState {
    pub fn new(config_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&config_dir);
        let config_path = config_dir.join("albedo-config.json");
        let config: ScannerConfig = fs::read_to_string(&config_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let temp_dir = std::env::temp_dir().join("EscanerAlbedo");
        let _ = fs::create_dir_all(&temp_dir);

        Self {
            tracker: IsolatedProcessTracker::new(),
            config: Mutex::new(config),
            config_path,
            temp_dir,
        }
    }

    pub fn save_config(&self, cfg: &ScannerConfig) {
        if let Ok(json) = serde_json::to_string_pretty(cfg) {
            let _ = fs::write(&self.config_path, json);
        }
    }

    pub fn check_dependencies(&self, resource_dir: Option<&Path>) -> Vec<DependencyStatus> {
        let smart_script =
            resolve_module_script_path(resource_dir, "mod-scanner", "scan-with-select.ps1");
        let list_script =
            resolve_module_script_path(resource_dir, "mod-scanner", "list-scanners.ps1");
        let scripts_ready = smart_script.is_ok() && list_script.is_ok();

        vec![
            DependencyStatus {
                name: "Windows WIA / PowerShell STA Bridge".to_string(),
                description:
                    "Subproceso efímero bajo demanda para comunicación con escáneres USB y WiFi/WSD"
                        .to_string(),
                ready: cfg!(windows) && scripts_ready,
                version: None,
                binary_path: smart_script
                    .ok()
                    .map(|p| p.to_string_lossy().to_string()),
                optional: Some(false),
            },
            DependencyStatus {
                name: "Motor PDF Multipágina Nativo (lopdf)".to_string(),
                description: "Generador en Rust de documentos PDF A4 / Carta sin dependencias JS"
                    .to_string(),
                ready: true,
                version: Some("0.34".to_string()),
                binary_path: None,
                optional: Some(false),
            },
        ]
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Generador Nativo de PDF Multipágina en Rust (Reemplazo de PDFKit)
// ═══════════════════════════════════════════════════════════════════════════

fn generate_multipage_pdf(
    image_paths: &[String],
    dest_path: &Path,
    page_size: &str,
) -> SdkResult<()> {
    let (page_w, page_h): (f64, f64) = if page_size.eq_ignore_ascii_case("letter") {
        (612.0, 792.0)
    } else {
        (595.28, 841.89)
    };

    let mut doc = LoPdfDocument::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut page_ids: Vec<Object> = Vec::new();

    for (idx, img_path_str) in image_paths.iter().enumerate() {
        let img_path = Path::new(img_path_str);
        if !img_path.exists() {
            continue;
        }

        let dyn_img: DynamicImage = image::open(img_path)
            .map_err(|e| SdkError::Custom(format!("No se pudo abrir la imagen '{}': {}", img_path_str, e)))?;
        let rgb_img = dyn_img.to_rgb8();
        let (img_w, img_h) = rgb_img.dimensions();
        if img_w == 0 || img_h == 0 {
            continue;
        }

        let mut jpeg_bytes: Vec<u8> = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, 90);
        encoder
            .encode_image(&rgb_img)
            .map_err(|e| SdkError::Custom(format!("Error codificando JPEG para PDF: {}", e)))?;

        let img_name = format!("Im{}", idx + 1);
        let img_stream = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => img_w as i64,
                "Height" => img_h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
                "Filter" => "DCTDecode",
            },
            jpeg_bytes,
        );
        let img_obj_id = doc.add_object(img_stream);

        // Ajuste proporcional centrado (fit) dentro de la página
        let scale_x = page_w / (img_w as f64);
        let scale_y = page_h / (img_h as f64);
        let scale = scale_x.min(scale_y);
        let draw_w = (img_w as f64) * scale;
        let draw_h = (img_h as f64) * scale;
        let offset_x = (page_w - draw_w) / 2.0;
        let offset_y = (page_h - draw_h) / 2.0;

        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new(
                    "cm",
                    vec![
                        draw_w.into(),
                        0.into(),
                        0.into(),
                        draw_h.into(),
                        offset_x.into(),
                        offset_y.into(),
                    ],
                ),
                Operation::new("Do", vec![Object::Name(img_name.as_bytes().to_vec())]),
                Operation::new("Q", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap_or_default()));

        let mut xobject_dict = lopdf::Dictionary::new();
        xobject_dict.set(img_name.as_bytes().to_vec(), img_obj_id);

        let resources_id = doc.add_object(dictionary! {
            "XObject" => xobject_dict,
        });

        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), page_w.into(), page_h.into()],
            "Contents" => content_id,
            "Resources" => resources_id,
        });
        page_ids.push(page_id.into());
    }

    let pages_count = page_ids.len() as i64;
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids,
            "Count" => pages_count,
        }),
    );

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();
    doc.save(dest_path)
        .map_err(|e| SdkError::Custom(format!("No se pudo guardar el PDF: {}", e)))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════
// Comandos Tauri de mod-scanner
// ═══════════════════════════════════════════════════════════════════════════

pub mod commands {
    use super::*;

#[tauri::command]
pub fn scanner_get_config(state: State<'_, ScannerState>) -> ScannerConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn scanner_set_config(
    state: State<'_, ScannerState>,
    data: ScannerConfig,
) -> ScannerConfig {
    let mut cfg = state.config.lock().unwrap();
    if data.device_id.is_some() {
        cfg.device_id = data.device_id;
    }
    if data.device_name.is_some() {
        cfg.device_name = data.device_name;
    }
    if data.dpi.is_some() {
        cfg.dpi = data.dpi;
    }
    if data.color_mode.is_some() {
        cfg.color_mode = data.color_mode;
    }
    state.save_config(&cfg);
    cfg.clone()
}

#[tauri::command]
pub fn scanner_reset_device(state: State<'_, ScannerState>) -> bool {
    let mut cfg = state.config.lock().unwrap();
    cfg.device_id = Some(String::new());
    cfg.device_name = Some(String::new());
    state.save_config(&cfg);
    true
}

#[tauri::command]
pub async fn scanner_list(
    app: AppHandle,
    state: State<'_, ScannerState>,
) -> SdkResult<Vec<ScannerDevice>> {
    let resource_dir = app.path().resource_dir().ok();
    let script_path = match resolve_module_script_path(
        resource_dir.as_deref(),
        "mod-scanner",
        "list-scanners.ps1",
    ) {
        Ok(p) => p,
        Err(_) => return Ok(Vec::new()),
    };

    let res = state
        .tracker
        .run_powershell_script(
            &script_path,
            &[],
            true,
            SubprocessOptions {
                timeout_ms: 15_000,
                windows_hide: true,
            },
        )
        .await;

    let raw = match res {
        Ok(r) if r.ok => r.stdout,
        _ => return Ok(Vec::new()),
    };

    if raw.is_empty() || raw == "null" {
        return Ok(Vec::new());
    }

    if let Ok(list) = serde_json::from_str::<Vec<ScannerDevice>>(&raw) {
        return Ok(list);
    }
    if let Ok(single) = serde_json::from_str::<ScannerDevice>(&raw) {
        return Ok(vec![single]);
    }

    Ok(Vec::new())
}

#[tauri::command]
pub async fn scanner_scan_smart(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, ScannerState>,
    opts: Option<ScanOptions>,
) -> SdkResult<ScanResponse> {
    let opts = opts.unwrap_or_default();
    let _ = fs::create_dir_all(&state.temp_dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out_path = state.temp_dir.join(format!("scan_{}.png", ts));

    let cfg = state.config.lock().unwrap().clone();
    let saved_id = if opts.force_select.unwrap_or(false) {
        String::new()
    } else {
        cfg.device_id.unwrap_or_default()
    };
    let need_dialog = saved_id.is_empty();

    let resource_dir = app.path().resource_dir().ok();
    let script_path = resolve_module_script_path(
        resource_dir.as_deref(),
        "mod-scanner",
        "scan-with-select.ps1",
    )?;

    if need_dialog {
        let _ = window.minimize();
        tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    }

    let dpi = opts.dpi.or(cfg.dpi).unwrap_or(300);
    let color_mode = opts.color_mode.or(cfg.color_mode).unwrap_or(2);
    let brightness = opts.brightness.unwrap_or(0);
    let contrast = opts.contrast.unwrap_or(0);

    let mut script_args = vec![
        "-OutputPath".to_string(),
        out_path.to_string_lossy().to_string(),
        "-DPI".to_string(),
        dpi.to_string(),
        "-ColorMode".to_string(),
        color_mode.to_string(),
        "-Brightness".to_string(),
        brightness.to_string(),
        "-Contrast".to_string(),
        contrast.to_string(),
    ];
    if !saved_id.is_empty() {
        script_args.push("-DeviceId".to_string());
        script_args.push(saved_id);
    }

    let exec_res = state
        .tracker
        .run_powershell_script(
            &script_path,
            &script_args,
            true,
            SubprocessOptions {
                timeout_ms: 120_000,
                windows_hide: !need_dialog,
            },
        )
        .await;

    if need_dialog {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let sub = match exec_res {
        Ok(s) => s,
        Err(e) => {
            return Ok(ScanResponse {
                success: false,
                cancelled: None,
                base64: None,
                temp_path: None,
                device_id: None,
                device_name: None,
                error: Some(e.to_string()),
            })
        }
    };

    let parsed: PsScanScriptOutput = match serde_json::from_str(&sub.stdout) {
        Ok(p) => p,
        Err(_) => {
            return Ok(ScanResponse {
                success: false,
                cancelled: None,
                base64: None,
                temp_path: None,
                device_id: None,
                device_name: None,
                error: Some(if sub.stderr.is_empty() {
                    "Respuesta inválida del puente WIA".to_string()
                } else {
                    sub.stderr
                }),
            })
        }
    };

    if parsed.error == "CANCELLED" {
        return Ok(ScanResponse {
            success: false,
            cancelled: Some(true),
            base64: None,
            temp_path: None,
            device_id: None,
            device_name: None,
            error: None,
        });
    }

    if !parsed.success {
        return Ok(ScanResponse {
            success: false,
            cancelled: None,
            base64: None,
            temp_path: None,
            device_id: None,
            device_name: None,
            error: Some(parsed.error),
        });
    }

    if !parsed.device_id.is_empty() {
        let mut cfg_guard = state.config.lock().unwrap();
        cfg_guard.device_id = Some(parsed.device_id.clone());
        cfg_guard.device_name = Some(parsed.device_name.clone());
        state.save_config(&cfg_guard);
    }

    let bytes = fs::read(&parsed.path)?;
    let b64 = format!("data:image/png;base64,{}", BASE64.encode(&bytes));

    Ok(ScanResponse {
        success: true,
        cancelled: None,
        base64: Some(b64),
        temp_path: Some(parsed.path),
        device_id: Some(parsed.device_id),
        device_name: Some(parsed.device_name),
        error: None,
    })
}

#[tauri::command]
pub async fn scanner_scan(
    app: AppHandle,
    state: State<'_, ScannerState>,
    opts: Option<ScanOptions>,
) -> SdkResult<ScanResponse> {
    let opts = opts.unwrap_or_default();
    let _ = fs::create_dir_all(&state.temp_dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out_path = state.temp_dir.join(format!("scan_{}.png", ts));

    let resource_dir = app.path().resource_dir().ok();
    let script_path =
        resolve_module_script_path(resource_dir.as_deref(), "mod-scanner", "scan.ps1")?;

    let mut script_args = vec![
        "-OutputPath".to_string(),
        out_path.to_string_lossy().to_string(),
        "-DPI".to_string(),
        opts.dpi.unwrap_or(300).to_string(),
        "-ColorMode".to_string(),
        opts.color_mode.unwrap_or(2).to_string(),
        "-Brightness".to_string(),
        opts.brightness.unwrap_or(0).to_string(),
        "-Contrast".to_string(),
        opts.contrast.unwrap_or(0).to_string(),
    ];
    if let Some(dev_id) = opts.device_id.filter(|s| !s.is_empty()) {
        script_args.push("-DeviceId".to_string());
        script_args.push(dev_id);
    }

    let sub = state
        .tracker
        .run_powershell_script(
            &script_path,
            &script_args,
            true,
            SubprocessOptions {
                timeout_ms: 90_000,
                windows_hide: true,
            },
        )
        .await?;

    let parsed: PsScanScriptOutput = serde_json::from_str(&sub.stdout)
        .map_err(|e| SdkError::Custom(format!("Respuesta WIA inválida: {}", e)))?;

    if !parsed.success {
        return Ok(ScanResponse {
            success: false,
            cancelled: None,
            base64: None,
            temp_path: None,
            device_id: None,
            device_name: None,
            error: Some(parsed.error),
        });
    }

    let bytes = fs::read(&parsed.path)?;
    let b64 = format!("data:image/png;base64,{}", BASE64.encode(&bytes));

    Ok(ScanResponse {
        success: true,
        cancelled: None,
        base64: Some(b64),
        temp_path: Some(parsed.path),
        device_id: None,
        device_name: None,
        error: None,
    })
}

#[tauri::command]
pub async fn scanner_save_image(data: SaveImagePayload) -> SdkResult<FileOperationResult> {
    let raw_b64 = data
        .base64
        .split(',')
        .nth(1)
        .unwrap_or(data.base64.as_str());

    match BASE64.decode(raw_b64) {
        Ok(bytes) => match fs::write(&data.dest_path, bytes) {
            Ok(_) => Ok(FileOperationResult {
                success: true,
                path: Some(data.dest_path),
                base64: None,
                error: None,
            }),
            Err(e) => Ok(FileOperationResult {
                success: false,
                path: None,
                base64: None,
                error: Some(e.to_string()),
            }),
        },
        Err(e) => Ok(FileOperationResult {
            success: false,
            path: None,
            base64: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn scanner_save_pdf(data: SavePdfPayload) -> SdkResult<FileOperationResult> {
    let dest = PathBuf::from(&data.dest_path);
    let dest_clone = dest.clone();
    let paths = data.image_paths.clone();
    let page_size = data.page_size.clone();

    let res = tokio::task::spawn_blocking(move || {
        generate_multipage_pdf(&paths, &dest_clone, &page_size)
    })
    .await
    .map_err(|e| SdkError::Custom(e.to_string()))?;

    match res {
        Ok(_) => Ok(FileOperationResult {
            success: true,
            path: Some(data.dest_path),
            base64: None,
            error: None,
        }),
        Err(e) => Ok(FileOperationResult {
            success: false,
            path: None,
            base64: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn scanner_read_base64(file_path: String) -> SdkResult<FileOperationResult> {
    let path = Path::new(&file_path);
    match fs::read(path) {
        Ok(bytes) => {
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            let mime = if ext == "png" {
                "image/png"
            } else {
                "image/jpeg"
            };
            Ok(FileOperationResult {
                success: true,
                path: Some(file_path),
                base64: Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes))),
                error: None,
            })
        }
        Err(e) => Ok(FileOperationResult {
            success: false,
            path: None,
            base64: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn scanner_show_open_folder(app: AppHandle) -> SdkResult<OpenFolderDialogResult> {
    let picked = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Seleccionar carpeta de destino")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| SdkError::Custom(e.to_string()))?;

    match picked {
        Some(folder) => Ok(OpenFolderDialogResult {
            canceled: false,
            file_paths: vec![folder.to_string()],
        }),
        None => Ok(OpenFolderDialogResult {
            canceled: true,
            file_paths: Vec::new(),
        }),
    }
}

#[tauri::command]
pub fn scanner_get_docs_path(app: AppHandle) -> String {
    let base = app
        .path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("C:\\Users\\Public\\Documents"));
    let target = base.join("EscanerAlbedo");
    let _ = fs::create_dir_all(&target);
    target.to_string_lossy().to_string()
}

#[tauri::command]
pub fn scanner_open_path(path: String) -> String {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer.exe");
        cmd.arg(&path);
        configure_std_command(&mut cmd, true);
        let _ = cmd.spawn();
    }
    String::new()
}
}

pub use commands::*;

