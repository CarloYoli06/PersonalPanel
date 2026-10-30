use panel_core_sdk::{
    configure_std_command, configure_tokio_command, kill_process_tree, DependencyStatus,
    IsolatedProcessTracker, SdkError, SdkResult, SubprocessOptions,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

pub const EVENT_VIDEO_PROGRESS: &str = "mod-video:progress";

const SCALE_TO_1080P: &str =
    "scale=w='if(gte(iw,ih),-2,min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),-2)':flags=lanczos";

// ═══════════════════════════════════════════════════════════════════════════
// Tipos Compartidos (Espejo de modules/mod-video/src/shared/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionSettings {
    pub engine: String,      // "nvenc" | "x264"
    pub level: String,       // "high" | "balanced" | "max"
    pub output_mode: String, // "same" | "custom"
    pub output_dir: Option<String>,
    pub limit_to_1080p: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub codec: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<VideoInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressRequest {
    pub job_id: String,
    pub input_path: String,
    pub settings: CompressionSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub job_id: String,
    pub percent: f64,
    pub fps: Option<f64>,
    pub eta_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub ffmpeg_path: String,
    pub ffmpeg_version: String,
    pub nvenc_available: bool,
    pub nvenc_modern_presets: bool,
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado del Módulo Video
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone)]
pub struct ActiveVideoJob {
    pub job_id: String,
    pub pid: Option<u32>,
    pub output_path: PathBuf,
    pub cancelled: bool,
    pub percent: f64,
}

pub struct VideoState {
    pub tracker: IsolatedProcessTracker,
    pub active_job: Arc<Mutex<Option<ActiveVideoJob>>>,
    pub cached_system_info: Mutex<Option<SystemInfo>>,
}

impl Default for VideoState {
    fn default() -> Self {
        Self {
            tracker: IsolatedProcessTracker::new(),
            active_job: Arc::new(Mutex::new(None)),
            cached_system_info: Mutex::new(None),
        }
    }
}

