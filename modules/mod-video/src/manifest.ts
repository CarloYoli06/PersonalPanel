import { lazy } from 'react'
import type { ModuleManifest } from '@panel/core-sdk'

/**
 * Manifiesto estándar del módulo de control y compresión de videos (FileDiet).
 * La vista pesada se importa con `React.lazy` para garantizar 0 consumo en reposo.
 */
export const videoModuleManifest: ModuleManifest = {
  id: 'mod-video',
  name: 'FileDiet · Control de Videos',
  tagline: 'Compresor por lotes con FFmpeg + GPU NVENC',
  description:
    'Optimiza y reduce hasta un 75% el peso de tus videos MP4, MKV, MOV y AVI sin pérdida visual perceptible usando aceleración por hardware NVIDIA NVENC o CPU x264.',
  version: '1.0.0',
  category: 'media',
  icon: 'video',
  accent: 'violet',
  defaultEnabled: true,
  externalBinaries: ['ffmpeg.exe (FFmpeg 6.x Static)', 'ffprobe.exe (FFprobe Analyzer)'],
  entryPoint: lazy(() => import('./renderer/VideoModuleView')),
  onStart: () => {
    console.info('[mod-video] Módulo de video montado bajo demanda.')
  },
  onStop: () => {
    console.info('[mod-video] Módulo de video desmontado y recursos de UI liberados.')
  }
}

