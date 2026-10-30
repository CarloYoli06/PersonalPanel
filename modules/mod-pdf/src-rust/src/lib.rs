use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{codecs::jpeg::JpegEncoder, DynamicImage, GenericImageView};
use lopdf::{
    content::{Content, Operation},
    dictionary, Document, Object, ObjectId, Stream, StringFormat,
};
use panel_core_sdk::{DependencyStatus, IsolatedProcessTracker, SubprocessOptions};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

// ═══════════════════════════════════════════════════════════════════════════
// Modelos de Datos (Espejo de modules/mod-pdf/src/shared/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfDocumentInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub page_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInputItem {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PdfOperationOutput {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_paths: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_percent: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_used: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePdfRequest {
    pub file_paths: Vec<String>,
    pub output_mode: String, // "same-folder" | "custom-folder" | "ask-always"
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitPdfRequest {
    pub file_path: String,
    pub mode: String, // "ranges" | "selected-pages" | "explode-all"
    pub ranges_text: Option<String>,
    pub merge_ranges_into_one: Option<bool>,
    pub selected_pages: Option<Vec<u32>>, // 1-based
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizedPageSpec {
    pub id: String,
    pub source_file_path: String,
    pub source_file_name: String,
    pub source_page_index: usize, // 0-based
    pub original_page_number: u32,
    pub rotation: i64, // 0 | 90 | 180 | 270
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizePdfRequest {
    pub base_file_path: String,
    pub pages: Vec<OrganizedPageSpec>,
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RasterizedPagePayload {
    pub jpeg_base64: String,
    pub width_pt: f64,
    pub height_pt: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressPdfRequest {
    pub file_path: String,
    pub level: String, // "low" | "medium" | "extreme"
    pub rasterized_pages: Option<Vec<RasterizedPagePayload>>,
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagesToPdfRequest {
    pub image_paths: Vec<String>,
    pub page_size: String,    // "fit" | "a4" | "letter"
    pub orientation: String,  // "auto" | "portrait" | "landscape"
    pub margin_pt: f64,
    pub optimize_heavy_images: bool,
    pub max_dimension_px: u32,
    pub jpeg_quality: u8,
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedImageItem {
    pub page_number: u32,
    pub data_url: String,
    pub ext: String, // "jpg" | "png"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveExportedImagesRequest {
    pub source_pdf_path: String,
    pub images: Vec<ExportedImageItem>,
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StampPdfRequest {
    pub file_path: String,
    pub enable_page_numbers: bool,
    pub page_number_position: String,
    pub page_number_format: String,
    pub start_page_number: u32,
    pub enable_watermark: bool,
    pub watermark_text: String,
    pub watermark_position: String,
    pub watermark_opacity: f64,
    pub watermark_font_size: f64,
    pub watermark_color_hex: String,
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSecurityRequest {
    pub file_path: String,
    pub title: String,
    pub author: String,
    pub subject: String,
    pub keywords: String,
    pub strip_all_metadata: bool,
    pub security_action: String, // "none" | "encrypt" | "decrypt"
    pub password: Option<String>,
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    pub suffix: Option<String>,
    pub reveal_on_finish: Option<bool>,
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado del Módulo PDF Studio
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Default)]
pub struct PdfState {
    pub tracker: IsolatedProcessTracker,
}

impl PdfState {
    pub fn new() -> Self {
        Self {
            tracker: IsolatedProcessTracker::new(),
        }
    }

    pub async fn check_dependencies(&self) -> Vec<DependencyStatus> {
        let qpdf_ready = self
            .tracker
            .spawn_async(
                "qpdf",
                &["--version"],
                SubprocessOptions {
                    timeout_ms: 4_000,
                    windows_hide: true,
                },
            )
            .await
            .map(|r| r.ok)
            .unwrap_or(false);

        vec![
            DependencyStatus {
                name: "Motor PDF Nativo (Rust lopdf + image)".to_string(),
                description:
                    "Motor estructural nativo de fusión, división, rotación, estampado y conversión de PDFs"
                        .to_string(),
                ready: true,
                version: Some("0.34-native".to_string()),
                binary_path: None,
                optional: Some(false),
            },
            DependencyStatus {
                name: "pdfjs-dist Canvas Rasterizer".to_string(),
                description:
                    "Renderizador bajo demanda de miniaturas reales y compresión por re-muestreo DPI"
                        .to_string(),
                ready: true,
                version: None,
                binary_path: None,
                optional: Some(false),
            },
            DependencyStatus {
                name: "qpdf CLI (Cifrado AES-256 opcional)".to_string(),
                description: "Binario opcional en PATH para encriptación con contraseña AES-256"
                    .to_string(),
                ready: qpdf_ready,
                version: None,
                binary_path: None,
                optional: Some(true),
            },
        ]
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades de Archivos, Diálogos y Manipulación con lopdf
// ═══════════════════════════════════════════════════════════════════════════

fn get_unique_file_path(dir: &Path, base_name: &str, suffix: &str, ext: &str) -> PathBuf {
    let clean_ext = if ext.starts_with('.') {
        ext.to_string()
    } else {
        format!(".{ext}")
    };
    let mut candidate = dir.join(format!("{base_name}{suffix}{clean_ext}"));
    let mut counter = 1u32;
    while candidate.exists() {
        candidate = dir.join(format!("{base_name}{suffix} ({counter}){clean_ext}"));
        counter += 1;
    }
    candidate
}

fn resolve_output_file_path(
    app: &AppHandle,
    source_path: &str,
    output_mode: &str,
    custom_output_dir: Option<&str>,
    suffix: &str,
) -> Option<PathBuf> {
    let src = Path::new(source_path);
    let dir = src.parent().unwrap_or_else(|| Path::new("."));
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento");
    let effective_suffix = if suffix.is_empty() {
        "_pdfstudio"
    } else {
        suffix
    };

    if output_mode == "ask-always" {
        let default_candidate = get_unique_file_path(dir, stem, effective_suffix, ".pdf");
        let default_name = default_candidate
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("documento.pdf")
            .to_string();

        let picked = app
            .dialog()
            .file()
            .set_title("Guardar archivo PDF resultante")
            .set_directory(dir)
            .set_file_name(&default_name)
            .add_filter("Documento PDF", &["pdf"])
            .blocking_save_file();

        return picked.and_then(|fp| fp.into_path().ok());
    }

    if output_mode == "custom-folder" {
        if let Some(custom) = custom_output_dir {
            let custom_path = Path::new(custom);
            if custom_path.exists() {
                return Some(get_unique_file_path(
                    custom_path,
                    stem,
                    effective_suffix,
                    ".pdf",
                ));
            }
        }
    }

    Some(get_unique_file_path(dir, stem, effective_suffix, ".pdf"))
}

fn resolve_output_folder(
    app: &AppHandle,
    source_path: &str,
    output_mode: &str,
    custom_output_dir: Option<&str>,
    sub_folder_suffix: &str,
) -> Option<PathBuf> {
    let src = Path::new(source_path);
    let dir = src.parent().unwrap_or_else(|| Path::new("."));
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento");

    if output_mode == "ask-always" {
        let picked = app
            .dialog()
            .file()
            .set_title("Seleccionar carpeta de destino")
            .set_directory(dir)
            .blocking_pick_folder();
        return picked.and_then(|fp| fp.into_path().ok());
    }

    let base_dir = if output_mode == "custom-folder" {
        custom_output_dir
            .map(Path::new)
            .filter(|p| p.exists())
            .unwrap_or(dir)
    } else {
        dir
    };

    let target_dir = base_dir.join(format!("{stem}{sub_folder_suffix}"));
    let _ = fs::create_dir_all(&target_dir);
    Some(target_dir)
}

fn reveal_in_explorer(tracker: &IsolatedProcessTracker, path: &Path) {
    let path_str = path.to_string_lossy().to_string();
    let tracker_clone = tracker.clone();
    tauri::async_runtime::spawn(async move {
        let _ = tracker_clone
            .spawn_async(
                "explorer.exe",
                &[&format!("/select,{path_str}")],
                SubprocessOptions {
                    timeout_ms: 5_000,
                    windows_hide: true,
                },
            )
            .await;
    });
}

fn parse_page_ranges(ranges_text: &str, max_pages: u32) -> Vec<Vec<usize>> {
    let mut groups = Vec::new();
    for part in ranges_text.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some((start_str, end_str)) = part.split_once('-') {
            if let (Ok(s), Ok(e)) = (
                start_str.trim().parse::<u32>(),
                end_str.trim().parse::<u32>(),
            ) {
                let start = s.max(1);
                let end = e.min(max_pages);
                if start <= end {
                    let group: Vec<usize> = (start..=end).map(|p| (p - 1) as usize).collect();
                    if !group.is_empty() {
                        groups.push(group);
                    }
                }
            }
        } else if let Ok(p) = part.parse::<u32>() {
            if p >= 1 && p <= max_pages {
                groups.push(vec![(p - 1) as usize]);
            }
        }
    }
    groups
}

/// Construye un nuevo `lopdf::Document` combinando páginas específicas (y sus rotaciones)
/// de uno o más documentos cargados.
fn build_combined_pdf(
    selections: &[(String, usize, i64)], // (source_path, 0-based page_index, rotation_delta)
) -> Result<Document, String> {
    let mut master_doc = Document::with_version("1.5");
    let mut max_id = 1u32;
    let mut collected_page_ids: Vec<ObjectId> = Vec::with_capacity(selections.len());

    // Cachear bytes por ruta para evitar lecturas repetidas en Organize
    let mut raw_cache: HashMap<String, Vec<u8>> = HashMap::new();

    for (source_path, page_idx, rotation_delta) in selections {
        let bytes = if let Some(cached) = raw_cache.get(source_path) {
            cached.clone()
        } else {
            let loaded = fs::read(source_path)
                .map_err(|e| format!("No se pudo leer '{source_path}': {e}"))?;
            raw_cache.insert(source_path.clone(), loaded.clone());
            loaded
        };

        let mut doc = Document::load_mem(&bytes)
            .map_err(|e| format!("Error parseando PDF '{source_path}': {e}"))?;

        doc.renumber_objects_with(max_id);
        max_id = doc.max_id + 1;

        let pages_map: BTreeMap<u32, ObjectId> = doc.get_pages();
        let target_page_num = (*page_idx as u32) + 1;
        let &page_obj_id = pages_map.get(&target_page_num).ok_or_else(|| {
            format!("La página {target_page_num} no existe en '{source_path}'")
        })?;

        if *rotation_delta != 0 {
            if let Ok(page_dict) = doc
                .get_object_mut(page_obj_id)
                .and_then(Object::as_dict_mut)
            {
                let current_rot = page_dict
                    .get(b"Rotate")
                    .ok()
                    .and_then(|o| o.as_i64().ok())
                    .unwrap_or(0);
                let new_rot = (current_rot + rotation_delta).rem_euclid(360);
                page_dict.set("Rotate", Object::Integer(new_rot));
            }
        }

        collected_page_ids.push(page_obj_id);
        for (id, obj) in doc.objects {
            master_doc.objects.insert(id, obj);
        }
    }

    let pages_root_id: ObjectId = (max_id, 0);
    max_id += 1;
    let catalog_id: ObjectId = (max_id, 0);
    master_doc.max_id = max_id;

    for &pid in &collected_page_ids {
        if let Ok(dict) = master_doc.get_object_mut(pid).and_then(Object::as_dict_mut) {
            dict.set("Parent", Object::Reference(pages_root_id));
        }
    }

    let kids: Vec<Object> = collected_page_ids
        .iter()
        .map(|&id| Object::Reference(id))
        .collect();

    master_doc.objects.insert(
        pages_root_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => collected_page_ids.len() as i64,
        }),
    );

    master_doc.objects.insert(
        catalog_id,
        Object::Dictionary(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_root_id,
        }),
    );

    master_doc.trailer.set("Root", catalog_id);
    let _ = master_doc.prune_objects();
    master_doc.compress();
    Ok(master_doc)
}

/// Genera un documento PDF a partir de páginas JPEG codificadas y sus dimensiones en puntos.
fn build_pdf_from_jpeg_pages(
    pages: &[(Vec<u8>, u32, u32, f64, f64, f64, f64, f64, f64)],
    // (jpeg_bytes, px_w, px_h, page_w_pt, page_h_pt, draw_x, draw_y, draw_w, draw_h)
) -> Result<Vec<u8>, String> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut page_ids = Vec::with_capacity(pages.len());

    for (idx, (jpeg_bytes, px_w, px_h, page_w, page_h, draw_x, draw_y, draw_w, draw_h)) in
        pages.iter().enumerate()
    {
        let img_name = format!("Im{}", idx + 1);
        let img_stream = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => *px_w as i64,
                "Height" => *px_h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
                "Filter" => "DCTDecode",
            },
            jpeg_bytes.clone(),
        );
        let img_id = doc.add_object(img_stream);

        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new(
                    "cm",
                    vec![
                        (*draw_w as f32).into(),
                        0.into(),
                        0.into(),
                        (*draw_h as f32).into(),
                        (*draw_x as f32).into(),
                        (*draw_y as f32).into(),
                    ],
                ),
                Operation::new("Do", vec![Object::Name(img_name.as_bytes().to_vec())]),
                Operation::new("Q", vec![]),
            ],
        };
        let content_bytes = content
            .encode()
            .map_err(|e| format!("Error codificando página PDF: {e}"))?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        let mut xobject_dict = lopdf::Dictionary::new();
        xobject_dict.set(img_name, img_id);

        let resources_id = doc.add_object(dictionary! {
            "XObject" => xobject_dict,
        });

        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), (*page_w as f32).into(), (*page_h as f32).into()],
            "Contents" => content_id,
            "Resources" => resources_id,
        });
        page_ids.push(Object::Reference(page_id));
    }

    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids,
            "Count" => pages.len() as i64,
        }),
    );

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();

    let mut out_buf = Vec::new();
    doc.save_to(&mut out_buf)
        .map_err(|e| format!("Error guardando PDF en memoria: {e}"))?;
    Ok(out_buf)
}