impl VideoState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel_active(&self) -> bool {
        let mut guard = match self.active_job.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };
        if let Some(job) = guard.as_mut() {
            job.cancelled = true;
            if let Some(pid) = job.pid {
                kill_process_tree(pid);
            }
            safe_unlink(&job.output_path);
            return true;
        }
        false
    }

    pub async fn check_dependencies(&self, app: &AppHandle) -> Vec<DependencyStatus> {
        let (ffmpeg_path, ffprobe_path) = resolve_ffmpeg_binaries(app);
        let ffmpeg_exists = Path::new(&ffmpeg_path).exists() || ffmpeg_path == "ffmpeg.exe";
        let ffprobe_exists = Path::new(&ffprobe_path).exists() || ffprobe_path == "ffprobe.exe";

        let sys = self.get_or_init_system_info(app).await.ok();

        vec![
            DependencyStatus {
                name: "FFmpeg Engine (x64)".to_string(),
                description: "Motor de codificación H.264 / NVENC bajo demanda".to_string(),
                ready: ffmpeg_exists && sys.is_some(),
                version: sys.as_ref().map(|s| s.ffmpeg_version.clone()),
                binary_path: Some(ffmpeg_path),
                optional: Some(false),
            },
            DependencyStatus {
                name: "FFprobe Analyzer".to_string(),
                description: "Inspector asíncrono de streams, resolución y duración".to_string(),
                ready: ffprobe_exists,
                version: None,
                binary_path: Some(ffprobe_path),
                optional: Some(false),
            },
            DependencyStatus {
                name: "NVIDIA NVENC Hardware Encoder".to_string(),
                description:
                    "Aceleración por hardware GPU (opcional, fallback automático a CPU x264)"
                        .to_string(),
                ready: sys.map(|s| s.nvenc_available).unwrap_or(false),
                version: None,
                binary_path: None,
                optional: Some(true),
            },
        ]
    }

    pub async fn get_or_init_system_info(&self, app: &AppHandle) -> SdkResult<SystemInfo> {
        if let Some(cached) = self.cached_system_info.lock().unwrap().clone() {
            return Ok(cached);
        }

        let (ffmpeg_path, _) = resolve_ffmpeg_binaries(app);
        let opts = SubprocessOptions {
            timeout_ms: 10_000,
            windows_hide: true,
        };

        let (version_res, encoder_help_res, nvenc_test_res) = tokio::join!(
            self.tracker
                .spawn_async(&ffmpeg_path, ["-hide_banner", "-version"], opts),
            self.tracker.spawn_async(
                &ffmpeg_path,
                ["-hide_banner", "-h", "encoder=h264_nvenc"],
                opts
            ),
            self.tracker.spawn_async(
                &ffmpeg_path,
                [
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=black:s=640x360:d=0.2",
                    "-c:v",
                    "h264_nvenc",
                    "-f",
                    "null",
                    "-"
                ],
                opts
            )
        );

        let version_stdout = version_res.map(|r| r.stdout).unwrap_or_default();
        let ffmpeg_version = version_stdout
            .lines()
            .next()
            .and_then(|line| line.strip_prefix("ffmpeg version "))
            .and_then(|rest| rest.split_whitespace().next())
            .unwrap_or("desconocida")
            .to_string();

        let encoder_help = encoder_help_res
            .map(|r| format!("{}\n{}", r.stdout, r.stderr))
            .unwrap_or_default();
        let nvenc_modern_presets = encoder_help.contains(" p4 ");
        let nvenc_available = nvenc_test_res.map(|r| r.ok).unwrap_or(false);

        let info = SystemInfo {
            ffmpeg_path,
            ffmpeg_version,
            nvenc_available,
            nvenc_modern_presets,
        };

        *self.cached_system_info.lock().unwrap() = Some(info.clone());
        Ok(info)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Resolución de Binarios FFmpeg / FFprobe y Utilidades de Codificación
// ═══════════════════════════════════════════════════════════════════════════

pub fn resolve_ffmpeg_binaries(app: &AppHandle) -> (String, String) {
    let mut ffmpeg_candidates: Vec<PathBuf> = Vec::new();
    let mut ffprobe_candidates: Vec<PathBuf> = Vec::new();

    if let Ok(app_data) = app.path().app_data_dir() {
        ffmpeg_candidates.push(app_data.join("binaries/ffmpeg/ffmpeg.exe"));
        ffprobe_candidates.push(app_data.join("binaries/ffmpeg/ffprobe.exe"));
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        ffmpeg_candidates.push(res_dir.join("binaries/ffmpeg.exe"));
        ffprobe_candidates.push(res_dir.join("binaries/ffprobe.exe"));
    }

    if let Ok(cwd) = std::env::current_dir() {
        for prefix in [".", "../..", "../../.."] {
            let base = cwd.join(prefix);
            ffmpeg_candidates.push(base.join("node_modules/ffmpeg-static/ffmpeg.exe"));
            ffmpeg_candidates.push(base.join("node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe"));
            ffprobe_candidates
                .push(base.join("node_modules/@ffprobe-installer/win32-x64/ffprobe.exe"));
        }
    }

    let ffmpeg = ffmpeg_candidates
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "ffmpeg.exe".to_string());

    let ffprobe = ffprobe_candidates
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "ffprobe.exe".to_string());

    (ffmpeg, ffprobe)
}

fn level_quality(engine: &str, level: &str) -> u32 {
    match (engine, level) {
        ("nvenc", "high") => 20,
        ("nvenc", "balanced") => 24,
        ("nvenc", "max") => 28,
        (_, "high") => 20,
        (_, "balanced") => 23,
        (_, _) => 28,
    }
}

