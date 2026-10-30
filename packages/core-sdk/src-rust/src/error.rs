use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SdkError {
    #[error("Error de E/S del sistema: {0}")]
    Io(#[from] std::io::Error),

    #[error("Error de serialización JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("El subproceso '{program}' falló (código {code:?}): {stderr}")]
    ProcessFailed {
        program: String,
        code: Option<i32>,
        stderr: String,
    },

    #[error("Tiempo de espera agotado ({timeout_ms} ms) ejecutando '{program}'")]
    ProcessTimeout { program: String, timeout_ms: u64 },

    #[error("No se encontró el recurso o script requerido: {0}")]
    ResourceNotFound(String),

    #[error("La operación fue cancelada por el usuario")]
    Cancelled,

    #[error("{0}")]
    Custom(String),
}

impl From<String> for SdkError {
    fn from(value: String) -> Self {
        Self::Custom(value)
    }
}

impl From<&str> for SdkError {
    fn from(value: &str) -> Self {
        Self::Custom(value.to_string())
    }
}

// Permite devolver `Result<T, SdkError>` directamente desde cualquier `#[tauri::command]`
impl Serialize for SdkError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type SdkResult<T> = Result<T, SdkError>;

