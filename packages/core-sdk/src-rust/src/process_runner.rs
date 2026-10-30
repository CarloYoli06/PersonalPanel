use crate::error::{SdkError, SdkResult};
use crate::models::{SubprocessOptions, SubprocessResult};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

/// Bandera nativa de Win32 para evitar la creación de ventanas de consola (cmd / powershell / ffmpeg).
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Configura un `tokio::process::Command` para que no abra ventana de consola en Windows
/// y cierre `stdin` para evitar bloqueos interactivos.
pub fn configure_tokio_command(cmd: &mut Command, windows_hide: bool) {
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    if windows_hide {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = windows_hide;
}

/// Configura un `std::process::Command` síncrono sin ventana emergente en Windows.
pub fn configure_std_command(cmd: &mut std::process::Command, windows_hide: bool) {
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    if windows_hide {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = windows_hide;
}

/// Rastreador de subprocesos efímeros por módulo (equivalente en Rust a `IsolatedProcessTracker`).
/// Registra los PIDs activos mientras se ejecutan y permite terminar árboles de procesos completos
/// al cancelar o desactivar un módulo.
#[derive(Debug, Clone, Default)]
pub struct IsolatedProcessTracker {
    active_pids: Arc<Mutex<HashSet<u32>>>,
}

impl IsolatedProcessTracker {
    pub fn new() -> Self {
        Self {
            active_pids: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn active_count(&self) -> usize {
        self.active_pids.lock().map(|g| g.len()).unwrap_or(0)
    }

    pub fn is_running(&self) -> bool {
        self.active_count() > 0
    }

    pub fn register_pid(&self, pid: u32) {
        if let Ok(mut guard) = self.active_pids.lock() {
            guard.insert(pid);
        }
    }

    pub fn unregister_pid(&self, pid: u32) {
        if let Ok(mut guard) = self.active_pids.lock() {
            guard.remove(&pid);
        }
    }

    /// Termina todos los subprocesos activos registrados en este tracker (incluyendo sus hijos).
    pub fn kill_all(&self) {
        let pids: Vec<u32> = match self.active_pids.lock() {
            Ok(mut guard) => {
                let list = guard.iter().copied().collect();
                guard.clear();
                list
            }
            Err(_) => return,
        };

        for pid in pids {
            kill_process_tree(pid);
        }
    }

    /// Ejecuta un binario externo de forma asíncrona, capturando `stdout` y `stderr` con límite de tiempo.
    pub async fn spawn_async<I, S>(
        &self,
        program: &str,
        args: I,
        options: SubprocessOptions,
    ) -> SdkResult<SubprocessResult>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        configure_tokio_command(&mut cmd, options.windows_hide);

        let mut child = cmd.spawn()?;
        let pid = child.id();
        if let Some(id) = pid {
            self.register_pid(id);
        }

        let mut stdout_pipe = child.stdout.take();
        let mut stderr_pipe = child.stderr.take();

        let stdout_task = tokio::spawn(async move {
            let mut buf = Vec::new();
            if let Some(mut out) = stdout_pipe.take() {
                let _ = out.read_to_end(&mut buf).await;
            }
            String::from_utf8_lossy(&buf).trim().to_string()
        });

        let stderr_task = tokio::spawn(async move {
            let mut buf = Vec::new();
            if let Some(mut err) = stderr_pipe.take() {
                let _ = err.read_to_end(&mut buf).await;
            }
            String::from_utf8_lossy(&buf).trim().to_string()
        });

        let wait_result = if options.timeout_ms > 0 {
            tokio::time::timeout(Duration::from_millis(options.timeout_ms), child.wait()).await
        } else {
            Ok(child.wait().await)
        };

        if let Some(id) = pid {
            self.unregister_pid(id);
        }

        match wait_result {
            Ok(Ok(status)) => {
                let stdout = stdout_task.await.unwrap_or_default();
                let stderr = stderr_task.await.unwrap_or_default();
                let code = status.code();
                Ok(SubprocessResult {
                    ok: status.success(),
                    code,
                    stdout,
                    stderr,
                })
            }
            Ok(Err(io_err)) => Err(SdkError::Io(io_err)),
            Err(_) => {
                if let Some(id) = pid {
                    kill_process_tree(id);
                }
                let _ = child.kill().await;
                Err(SdkError::ProcessTimeout {
                    program: program.to_string(),
                    timeout_ms: options.timeout_ms,
                })
            }
        }
    }

    /// Ejecuta un script `.ps1` de PowerShell sin ventana emergente (`CREATE_NO_WINDOW`).
    /// Soporta modo `-Sta` (Single-Threaded Apartment) requerido para diálogos COM/WIA en `mod-scanner`.
    pub async fn run_powershell_script(
        &self,
        script_path: &Path,
        script_args: &[String],
        sta_mode: bool,
        options: SubprocessOptions,
    ) -> SdkResult<SubprocessResult> {
        if !script_path.exists() {
            return Err(SdkError::ResourceNotFound(
                script_path.to_string_lossy().to_string(),
            ));
        }

        let mut args: Vec<String> = vec![
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
        ];

        if sta_mode {
            args.push("-Sta".to_string());
        }

        args.push("-File".to_string());
        args.push(script_path.to_string_lossy().to_string());
        args.extend_from_slice(script_args);

        self.spawn_async("powershell.exe", &args, options).await
    }
}

/// Mata un árbol de procesos en Windows mediante `taskkill /F /T /PID` sin abrir ventana.
pub fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/T", "/PID", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_std_command(&mut cmd, true);
        let _ = cmd.status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status();
    }
}

/// Resuelve la ruta absoluta de un script de PowerShell (`.ps1`) buscando tanto en el directorio
/// de recursos empaquetados de Tauri (`resource_dir`) como en las rutas de desarrollo del monorepo.
pub fn resolve_module_script_path(
    resource_dir: Option<&Path>,
    module_folder: &str,
    script_name: &str,
) -> SdkResult<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(res_dir) = resource_dir {
        candidates.push(res_dir.join("scripts").join(module_folder).join(script_name));
        candidates.push(res_dir.join("scripts").join(script_name));
        candidates.push(res_dir.join(script_name));
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(
            cwd.join("modules")
                .join(module_folder)
                .join("scripts")
                .join(script_name),
        );
        candidates.push(
            cwd.join("../../modules")
                .join(module_folder)
                .join("scripts")
                .join(script_name),
        );
        candidates.push(
            cwd.join("../../../modules")
                .join(module_folder)
                .join("scripts")
                .join(script_name),
        );
        candidates.push(cwd.join("scripts").join(script_name));
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
        }
    }

    Err(SdkError::ResourceNotFound(format!(
        "Script '{}' del módulo '{}' no encontrado en ninguna ruta candidata",
        script_name, module_folder
    )))
}

