import { lazy } from 'react'
import type { ModuleManifest } from '@panel/core-sdk'

export const pdfModuleManifest: ModuleManifest = {
  id: 'mod-pdf',
  name: 'PDF Studio · Control de PDF',
  tagline: 'Unir, dividir, organizar, comprimir, convertir y sellar PDFs',
  description:
    'Suite todo-en-uno estilo iLovePDF ejecutada 100% en local: une múltiples documentos, extrae rangos, rota y reordena páginas con vista previa real, comprime archivos pesados, convierte imágenes y estampa marcas de agua o numeración.',
  version: '1.0.0',
  category: 'documents',
  icon: 'file-text',
  accent: 'rose',
  defaultEnabled: true,
  externalBinaries: [
    'pdf-lib (Motor estructural nativo)',
    'pdfjs-dist (Rasterizador Canvas bajo demanda)',
    'nativeImage / qpdf (Opcional para cifrado AES)'
  ],
  entryPoint: lazy(() => import('./renderer/PdfModuleView')),
  onStart: () => {
    console.info('[mod-pdf] PDF Studio cargado en memoria bajo demanda.')
  },
  onStop: () => {
    console.info('[mod-pdf] PDF Studio desmontado y cachés liberados.')
  }
}

