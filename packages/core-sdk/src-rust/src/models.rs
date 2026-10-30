use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub name: String,
    pub description: String,
    pub ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binary_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleStateSnapshot {
    pub id: String,
    pub enabled: bool,
    pub running: bool,
    pub status_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    pub dependencies_ready: bool,
    pub dependencies: Vec<DependencyStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubprocessResult {
    pub ok: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Copy)]
pub struct SubprocessOptions {
    pub timeout_ms: u64,
    pub windows_hide: bool,
}

impl Default for SubprocessOptions {
    fn default() -> Self {
        Self {
            timeout_ms: 30_000,
            windows_hide: true,
        }
    }
}

