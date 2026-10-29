import type { ModuleManifest } from '@panel/core-sdk'
import { videoModuleManifest } from '@panel/mod-video'
import { scannerModuleManifest } from '@panel/mod-scanner'
import { optimizerModuleManifest } from '@panel/mod-optimizer'
import { pdfModuleManifest } from '@panel/mod-pdf'

/**
 * Registro central de módulos del Ecosistema.
 * Para añadir un módulo en el futuro, basta con crear su paquete en `modules/mod-*`
 * siguiendo el contrato `ModuleManifest` e incluirlo en esta lista.
 *
 * IMPORTANTE: Importar los manifiestos NO carga las vistas ni los binarios pesados
 * porque `entryPoint` utiliza `React.lazy(() => import(...))`.
 */
export const MODULE_REGISTRY: readonly ModuleManifest[] = [
  videoModuleManifest,
  scannerModuleManifest,
  optimizerModuleManifest,
  pdfModuleManifest
]

export function getModuleById(id: string): ModuleManifest | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id)
}

