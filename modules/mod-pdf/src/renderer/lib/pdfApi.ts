import type { PdfModuleAPI, PdfStudioSettings } from '../../shared/types'

declare global {
  interface PanelWindowBridge {
    pdf?: PdfModuleAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
  }
}

const SETTINGS_STORAGE_KEY = 'panel-personal:mod-pdf:settings'

export const DEFAULT_PDF_SETTINGS: PdfStudioSettings = {
  showRealThumbnails: true,
  thumbnailQuality: 'medium',
  maxAutoThumbnailPages: 100,
  outputSaveMode: 'same-folder',
  customOutputDir: '',
  defaultSuffix: '_pdfstudio',
  revealInExplorerOnFinish: true
}

export function loadPdfStudioSettings(): PdfStudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PDF_SETTINGS }
    return { ...DEFAULT_PDF_SETTINGS, ...(JSON.parse(raw) as Partial<PdfStudioSettings>) }
  } catch {
    return { ...DEFAULT_PDF_SETTINGS }
  }
}

export function savePdfStudioSettings(settings: PdfStudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export const isElectronPdf =
  typeof window !== 'undefined' && Boolean(window.panelApi?.pdf)

export const browserMockPdfApi: PdfModuleAPI = {
  getPathForFile(file: File) {
    return (file as File & { path?: string }).path ?? file.name
  },
  async selectPdfFiles() {
    return ['C:\\Documentos\\Contrato_2026.pdf']
  },
  async selectImageFiles() {
    return ['C:\\Imagenes\\Escaneo_01.jpg', 'C:\\Imagenes\\Escaneo_02.jpg']
  },
  async selectOutputFolder() {
    return 'C:\\Documentos\\PDF_Salida'
  },
  async inspectPdfs(filePaths) {
    return filePaths.map((fp, i) => ({
      path: fp,
      name: fp.split(/[\\/]/).pop() ?? `Documento_${i + 1}.pdf`,
      sizeBytes: 1024 * 1024 * (2.4 + i),
      pageCount: 6,
      title: 'Documento de Prueba',
      author: 'Usuario',
      subject: '',
      keywords: ''
    }))
  },
  async inspectImages(filePaths) {
    return filePaths.map((fp, i) => ({
      path: fp,
      name: fp.split(/[\\/]/).pop() ?? `Imagen_${i + 1}.jpg`,
      sizeBytes: 1024 * 650,
      width: 1600,
      height: 2200
    }))
  },
  async readPdfBytes() {
    return null
  },
  async readImageDataUrl() {
    return null
  },
  async mergePdfs(req) {
    return {
      success: true,
      message: `Se unieron ${req.filePaths.length} documentos PDF con éxito.`,
      outputPath: 'C:\\Documentos\\Resultado_unido.pdf'
    }
  },
  async splitPdf() {
    return {
      success: true,
      message: 'Documento PDF dividido correctamente.',
      outputPath: 'C:\\Documentos\\Resultado_dividido.pdf'
    }
  },
  async organizePdf(req) {
    return {
      success: true,
      message: `Documento organizado (${req.pages.length} páginas).`,
      outputPath: 'C:\\Documentos\\Resultado_organizado.pdf'
    }
  },
  async compressPdf() {
    return {
      success: true,
      message: 'PDF optimizado con éxito: ahorraste un 58% de espacio.',
      outputPath: 'C:\\Documentos\\Resultado_comprimido.pdf',
      originalBytes: 10 * 1024 * 1024,
      outputBytes: 4.2 * 1024 * 1024,
      savedPercent: 58
    }
  },
  async imagesToPdf(req) {
    return {
      success: true,
      message: `PDF generado a partir de ${req.imagePaths.length} imágenes.`,
      outputPath: 'C:\\Documentos\\Imagenes_convertidas.pdf'
    }
  },
  async saveExportedImages(req) {
    return {
      success: true,
      message: `Se exportaron ${req.images.length} imágenes.`,
      outputDir: 'C:\\Documentos\\Paginas_Exportadas'
    }
  },
  async stampPdf() {
    return {
      success: true,
      message: 'Numeración y marca de agua aplicadas.',
      outputPath: 'C:\\Documentos\\Resultado_sellado.pdf'
    }
  },
  async updateMetadataAndSecurity() {
    return {
      success: true,
      message: 'Metadatos actualizados correctamente.',
      outputPath: 'C:\\Documentos\\Resultado_meta.pdf'
    }
  },
  async revealInFolder() {},
  async openFile() {}
}

export function getPdfApi(): PdfModuleAPI {
  if (typeof window !== 'undefined' && window.panelApi?.pdf) {
    return window.panelApi.pdf
  }
  return browserMockPdfApi
}