fn resolve_output_path(input_path: &Path, settings: &CompressionSettings) -> PathBuf {
    let parent = input_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");

    let target_dir = if settings.output_mode == "custom" {
        settings
            .output_dir
            .as_ref()
            .filter(|d| !d.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or(parent)
    } else {
        parent
    };

    let _ = fs::create_dir_all(&target_dir);

    let mut candidate = target_dir.join(format!("{}_compressed.mp4", stem));
    let mut counter = 1;
    while candidate.exists() {
        candidate = target_dir.join(format!("{}_compressed ({}).mp4", stem, counter));
        counter += 1;
    }
    candidate
}

fn build_ffmpeg_args(
    input_path: &str,
    output_path: &Path,
    settings: &CompressionSettings,
    info: &VideoInfo,
    system: &SystemInfo,
) -> Vec<String> {
    let quality = level_quality(&settings.engine, &settings.level).to_string();
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-map".to_string(),
        "0:v:0".to_string(),
        "-map".to_string(),
        "0:a:0?".to_string(),
    ];

    if settings.engine == "nvenc" {
        args.extend([
            "-c:v".to_string(),
            "h264_nvenc".to_string(),
            "-rc".to_string(),
            "vbr".to_string(),
            "-cq".to_string(),
            quality,
            "-b:v".to_string(),
            "0".to_string(),
            "-preset".to_string(),
            if system.nvenc_modern_presets {
                "p4".to_string()
            } else {
                "medium".to_string()
            },
            "-profile:v".to_string(),
            "high".to_string(),
        ]);
    } else {
        args.extend([
            "-c:v".to_string(),
            "libx264".to_string(),
            "-crf".to_string(),
            quality,
            "-preset".to_string(),
            "fast".to_string(),
            "-profile:v".to_string(),
            "high".to_string(),
        ]);
    }

    if settings.limit_to_1080p && info.width.min(info.height) > 1080 {
        args.push("-vf".to_string());
        args.push(SCALE_TO_1080P.to_string());
    }

    args.extend([
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "128k".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
        "-max_muxing_queue_size".to_string(),
        "1024".to_string(),
        output_path.to_string_lossy().to_string(),
    ]);

    args
}

