import { lazy } from 'react'
import type { ModuleManifest } from '@panel/core-sdk'

export const optimizerModuleManifest: ModuleManifest = {
  id: 'mod-optimizer',
  name: 'PC Optimizer · Rendimiento & Privacidad',
  tagline: 'Limpieza de temporales, telemetría y aceleración de Windows',
  description:
    'Optimiza Windows eliminando caché innecesaria, desactivando servicios de telemetría y diagnósticos, ajustando animaciones para máxima fluidez y gestionando programas de inicio.',
  version: '1.0.0',
  category: 'system',
  icon: 'wrench',
  accent: 'emerald',
  defaultEnabled: true,
  externalBinaries: [
    'powershell.exe (Subproceso efímero · ExecutionPolicy Bypass)',
    'scripts/optimizer-core.ps1'
  ],
  entryPoint: lazy(() => import('./renderer/OptimizerModuleView')),
  onStart: () => {
    console.info('[mod-optimizer] Módulo de optimización cargado bajo demanda.')
  },
  onStop: () => {
    console.info('[mod-optimizer] Módulo desmontado y recursos liberados.')
  }
}

