import { lazy } from 'react'
import type { ModuleManifest } from '@panel/core-sdk'

/**
 * Manifiesto estándar del módulo Escaner Albedo.
 * Su interfaz y su motor Canvas `ImageEditor` se cargan solo bajo demanda (`React.lazy`).
 */
export const scannerModuleManifest: ModuleManifest = {
  id: 'mod-scanner',
  name: 'Escaner Albedo · Digitalización',
  tagline: 'Escáner WIA/WiFi inteligente + Editor Canvas y PDF',
  description:
    'Digitaliza documentos desde escáneres USB o WiFi/red mediante Windows WIA, aplica auto-recorte inteligente de bordes, ajusta brillo/contraste y exporta a PDF multipágina o imagen.',
  version: '1.0.0',
  category: 'documents',
  icon: 'scan',
  accent: 'cyan',
  defaultEnabled: true,
  externalBinaries: [
    'powershell.exe -Sta (Puente WIA ComObject)',
    'scripts/scan-with-select.ps1 & list-scanners.ps1'
  ],
  entryPoint: lazy(() => import('./renderer/ScannerModuleView')),
  onStart: () => {
    console.info('[mod-scanner] Módulo de escáner montado bajo demanda.')
  },
  onStop: () => {
    console.info('[mod-scanner] Módulo de escáner desmontado y buffers Canvas liberados.')
  }
}