fn read_info_string(doc: &Document, info_dict: &lopdf::Dictionary, key: &[u8]) -> Option<String> {
    let obj = info_dict.get(key).ok()?;
    let resolved = match obj {
        Object::Reference(id) => doc.get_object(*id).ok()?,
        other => other,
    };
    match resolved {
        Object::String(bytes, _) => Some(String::from_utf8_lossy(bytes).to_string()),
        _ => None,
    }
}

fn parse_hex_color(hex: &str) -> (f32, f32, f32) {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&clean[0..2], 16),
            u8::from_str_radix(&clean[2..4], 16),
            u8::from_str_radix(&clean[4..6], 16),
        ) {
            return (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
        }
    }
    (0.85, 0.15, 0.25)
}

fn encode_rgb_jpeg(img: &DynamicImage, quality: u8) -> Result<(Vec<u8>, u32, u32), String> {
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();
    let mut buf = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut buf, quality.clamp(10, 100));
    encoder
        .encode(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("Error codificando JPEG: {e}"))?;
    Ok((buf, w, h))
}

// ═══════════════════════════════════════════════════════════════════════════
// Comandos Tauri de mod-pdf
// ═══════════════════════════════════════════════════════════════════════════

pub mod commands {
    use super::*;

#[tauri::command]
pub async fn pdf_select_pdf_files(
    app: AppHandle,
    multiple: Option<bool>,
) -> Result<Vec<String>, String> {
    let allow_multi = multiple.unwrap_or(true);
    let builder = app
        .dialog()
        .file()
        .set_title("Seleccionar archivos PDF")
        .add_filter("Documentos PDF", &["pdf"]);

    if allow_multi {
        let files = builder.blocking_pick_files();
        Ok(files
            .unwrap_or_default()
            .into_iter()
            .filter_map(|f| f.into_path().ok())
            .map(|p| p.to_string_lossy().to_string())
            .collect())
    } else {
        let file = builder.blocking_pick_file();
        Ok(file
            .and_then(|f| f.into_path().ok())
            .map(|p| vec![p.to_string_lossy().to_string()])
            .unwrap_or_default())
    }
}

#[tauri::command]
pub async fn pdf_select_image_files(app: AppHandle) -> Result<Vec<String>, String> {
    let files = app
        .dialog()
        .file()
        .set_title("Seleccionar imágenes para convertir a PDF")
        .add_filter(
            "Imágenes soportadas",
            &["jpg", "jpeg", "png", "webp", "bmp"],
        )
        .blocking_pick_files();

    Ok(files
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn pdf_select_output_folder(
    app: AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let mut builder = app
        .dialog()
        .file()
        .set_title("Seleccionar carpeta de salida por defecto");

    if let Some(ref dp) = default_path {
        let path = Path::new(dp);
        if path.exists() {
            builder = builder.set_directory(path);
        }
    }

    let folder = builder.blocking_pick_folder();
    Ok(folder
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn pdf_inspect_pdfs(file_paths: Vec<String>) -> Result<Vec<PdfDocumentInfo>, String> {
    let mut results = Vec::with_capacity(file_paths.len());

    for file_path in file_paths {
        let p = Path::new(&file_path);
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_path)
            .to_string();
        let size_bytes = fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

        match Document::load(&file_path) {
            Ok(doc) => {
                let page_count = doc.get_pages().len() as u32;
                let encrypted = doc.trailer.get(b"Encrypt").is_ok();

                let (mut title, mut author, mut subject, mut keywords, mut creator) =
                    (None, None, None, None, None);

                if let Ok(info_ref) = doc.trailer.get(b"Info").and_then(Object::as_reference) {
                    if let Ok(info_dict) = doc.get_object(info_ref).and_then(Object::as_dict) {
                        title = read_info_string(&doc, info_dict, b"Title");
                        author = read_info_string(&doc, info_dict, b"Author");
                        subject = read_info_string(&doc, info_dict, b"Subject");
                        keywords = read_info_string(&doc, info_dict, b"Keywords");
                        creator = read_info_string(&doc, info_dict, b"Creator");
                    }
                }

                results.push(PdfDocumentInfo {
                    path: file_path,
                    name,
                    size_bytes,
                    page_count,
                    title: Some(title.unwrap_or_default()),
                    author: Some(author.unwrap_or_default()),
                    subject: Some(subject.unwrap_or_default()),
                    keywords: Some(keywords.unwrap_or_default()),
                    creator: Some(creator.unwrap_or_default()),
                    encrypted: Some(encrypted),
                    error: None,
                });
            }
            Err(err) => {
                results.push(PdfDocumentInfo {
                    path: file_path,
                    name,
                    size_bytes,
                    page_count: 0,
                    title: None,
                    author: None,
                    subject: None,
                    keywords: None,
                    creator: None,
                    encrypted: None,
                    error: Some(format!("No se pudo leer el archivo PDF: {err}")),
                });
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn pdf_inspect_images(file_paths: Vec<String>) -> Result<Vec<ImageInputItem>, String> {
    let mut results = Vec::new();
    for file_path in file_paths {
        let p = Path::new(&file_path);
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_path)
            .to_string();
        if let Ok(meta) = fs::metadata(&file_path) {
            let (width, height) = image::image_dimensions(&file_path).unwrap_or((1200, 1600));
            results.push(ImageInputItem {
                path: file_path,
                name,
                size_bytes: meta.len(),
                width,
                height,
            });
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn pdf_read_pdf_bytes(file_path: String) -> Result<Option<Vec<u8>>, String> {
    Ok(fs::read(&file_path).ok())
}

#[tauri::command]
pub async fn pdf_read_image_data_url(
    file_path: String,
    max_preview_px: Option<u32>,
) -> Result<Option<String>, String> {
    let max_px = max_preview_px.unwrap_or(320);
    let img = match image::open(&file_path) {
        Ok(i) => i,
        Err(_) => return Ok(None),
    };
    let (w, h) = img.dimensions();
    let processed = if w > max_px || h > max_px {
        img.thumbnail(max_px, max_px)
    } else {
        img
    };

    match encode_rgb_jpeg(&processed, 78) {
        Ok((jpeg_bytes, _, _)) => Ok(Some(format!(
            "data:image/jpeg;base64,{}",
            BASE64.encode(jpeg_bytes)
        ))),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn pdf_merge(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: MergePdfRequest,
) -> Result<PdfOperationOutput, String> {
    if req.file_paths.len() < 2 {
        return Ok(PdfOperationOutput {
            success: false,
            message: "Selecciona al menos 2 archivos PDF para unir.".to_string(),
            ..Default::default()
        });
    }

    let suffix = req.suffix.as_deref().unwrap_or("_unido");
    let Some(output_path) = resolve_output_file_path(
        &app,
        &req.file_paths[0],
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut total_original_bytes = 0u64;
    let mut selections: Vec<(String, usize, i64)> = Vec::new();

    for path in &req.file_paths {
        total_original_bytes += fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let doc = Document::load(path)
            .map_err(|e| format!("No se pudo abrir '{path}': {e}"))?;
        let count = doc.get_pages().len();
        for idx in 0..count {
            selections.push((path.clone(), idx, 0));
        }
    }

    match build_combined_pdf(&selections) {
        Ok(mut merged_doc) => {
            let total_pages = merged_doc.get_pages().len();
            if let Err(e) = merged_doc.save(&output_path) {
                return Ok(PdfOperationOutput {
                    success: false,
                    message: "Error al guardar el PDF unido.".to_string(),
                    error: Some(e.to_string()),
                    ..Default::default()
                });
            }
            let output_bytes = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
            if req.reveal_on_finish.unwrap_or(false) {
                reveal_in_explorer(&state.tracker, &output_path);
            }
            Ok(PdfOperationOutput {
                success: true,
                message: format!(
                    "Se unieron {} PDFs ({total_pages} páginas en total).",
                    req.file_paths.len()
                ),
                output_path: Some(output_path.to_string_lossy().to_string()),
                original_bytes: Some(total_original_bytes),
                output_bytes: Some(output_bytes),
                ..Default::default()
            })
        }
        Err(err) => Ok(PdfOperationOutput {
            success: false,
            message: "Error al unir los documentos PDF.".to_string(),
            error: Some(err),
            ..Default::default()
        }),
    }
}

#[tauri::command]
pub async fn pdf_split(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: SplitPdfRequest,
) -> Result<PdfOperationOutput, String> {
    let doc = match Document::load(&req.file_path) {
        Ok(d) => d,
        Err(e) => {
            return Ok(PdfOperationOutput {
                success: false,
                message: "No se pudo abrir el documento PDF de origen.".to_string(),
                error: Some(e.to_string()),
                ..Default::default()
            })
        }
    };

    let total_pages = doc.get_pages().len() as u32;
    let stem = Path::new(&req.file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento")
        .to_string();

    let single_file_mode = req.mode == "selected-pages"
        || (req.mode == "ranges" && req.merge_ranges_into_one.unwrap_or(false));

    if single_file_mode {
        let indices: Vec<usize> = if req.mode == "selected-pages" {
            req.selected_pages
                .unwrap_or_default()
                .into_iter()
                .filter(|&p| p >= 1 && p <= total_pages)
                .map(|p| (p - 1) as usize)
                .collect()
        } else {
            parse_page_ranges(req.ranges_text.as_deref().unwrap_or(""), total_pages)
                .into_iter()
                .flatten()
                .collect()
        };

        if indices.is_empty() {
            return Ok(PdfOperationOutput {
                success: false,
                message: "No se seleccionaron páginas o rangos válidos para extraer.".to_string(),
                ..Default::default()
            });
        }

        let suffix = req.suffix.as_deref().unwrap_or("_extraido");
        let Some(output_path) = resolve_output_file_path(
            &app,
            &req.file_path,
            &req.output_mode,
            req.custom_output_dir.as_deref(),
            suffix,
        ) else {
            return Ok(PdfOperationOutput {
                success: false,
                canceled: Some(true),
                message: "Operación cancelada.".to_string(),
                ..Default::default()
            });
        };

        let selections: Vec<(String, usize, i64)> = indices
            .iter()
            .map(|&idx| (req.file_path.clone(), idx, 0))
            .collect();

        let mut out_doc = build_combined_pdf(&selections)?;
        out_doc
            .save(&output_path)
            .map_err(|e| format!("Error guardando PDF extraído: {e}"))?;
        let output_bytes = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

        if req.reveal_on_finish.unwrap_or(false) {
            reveal_in_explorer(&state.tracker, &output_path);
        }

        return Ok(PdfOperationOutput {
            success: true,
            message: format!(
                "Se extrajeron {} páginas en un nuevo documento PDF.",
                indices.len()
            ),
            output_path: Some(output_path.to_string_lossy().to_string()),
            output_bytes: Some(output_bytes),
            ..Default::default()
        });
    }

    // Múltiples archivos PDF
    let groups: Vec<Vec<usize>> = if req.mode == "explode-all" {
        (0..total_pages as usize).map(|i| vec![i]).collect()
    } else {
        parse_page_ranges(req.ranges_text.as_deref().unwrap_or(""), total_pages)
    };

    if groups.is_empty() {
        return Ok(PdfOperationOutput {
            success: false,
            message: "Introduce al menos un rango válido (ej. 1-3, 5, 8-10).".to_string(),
            ..Default::default()
        });
    }

    let suffix = req.suffix.as_deref().unwrap_or("_dividido");
    let Some(out_folder) = resolve_output_folder(
        &app,
        &req.file_path,
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut output_paths = Vec::with_capacity(groups.len());
    for group in &groups {
        let selections: Vec<(String, usize, i64)> = group
            .iter()
            .map(|&idx| (req.file_path.clone(), idx, 0))
            .collect();
        let mut sub_doc = build_combined_pdf(&selections)?;
        let label = if group.len() == 1 {
            format!("_pag_{:03}", group[0] + 1)
        } else {
            format!("_rango_{}-{}", group[0] + 1, group[group.len() - 1] + 1)
        };
        let target_file = get_unique_file_path(&out_folder, &stem, &label, ".pdf");
        sub_doc
            .save(&target_file)
            .map_err(|e| format!("Error guardando fragmento PDF: {e}"))?;
        output_paths.push(target_file.to_string_lossy().to_string());
    }

    if req.reveal_on_finish.unwrap_or(false) {
        if let Some(first) = output_paths.first() {
            reveal_in_explorer(&state.tracker, Path::new(first));
        }
    }

    Ok(PdfOperationOutput {
        success: true,
        message: format!(
            "Se generaron {} archivos PDF en la carpeta de destino.",
            output_paths.len()
        ),
        output_path: output_paths.first().cloned(),
        output_paths: Some(output_paths),
        output_dir: Some(out_folder.to_string_lossy().to_string()),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn pdf_organize(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: OrganizePdfRequest,
) -> Result<PdfOperationOutput, String> {
    if req.pages.is_empty() {
        return Ok(PdfOperationOutput {
            success: false,
            message: "El documento debe conservar al menos una página.".to_string(),
            ..Default::default()
        });
    }

    let suffix = req.suffix.as_deref().unwrap_or("_organizado");
    let Some(output_path) = resolve_output_file_path(
        &app,
        &req.base_file_path,
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let selections: Vec<(String, usize, i64)> = req
        .pages
        .iter()
        .map(|s| (s.source_file_path.clone(), s.source_page_index, s.rotation))
        .collect();

    match build_combined_pdf(&selections) {
        Ok(mut out_doc) => {
            let count = out_doc.get_pages().len();
            out_doc
                .save(&output_path)
                .map_err(|e| format!("Error guardando PDF organizado: {e}"))?;
            let output_bytes = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
            if req.reveal_on_finish.unwrap_or(false) {
                reveal_in_explorer(&state.tracker, &output_path);
            }
            Ok(PdfOperationOutput {
                success: true,
                message: format!("Documento organizado guardado ({count} páginas)."),
                output_path: Some(output_path.to_string_lossy().to_string()),
                output_bytes: Some(output_bytes),
                ..Default::default()
            })
        }
        Err(err) => Ok(PdfOperationOutput {
            success: false,
            message: "Error al organizar el documento PDF.".to_string(),
            error: Some(err),
            ..Default::default()
        }),
    }
}

#[tauri::command]
pub async fn pdf_compress(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: CompressPdfRequest,
) -> Result<PdfOperationOutput, String> {
    let original_bytes = fs::metadata(&req.file_path).map(|m| m.len()).unwrap_or(0);
    let suffix = req.suffix.as_deref().unwrap_or("_comprimido");
    let Some(output_path) = resolve_output_file_path(
        &app,
        &req.file_path,
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut doc = Document::load(&req.file_path)
        .map_err(|e| format!("No se pudo leer el PDF a comprimir: {e}"))?;
    let _ = doc.prune_objects();
    doc.delete_zero_length_streams();
    doc.compress();

    let mut structural_bytes = Vec::new();
    doc.save_to(&mut structural_bytes)
        .map_err(|e| format!("Error comprimiendo flujos del PDF: {e}"))?;

    let mut final_bytes = structural_bytes;

    if (req.level == "medium" || req.level == "extreme")
        && req
            .rasterized_pages
            .as_ref()
            .map(|p| !p.is_empty())
            .unwrap_or(false)
    {
        let mut raster_specs = Vec::new();
        for page_data in req.rasterized_pages.unwrap_or_default() {
            let clean_b64 = page_data
                .jpeg_base64
                .split(',')
                .nth(1)
                .unwrap_or(&page_data.jpeg_base64);
            if let Ok(jpeg_bytes) = BASE64.decode(clean_b64.trim()) {
                let (px_w, px_h) = image::load_from_memory(&jpeg_bytes)
                    .map(|img| img.dimensions())
                    .unwrap_or((1200, 1600));
                raster_specs.push((
                    jpeg_bytes,
                    px_w,
                    px_h,
                    page_data.width_pt,
                    page_data.height_pt,
                    0.0,
                    0.0,
                    page_data.width_pt,
                    page_data.height_pt,
                ));
            }
        }
        if !raster_specs.is_empty() {
            if let Ok(raster_bytes) = build_pdf_from_jpeg_pages(&raster_specs) {
                if raster_bytes.len() < final_bytes.len() {
                    final_bytes = raster_bytes;
                }
            }
        }
    }

    fs::write(&output_path, &final_bytes)
        .map_err(|e| format!("No se pudo escribir el PDF comprimido: {e}"))?;

    let output_bytes = final_bytes.len() as u64;
    let saved_bytes = original_bytes.saturating_sub(output_bytes);
    let saved_percent = if original_bytes > 0 {
        ((saved_bytes as f64 / original_bytes as f64) * 100.0).round() as u32
    } else {
        0
    };

    if req.reveal_on_finish.unwrap_or(false) {
        reveal_in_explorer(&state.tracker, &output_path);
    }

    Ok(PdfOperationOutput {
        success: true,
        message: if saved_percent > 0 {
            format!("PDF optimizado con éxito: ahorraste un {saved_percent}% de espacio.")
        } else {
            "PDF optimizado (el archivo original ya se encontraba altamente comprimido)."
                .to_string()
        },
        output_path: Some(output_path.to_string_lossy().to_string()),
        original_bytes: Some(original_bytes),
        output_bytes: Some(output_bytes),
        saved_percent: Some(saved_percent),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn pdf_images_to_pdf(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: ImagesToPdfRequest,
) -> Result<PdfOperationOutput, String> {
    if req.image_paths.is_empty() {
        return Ok(PdfOperationOutput {
            success: false,
            message: "Añade al menos una imagen para generar el PDF.".to_string(),
            ..Default::default()
        });
    }

    let suffix = req.suffix.as_deref().unwrap_or("_imagenes");
    let Some(output_path) = resolve_output_file_path(
        &app,
        &req.image_paths[0],
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut total_original_bytes = 0u64;
    let mut page_specs = Vec::with_capacity(req.image_paths.len());
    let max_dim = if req.max_dimension_px > 0 {
        req.max_dimension_px
    } else {
        2200
    };
    let quality = if req.jpeg_quality > 0 {
        req.jpeg_quality
    } else {
        82
    };

    for img_path in &req.image_paths {
        total_original_bytes += fs::metadata(img_path).map(|m| m.len()).unwrap_or(0);
        let dyn_img = image::open(img_path)
            .map_err(|e| format!("No se pudo abrir la imagen '{img_path}': {e}"))?;
        let (orig_w, orig_h) = dyn_img.dimensions();

        let processed_img = if req.optimize_heavy_images && (orig_w > max_dim || orig_h > max_dim)
        {
            dyn_img.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3)
        } else {
            dyn_img
        };

        let (jpeg_bytes, img_w, img_h) = encode_rgb_jpeg(&processed_img, quality)?;
        let img_w_f = img_w as f64;
        let img_h_f = img_h as f64;
        let margin = req.margin_pt.max(0.0);

        let (page_w, page_h) = if req.page_size == "a4" || req.page_size == "letter" {
            let base_w = if req.page_size == "a4" { 595.28 } else { 612.0 };
            let base_h = if req.page_size == "a4" { 841.89 } else { 792.0 };
            let is_landscape = req.orientation == "landscape"
                || (req.orientation == "auto" && img_w_f > img_h_f);
            if is_landscape {
                (base_h, base_w)
            } else {
                (base_w, base_h)
            }
        } else {
            (img_w_f + margin * 2.0, img_h_f + margin * 2.0)
        };

        let avail_w = (page_w - margin * 2.0).max(20.0);
        let avail_h = (page_h - margin * 2.0).max(20.0);
        let scale = (avail_w / img_w_f).min(avail_h / img_h_f);
        let draw_w = img_w_f * scale;
        let draw_h = img_h_f * scale;
        let draw_x = (page_w - draw_w) / 2.0;
        let draw_y = (page_h - draw_h) / 2.0;

        page_specs.push((
            jpeg_bytes, img_w, img_h, page_w, page_h, draw_x, draw_y, draw_w, draw_h,
        ));
    }

    let pdf_bytes = build_pdf_from_jpeg_pages(&page_specs)?;
    fs::write(&output_path, &pdf_bytes)
        .map_err(|e| format!("Error guardando PDF de imágenes: {e}"))?;

    if req.reveal_on_finish.unwrap_or(false) {
        reveal_in_explorer(&state.tracker, &output_path);
    }

    Ok(PdfOperationOutput {
        success: true,
        message: format!(
            "Documento PDF creado con {} imágenes.",
            req.image_paths.len()
        ),
        output_path: Some(output_path.to_string_lossy().to_string()),
        original_bytes: Some(total_original_bytes),
        output_bytes: Some(pdf_bytes.len() as u64),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn pdf_save_exported_images(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: SaveExportedImagesRequest,
) -> Result<PdfOperationOutput, String> {
    if req.images.is_empty() {
        return Ok(PdfOperationOutput {
            success: false,
            message: "No hay páginas renderizadas para exportar.".to_string(),
            ..Default::default()
        });
    }

    let stem = Path::new(&req.source_pdf_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento")
        .to_string();

    let Some(out_folder) = resolve_output_folder(
        &app,
        &req.source_pdf_path,
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        "_imagenes",
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut output_paths = Vec::with_capacity(req.images.len());
    for item in &req.images {
        let clean_b64 = item
            .data_url
            .split(',')
            .nth(1)
            .unwrap_or(&item.data_url);
        let bytes = BASE64
            .decode(clean_b64.trim())
            .map_err(|e| format!("Datos de imagen inválidos: {e}"))?;
        let page_label = format!("_pag_{:03}", item.page_number);
        let target_path = get_unique_file_path(&out_folder, &stem, &page_label, &item.ext);
        fs::write(&target_path, bytes)
            .map_err(|e| format!("No se pudo guardar la imagen exportada: {e}"))?;
        output_paths.push(target_path.to_string_lossy().to_string());
    }

    if req.reveal_on_finish.unwrap_or(false) {
        if let Some(first) = output_paths.first() {
            reveal_in_explorer(&state.tracker, Path::new(first));
        }
    }

    Ok(PdfOperationOutput {
        success: true,
        message: format!(
            "Se exportaron {} imágenes correctamente.",
            output_paths.len()
        ),
        output_path: output_paths.first().cloned(),
        output_paths: Some(output_paths),
        output_dir: Some(out_folder.to_string_lossy().to_string()),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn pdf_stamp(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: StampPdfRequest,
) -> Result<PdfOperationOutput, String> {
    if !req.enable_page_numbers && (!req.enable_watermark || req.watermark_text.trim().is_empty()) {
        return Ok(PdfOperationOutput {
            success: false,
            message: "Activa la numeración de páginas o escribe un texto de marca de agua."
                .to_string(),
            ..Default::default()
        });
    }

    let suffix = req.suffix.as_deref().unwrap_or("_sellado");
    let Some(output_path) = resolve_output_file_path(
        &app,
        &req.file_path,
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut doc = Document::load(&req.file_path)
        .map_err(|e| format!("No se pudo abrir el PDF para sellar: {e}"))?;

    let font_regular_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });
    let font_bold_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica-Bold",
        "Encoding" => "WinAnsiEncoding",
    });

    let pages_map: BTreeMap<u32, ObjectId> = doc.get_pages();
    let total = pages_map.len() as u32;
    let (wm_r, wm_g, wm_b) = parse_hex_color(&req.watermark_color_hex);

    for (idx, (&_page_num, &page_id)) in pages_map.iter().enumerate() {
        let (width, height) = doc
            .get_object(page_id)
            .and_then(Object::as_dict)
            .and_then(|d| d.get(b"MediaBox"))
            .and_then(Object::as_array)
            .map(|arr| {
                let w = arr
                    .get(2)
                    .and_then(|o| o.as_f32().ok().or_else(|| o.as_i64().ok().map(|v| v as f32)))
                    .unwrap_or(595.28);
                let h = arr
                    .get(3)
                    .and_then(|o| o.as_f32().ok().or_else(|| o.as_i64().ok().map(|v| v as f32)))
                    .unwrap_or(841.89);
                (w, h)
            })
            .unwrap_or((595.28, 841.89));

        // Asegurar referencias de fuente en los Resources de la página
        if let Ok(page_dict) = doc.get_object_mut(page_id).and_then(Object::as_dict_mut) {
            if let Ok(Object::Dictionary(res_dict)) = page_dict.get_mut(b"Resources") {
                if let Ok(Object::Dictionary(font_dict)) = res_dict.get_mut(b"Font") {
                    font_dict.set("FPanelReg", font_regular_id);
                    font_dict.set("FPanelBold", font_bold_id);
                } else {
                    res_dict.set(
                        "Font",
                        dictionary! {
                            "FPanelReg" => font_regular_id,
                            "FPanelBold" => font_bold_id,
                        },
                    );
                }
            }
        }

        let mut ops: Vec<Operation> = Vec::new();

        if req.enable_watermark && !req.watermark_text.trim().is_empty() {
            let text = req.watermark_text.trim();
            let font_size = (req.watermark_font_size as f32).clamp(12.0, 120.0);
            let approx_width = text.chars().count() as f32 * font_size * 0.52;

            ops.push(Operation::new("q", vec![]));
            ops.push(Operation::new("BT", vec![]));
            ops.push(Operation::new(
                "Tf",
                vec![Object::Name(b"FPanelBold".to_vec()), font_size.into()],
            ));
            ops.push(Operation::new(
                "rg",
                vec![wm_r.into(), wm_g.into(), wm_b.into()],
            ));

            if req.watermark_position == "diagonal" {
                let cos45 = std::f32::consts::FRAC_1_SQRT_2;
                let sin45 = std::f32::consts::FRAC_1_SQRT_2;
                let x = (width / 2.0) - (approx_width * cos45) / 2.0;
                let y = (height / 2.0) - (approx_width * sin45) / 2.0;
                ops.push(Operation::new(
                    "Tm",
                    vec![
                        cos45.into(),
                        sin45.into(),
                        (-sin45).into(),
                        cos45.into(),
                        x.into(),
                        y.into(),
                    ],
                ));
            } else {
                let x = ((width - approx_width) / 2.0).max(20.0);
                let y = match req.watermark_position.as_str() {
                    "header" => height - font_size - 28.0,
                    "footer" => 28.0,
                    _ => height / 2.0,
                };
                ops.push(Operation::new(
                    "Tm",
                    vec![1.into(), 0.into(), 0.into(), 1.into(), x.into(), y.into()],
                ));
            }

            ops.push(Operation::new(
                "Tj",
                vec![Object::String(
                    text.as_bytes().to_vec(),
                    StringFormat::Literal,
                )],
            ));
            ops.push(Operation::new("ET", vec![]));
            ops.push(Operation::new("Q", vec![]));
        }

        if req.enable_page_numbers {
            let start = req.start_page_number.max(1);
            let num = start + idx as u32;
            let total_label = start + total.saturating_sub(1);
            let label = if req.page_number_format == "simple" {
                format!("{num}")
            } else {
                format!("Pagina {num} de {total_label}")
            };

            let num_font_size = 10.0f32;
            let label_width = label.chars().count() as f32 * num_font_size * 0.5;
            let margin_x = 32.0f32;
            let margin_y = 24.0f32;

            let x = if req.page_number_position == "bottom-center"
                || req.page_number_position == "top-center"
            {
                (width - label_width) / 2.0
            } else if req.page_number_position == "bottom-left" {
                margin_x
            } else {
                width - label_width - margin_x
            };

            let y = if req.page_number_position == "top-right"
                || req.page_number_position == "top-center"
            {
                height - margin_y - num_font_size
            } else {
                margin_y
            };

            ops.push(Operation::new("q", vec![]));
            ops.push(Operation::new("BT", vec![]));
            ops.push(Operation::new(
                "Tf",
                vec![Object::Name(b"FPanelReg".to_vec()), num_font_size.into()],
            ));
            ops.push(Operation::new(
                "rg",
                vec![0.32f32.into(), 0.32f32.into(), 0.36f32.into()],
            ));
            ops.push(Operation::new(
                "Tm",
                vec![1.into(), 0.into(), 0.into(), 1.into(), x.into(), y.into()],
            ));
            ops.push(Operation::new(
                "Tj",
                vec![Object::String(
                    label.as_bytes().to_vec(),
                    StringFormat::Literal,
                )],
            ));
            ops.push(Operation::new("ET", vec![]));
            ops.push(Operation::new("Q", vec![]));
        }

        if !ops.is_empty() {
            let content = Content { operations: ops };
            let _ = doc.add_to_page_content(page_id, content);
        }
    }

    doc.compress();
    doc.save(&output_path)
        .map_err(|e| format!("Error guardando PDF sellado: {e}"))?;
    let output_bytes = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

    if req.reveal_on_finish.unwrap_or(false) {
        reveal_in_explorer(&state.tracker, &output_path);
    }

    Ok(PdfOperationOutput {
        success: true,
        message: format!("Sellado aplicado a las {total} páginas del documento."),
        output_path: Some(output_path.to_string_lossy().to_string()),
        output_bytes: Some(output_bytes),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn pdf_update_metadata_security(
    app: AppHandle,
    state: State<'_, PdfState>,
    req: MetadataSecurityRequest,
) -> Result<PdfOperationOutput, String> {
    let suffix = req.suffix.as_deref().unwrap_or("_meta");
    let Some(output_path) = resolve_output_file_path(
        &app,
        &req.file_path,
        &req.output_mode,
        req.custom_output_dir.as_deref(),
        suffix,
    ) else {
        return Ok(PdfOperationOutput {
            success: false,
            canceled: Some(true),
            message: "Operación cancelada.".to_string(),
            ..Default::default()
        });
    };

    let mut doc = Document::load(&req.file_path)
        .map_err(|e| format!("No se pudo abrir el PDF: {e}"))?;

    let info_dict = if req.strip_all_metadata {
        dictionary! {
            "Title" => Object::string_literal(""),
            "Author" => Object::string_literal(""),
            "Subject" => Object::string_literal(""),
            "Keywords" => Object::string_literal(""),
            "Producer" => Object::string_literal(""),
            "Creator" => Object::string_literal(""),
        }
    } else {
        dictionary! {
            "Title" => Object::string_literal(req.title.trim()),
            "Author" => Object::string_literal(req.author.trim()),
            "Subject" => Object::string_literal(req.subject.trim()),
            "Keywords" => Object::string_literal(req.keywords.trim()),
            "Producer" => Object::string_literal("PersonalPanel PDF Studio (Rust)"),
        }
    };

    let info_id = doc.add_object(info_dict);
    doc.trailer.set("Info", info_id);
    doc.compress();
    doc.save(&output_path)
        .map_err(|e| format!("Error guardando metadatos del PDF: {e}"))?;

    let output_path_str = output_path.to_string_lossy().to_string();

    if req.security_action != "none" {
        if let Some(ref pwd) = req.password {
            if !pwd.is_empty() {
                let qpdf_check = state
                    .tracker
                    .spawn_async(
                        "qpdf",
                        &["--version"],
                        SubprocessOptions {
                            timeout_ms: 4_000,
                            windows_hide: true,
                        },
                    )
                    .await
                    .map(|r| r.ok)
                    .unwrap_or(false);

                if qpdf_check {
                    let temp_input = format!("{output_path_str}.tmp.pdf");
                    let _ = fs::rename(&output_path, &temp_input);

                    let q_res = if req.security_action == "encrypt" {
                        state
                            .tracker
                            .spawn_async(
                                "qpdf",
                                &[
                                    "--encrypt",
                                    pwd,
                                    pwd,
                                    "256",
                                    "--",
                                    &temp_input,
                                    &output_path_str,
                                ],
                                SubprocessOptions {
                                    timeout_ms: 20_000,
                                    windows_hide: true,
                                },
                            )
                            .await
                    } else {
                        let pwd_arg = format!("--password={pwd}");
                        state
                            .tracker
                            .spawn_async(
                                "qpdf",
                                &[&pwd_arg, "--decrypt", &temp_input, &output_path_str],
                                SubprocessOptions {
                                    timeout_ms: 20_000,
                                    windows_hide: true,
                                },
                            )
                            .await
                    };

                    let _ = fs::remove_file(&temp_input);

                    match q_res {
                        Ok(r) if !r.ok => {
                            return Ok(PdfOperationOutput {
                                success: false,
                                message: "qpdf reportó un error al procesar el cifrado del PDF."
                                    .to_string(),
                                error: Some(r.stderr),
                                ..Default::default()
                            });
                        }
                        Err(e) => {
                            return Ok(PdfOperationOutput {
                                success: false,
                                message: "Error al invocar qpdf.".to_string(),
                                error: Some(e.to_string()),
                                ..Default::default()
                            });
                        }
                        _ => {}
                    }
                } else {
                    let output_bytes = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
                    if req.reveal_on_finish.unwrap_or(false) {
                        reveal_in_explorer(&state.tracker, &output_path);
                    }
                    return Ok(PdfOperationOutput {
                        success: true,
                        message: "Metadatos actualizados y flujos reconstruidos (Nota: Para cifrado AES por contraseña se requiere tener qpdf en el PATH del sistema).".to_string(),
                        output_path: Some(output_path_str),
                        output_bytes: Some(output_bytes),
                        engine_used: Some("lopdf".to_string()),
                        ..Default::default()
                    });
                }
            }
        }
    }

    let output_bytes = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    if req.reveal_on_finish.unwrap_or(false) {
        reveal_in_explorer(&state.tracker, &output_path);
    }

    Ok(PdfOperationOutput {
        success: true,
        message: if req.strip_all_metadata {
            "Todos los metadatos y rastros de autor fueron eliminados del PDF.".to_string()
        } else {
            "Metadatos del documento PDF actualizados correctamente.".to_string()
        },
        output_path: Some(output_path_str),
        output_bytes: Some(output_bytes),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn pdf_reveal_in_folder(
    state: State<'_, PdfState>,
    target_path: String,
) -> Result<(), String> {
    let p = Path::new(&target_path);
    if p.exists() {
        reveal_in_explorer(&state.tracker, p);
    }
    Ok(())
}

#[tauri::command]
pub async fn pdf_open_file(
    state: State<'_, PdfState>,
    target_path: String,
) -> Result<(), String> {
    let p = Path::new(&target_path);
    if p.exists() {
        let _ = state
            .tracker
            .spawn_async(
                "cmd.exe",
                &["/c", "start", "", &target_path],
                SubprocessOptions {
                    timeout_ms: 5_000,
                    windows_hide: true,
                },
            )
            .await;
    }
    Ok(())
}
}

pub use commands::*;
