export const PDF_IPC = {
  selectPdfFiles: 'mod-pdf:dialog:select-pdfs',
  selectImageFiles: 'mod-pdf:dialog:select-images',
  selectOutputFolder: 'mod-pdf:dialog:select-folder',
  inspectPdfs: 'mod-pdf:inspect-pdfs',
  inspectImages: 'mod-pdf:inspect-images',
  readPdfBytes: 'mod-pdf:read-pdf-bytes',
  readImageDataUrl: 'mod-pdf:read-image-data-url',
  mergePdfs: 'mod-pdf:merge',
  splitPdf: 'mod-pdf:split',
  organizePdf: 'mod-pdf:organize',
  compressPdf: 'mod-pdf:compress',
  imagesToPdf: 'mod-pdf:images-to-pdf',
  saveExportedImages: 'mod-pdf:save-exported-images',
  stampPdf: 'mod-pdf:stamp',
  updateMetadataAndSecurity: 'mod-pdf:metadata-security',
  revealInFolder: 'mod-pdf:reveal-in-folder',
  openFile: 'mod-pdf:open-file'
} as const

export type ThumbnailQuality = 'low' | 'medium' | 'high'
export type OutputSaveMode = 'same-folder' | 'custom-folder' | 'ask-always'

export interface PdfStudioSettings {
  showRealThumbnails: boolean
  thumbnailQuality: ThumbnailQuality
  maxAutoThumbnailPages: number
  outputSaveMode: OutputSaveMode
  customOutputDir: string
  defaultSuffix: string
  revealInExplorerOnFinish: boolean
}

export interface PdfDocumentInfo {
  path: string
  name: string
  sizeBytes: number
  pageCount: number
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  encrypted?: boolean
  error?: string
}

export interface ImageInputItem {
  path: string
  name: string
  sizeBytes: number
  width: number
  height: number
}

export interface PdfOperationOutput {
  success: boolean
  canceled?: boolean
  message: string
  outputPath?: string
  outputPaths?: string[]
  outputDir?: string
  originalBytes?: number
  outputBytes?: number
  savedPercent?: number
  engineUsed?: string
  error?: string
}

export interface MergePdfRequest {
  filePaths: string[]
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export type SplitPdfMode = 'ranges' | 'selected-pages' | 'explode-all'

export interface SplitPdfRequest {
  filePath: string
  mode: SplitPdfMode
  rangesText?: string
  mergeRangesIntoOne?: boolean
  selectedPages?: number[] // 1-based page numbers
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export interface OrganizedPageSpec {
  id: string
  sourceFilePath: string
  sourceFileName: string
  sourcePageIndex: number // 0-based
  originalPageNumber: number // 1-based
  rotation: 0 | 90 | 180 | 270
}

export interface OrganizePdfRequest {
  baseFilePath: string
  pages: OrganizedPageSpec[]
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export type PdfCompressionLevel = 'low' | 'medium' | 'extreme'

export interface RasterizedPagePayload {
  jpegBase64: string
  widthPt: number
  heightPt: number
}

export interface CompressPdfRequest {
  filePath: string
  level: PdfCompressionLevel
  rasterizedPages?: RasterizedPagePayload[]
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export interface ImagesToPdfRequest {
  imagePaths: string[]
  pageSize: 'fit' | 'a4' | 'letter'
  orientation: 'auto' | 'portrait' | 'landscape'
  marginPt: number
  optimizeHeavyImages: boolean
  maxDimensionPx: number
  jpegQuality: number
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export interface SaveExportedImagesRequest {
  sourcePdfPath: string
  images: Array<{
    pageNumber: number
    dataUrl: string
    ext: 'jpg' | 'png'
  }>
  outputMode: OutputSaveMode
  customOutputDir?: string
  revealOnFinish?: boolean
}

export interface StampPdfRequest {
  filePath: string
  enablePageNumbers: boolean
  pageNumberPosition:
    | 'bottom-right'
    | 'bottom-center'
    | 'bottom-left'
    | 'top-right'
    | 'top-center'
  pageNumberFormat: 'simple' | 'page-of-total'
  startPageNumber: number
  enableWatermark: boolean
  watermarkText: string
  watermarkPosition: 'diagonal' | 'center' | 'header' | 'footer'
  watermarkOpacity: number // 0.1 - 1.0
  watermarkFontSize: number
  watermarkColorHex: string
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export interface MetadataSecurityRequest {
  filePath: string
  title: string
  author: string
  subject: string
  keywords: string
  stripAllMetadata: boolean
  securityAction: 'none' | 'encrypt' | 'decrypt'
  password?: string
  outputMode: OutputSaveMode
  customOutputDir?: string
  suffix?: string
  revealOnFinish?: boolean
}

export interface PdfModuleAPI {
  getPathForFile(file: File): string
  selectPdfFiles(multiple?: boolean): Promise<string[]>
  selectImageFiles(): Promise<string[]>
  selectOutputFolder(defaultPath?: string): Promise<string | null>
  inspectPdfs(filePaths: string[]): Promise<PdfDocumentInfo[]>
  inspectImages(filePaths: string[]): Promise<ImageInputItem[]>
  readPdfBytes(filePath: string): Promise<Uint8Array | null>
  readImageDataUrl(filePath: string, maxPreviewPx?: number): Promise<string | null>
  mergePdfs(req: MergePdfRequest): Promise<PdfOperationOutput>
  splitPdf(req: SplitPdfRequest): Promise<PdfOperationOutput>
  organizePdf(req: OrganizePdfRequest): Promise<PdfOperationOutput>
  compressPdf(req: CompressPdfRequest): Promise<PdfOperationOutput>
  imagesToPdf(req: ImagesToPdfRequest): Promise<PdfOperationOutput>
  saveExportedImages(req: SaveExportedImagesRequest): Promise<PdfOperationOutput>
  stampPdf(req: StampPdfRequest): Promise<PdfOperationOutput>
  updateMetadataAndSecurity(req: MetadataSecurityRequest): Promise<PdfOperationOutput>
  revealInFolder(targetPath: string): Promise<void>
  openFile(targetPath: string): Promise<void>
}