fn parse_timemark_to_seconds(line: &str) -> Option<f64> {
    let idx = line.find("time=")?;
    let rest = &line[idx + 5..];
    let token = rest.split_whitespace().next()?;
    if token.starts_with('-') || token.starts_with("N/A") {
        return None;
    }
    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn parse_fps(line: &str) -> Option<f64> {
    let idx = line.find("fps=")?;
    let rest = &line[idx + 4..].trim_start();
    let token = rest.split_whitespace().next()?;
    token.parse::<f64>().ok()
}

fn safe_unlink(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn friendly_ffmpeg_error(stderr: &str, engine: &str) -> String {
    let lower = stderr.to_lowercase();
    if engine == "nvenc"
        && (lower.contains("cannot load nvcuda")
            || lower.contains("no nvenc capable devices")
            || lower.contains("openencodesessionex failed")
            || lower.contains("initializeencoder failed"))
    {
        return "NVENC no está disponible (GPU/driver NVIDIA no compatible u ocupada). Prueba con el motor CPU (x264).".to_string();
    }

    let lines: Vec<&str> = stderr
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with("frame=") && !l.starts_with("size="))
        .collect();

    if lines.is_empty() {
        "Error durante la codificación con FFmpeg.".to_string()
    } else {
        lines
            .iter()
            .rev()
            .take(2)
            .copied()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" · ")
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Inspección de Video con FFprobe
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    #[serde(default)]
    streams: Vec<FfprobeStream>,
    #[serde(default)]
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    #[serde(default)]
    codec_type: String,
    #[serde(default)]
    codec_name: Option<String>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    #[serde(default)]
    duration: Option<String>,
}

async fn probe_single_video(
    tracker: &IsolatedProcessTracker,
    ffprobe_path: &str,
    file_path: &str,
) -> SdkResult<VideoInfo> {
    let path_obj = Path::new(file_path);
    let meta = fs::metadata(path_obj)?;
    let size = meta.len();
    let name = path_obj
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(file_path)
        .to_string();

    let res = tracker
        .spawn_async(
            ffprobe_path,
            [
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                file_path,
            ],
            SubprocessOptions {
                timeout_ms: 15_000,
                windows_hide: true,
            },
        )
        .await?;

    if !res.ok {
        return Err(SdkError::Custom(
            "No se pudo analizar el contenedor de video.".to_string(),
        ));
    }

    let parsed: FfprobeOutput = serde_json::from_str(&res.stdout)
        .map_err(|_| SdkError::Custom("Respuesta JSON inválida de ffprobe.".to_string()))?;

    let video_stream = parsed
        .streams
        .iter()
        .find(|s| s.codec_type == "video")
        .ok_or_else(|| SdkError::Custom("El archivo no contiene una pista de video.".to_string()))?;

    let duration = parsed
        .format
        .as_ref()
        .and_then(|f| f.duration.as_deref())
        .or(video_stream.duration.as_deref())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(VideoInfo {
        path: file_path.to_string(),
        name,
        size,
        duration: if duration.is_finite() { duration } else { 0.0 },
        width: video_stream.width.unwrap_or(0),
        height: video_stream.height.unwrap_or(0),
        codec: video_stream
            .codec_name
            .clone()
            .unwrap_or_else(|| "desconocido".to_string()),
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// Comandos Tauri de mod-video
// ═══════════════════════════════════════════════════════════════════════════

pub mod commands {
    use super::*;

#[tauri::command]
pub async fn video_select_files(app: AppHandle) -> SdkResult<Vec<String>> {
    let picked = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Selecciona videos para comprimir")
            .add_filter("Videos", &["mp4", "mkv", "mov", "avi"])
            .blocking_pick_files()
    })
    .await
    .map_err(|e| SdkError::Custom(e.to_string()))?;

    Ok(picked
        .unwrap_or_default()
        .into_iter()
        .map(|f| f.to_string())
        .collect())
}

#[tauri::command]
pub async fn video_select_folder(app: AppHandle) -> SdkResult<Option<String>> {
    let picked = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Carpeta de destino")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| SdkError::Custom(e.to_string()))?;

    Ok(picked.map(|f| f.to_string()))
}

#[tauri::command]
pub async fn video_get_system_info(
    app: AppHandle,
    state: State<'_, VideoState>,
) -> SdkResult<SystemInfo> {
    state.get_or_init_system_info(&app).await
}

#[tauri::command]
pub async fn video_probe_files(
    app: AppHandle,
    state: State<'_, VideoState>,
    paths: Vec<String>,
) -> SdkResult<Vec<ProbeResult>> {
    let (_, ffprobe_path) = resolve_ffmpeg_binaries(&app);
    let mut results = Vec::with_capacity(paths.len());

    for p in paths {
        match probe_single_video(&state.tracker, &ffprobe_path, &p).await {
            Ok(info) => results.push(ProbeResult {
                ok: true,
                info: Some(info),
                path: None,
                name: None,
                size: None,
                error: None,
            }),
            Err(err) => {
                let path_obj = Path::new(&p);
                let size = fs::metadata(path_obj).map(|m| m.len()).unwrap_or(0);
                let name = path_obj
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&p)
                    .to_string();
                results.push(ProbeResult {
                    ok: false,
                    info: None,
                    path: Some(p),
                    name: Some(name),
                    size: Some(size),
                    error: Some(err.to_string()),
                });
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn video_compress(
    app: AppHandle,
    state: State<'_, VideoState>,
    request: CompressRequest,
) -> SdkResult<CompressResult> {
    {
        let guard = state.active_job.lock().unwrap();
        if guard.is_some() {
            return Ok(CompressResult {
                ok: false,
                output_path: None,
                input_size: None,
                output_size: None,
                cancelled: Some(false),
                error: Some("Ya hay una compresión en curso.".to_string()),
            });
        }
    }

    let input_path_obj = Path::new(&request.input_path);
    if !input_path_obj.exists() {
        return Ok(CompressResult {
            ok: false,
            output_path: None,
            input_size: None,
            output_size: None,
            cancelled: Some(false),
            error: Some("El archivo original ya no existe.".to_string()),
        });
    }

    let (ffmpeg_path, ffprobe_path) = resolve_ffmpeg_binaries(&app);
    let info = match probe_single_video(&state.tracker, &ffprobe_path, &request.input_path).await {
        Ok(i) => i,
        Err(e) => {
            return Ok(CompressResult {
                ok: false,
                output_path: None,
                input_size: None,
                output_size: None,
                cancelled: Some(false),
                error: Some(e.to_string()),
            })
        }
    };
    let system = state.get_or_init_system_info(&app).await?;
    let output_path = resolve_output_path(input_path_obj, &request.settings);
    let args = build_ffmpeg_args(
        &request.input_path,
        &output_path,
        &request.settings,
        &info,
        &system,
    );

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    configure_tokio_command(&mut cmd, true);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return Ok(CompressResult {
                ok: false,
                output_path: None,
                input_size: None,
                output_size: None,
                cancelled: Some(false),
                error: Some(format!("No se pudo iniciar FFmpeg: {}", e)),
            })
        }
    };

    let pid = child.id();
    if let Some(id) = pid {
        state.tracker.register_pid(id);
    }

    {
        let mut guard = state.active_job.lock().unwrap();
        *guard = Some(ActiveVideoJob {
            job_id: request.job_id.clone(),
            pid,
            output_path: output_path.clone(),
            cancelled: false,
            percent: 0.0,
        });
    }

    let started_at = Instant::now();
    let mut stderr_accum = String::new();

    if let Some(mut stderr_pipe) = child.stderr.take() {
        let mut buf = [0u8; 2048];
        let mut partial = String::new();

        loop {
            match stderr_pipe.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    stderr_accum.push_str(&chunk);
                    partial.push_str(&chunk);

                    // FFmpeg separa líneas de progreso con '\r' o '\n'
                    while let Some(pos) = partial.find(['\r', '\n']) {
                        let line = partial[..pos].to_string();
                        partial.drain(..=pos);

                        if let Some(seconds) = parse_timemark_to_seconds(&line) {
                            let raw_pct = if info.duration > 0.0 {
                                (seconds / info.duration) * 100.0
                            } else {
                                0.0
                            };
                            let percent = raw_pct.clamp(0.0, 99.9);
                            let elapsed = started_at.elapsed().as_secs_f64();
                            let eta_seconds = if percent > 0.5 {
                                Some((elapsed * (100.0 - percent)) / percent)
                            } else {
                                None
                            };
                            let fps = parse_fps(&line);

                            if let Ok(mut guard) = state.active_job.lock() {
                                if let Some(job) = guard.as_mut() {
                                    job.percent = percent;
                                }
                            }

                            let _ = app.emit(
                                EVENT_VIDEO_PROGRESS,
                                ProgressPayload {
                                    job_id: request.job_id.clone(),
                                    percent,
                                    fps,
                                    eta_seconds,
                                },
                            );
                        }
                    }
                }
                Err(_) => break,
            }
        }
    }

    let status = child.wait().await;
    if let Some(id) = pid {
        state.tracker.unregister_pid(id);
    }

    let was_cancelled = {
        let mut guard = state.active_job.lock().unwrap();
        let cancelled = guard.as_ref().map(|j| j.cancelled).unwrap_or(false);
        *guard = None;
        cancelled
    };

    if was_cancelled {
        safe_unlink(&output_path);
        return Ok(CompressResult {
            ok: false,
            output_path: None,
            input_size: None,
            output_size: None,
            cancelled: Some(true),
            error: Some("Cancelado por el usuario.".to_string()),
        });
    }

    match status {
        Ok(s) if s.success() && output_path.exists() => {
            let output_size = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
            let input_size = fs::metadata(&request.input_path)
                .map(|m| m.len())
                .unwrap_or(info.size);

            let _ = app.emit(
                EVENT_VIDEO_PROGRESS,
                ProgressPayload {
                    job_id: request.job_id,
                    percent: 100.0,
                    fps: None,
                    eta_seconds: Some(0.0),
                },
            );

            Ok(CompressResult {
                ok: true,
                output_path: Some(output_path.to_string_lossy().to_string()),
                input_size: Some(input_size),
                output_size: Some(output_size),
                cancelled: None,
                error: None,
            })
        }
        _ => {
            safe_unlink(&output_path);
            Ok(CompressResult {
                ok: false,
                output_path: None,
                input_size: None,
                output_size: None,
                cancelled: Some(false),
                error: Some(friendly_ffmpeg_error(&stderr_accum, &request.settings.engine)),
            })
        }
    }
}

#[tauri::command]
pub fn video_cancel(state: State<'_, VideoState>) -> bool {
    state.cancel_active()
}

#[tauri::command]
pub fn video_show_in_folder(path: String) {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer.exe");
        cmd.arg(format!("/select,{}", path));
        configure_std_command(&mut cmd, true);
        let _ = cmd.spawn();
    }
}
}

pub use commands::*;

