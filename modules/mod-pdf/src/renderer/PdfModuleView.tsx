import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  FileText,
  Gauge,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Settings,
  Stamp,
  Trash2
} from 'lucide-react'
import type { ModuleViewProps } from '@panel/core-sdk'
import { GlobalToast, PanelCard, Switch, useI18n } from '@panel/ui-kit'
import type {
  ImageInputItem,
  OrganizedPageSpec,
  OutputSaveMode,
  PdfCompressionLevel,
  PdfDocumentInfo,
  PdfOperationOutput,
  PdfStudioSettings,
  SplitPdfMode
} from '../shared/types'
import {
  DEFAULT_PDF_SETTINGS,
  getPdfApi,
  isTauriPdf,
  isElectronPdf,
  loadPdfStudioSettings,
  savePdfStudioSettings
} from './lib/pdfApi'
import {
  clearPdfThumbnailCache,
  exportPdfPagesToImages,
  rasterizePdfPagesForCompression,
  renderPageThumbnail
} from './lib/pdfThumbnailRenderer'
import { PdfDropZone } from './components/DropZone'
import { PageGrid } from './components/PageGrid'
import { ActionFooter } from './components/ActionFooter'
import { ModuleSettings } from './components/ModuleSettings'

type PdfTabId = 'merge' | 'split' | 'organize' | 'compress' | 'convert' | 'settings'
type ConvertSubTool = 'img-to-pdf' | 'pdf-to-img' | 'stamp' | 'metadata'

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function CoverThumb({
  filePath,
  enabled
}: {
  filePath: string
  enabled: boolean
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    if (!enabled) {
      setUrl(null)
      return
    }
    renderPageThumbnail(filePath, 1, 'low').then((res) => {
      if (mounted) setUrl(res)
    })
    return () => {
      mounted = false
    }
  }, [filePath, enabled])

  return (
    <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-zinc-900/50">
      {url ? (
        <img src={url} alt="Portada" className="h-full w-full object-cover" />
      ) : (
        <FileText className="h-4 w-4 text-rose-400" />
      )}
    </div>
  )
}

function ImagePreviewThumb({ filePath }: { filePath: string }): JSX.Element {
  const api = useMemo(() => getPdfApi(), [])
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    api.readImageDataUrl(filePath, 240).then((res) => {
      if (mounted) setUrl(res)
    })
    return () => {
      mounted = false
    }
  }, [api, filePath])

  return (
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-zinc-900/40">
      {url ? (
        <img src={url} alt="Vista previa" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-6 w-6 text-rose-400/60" />
      )}
    </div>
  )
}

export default function PdfModuleView({ onStatusChange }: ModuleViewProps): JSX.Element {
  const { t } = useI18n()
  const api = useMemo(() => getPdfApi(), [])
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const [activeTab, setActiveTab] = useState<PdfTabId>('merge')
  const [busy, setBusy] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [toast, setToast] = useState<{
    msg: string
    type: 'info' | 'success' | 'warning' | 'error'
  } | null>(null)
  const [lastResult, setLastResult] = useState<PdfOperationOutput | null>(null)

  // Ajustes internos del módulo (Viñeta 6)
  const [settings, setSettings] = useState<PdfStudioSettings>(loadPdfStudioSettings)
  const [activeOutputMode, setActiveOutputMode] = useState<OutputSaveMode>(
    () => loadPdfStudioSettings().outputSaveMode
  )

  const updateSettings = useCallback((patch: Partial<PdfStudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      savePdfStudioSettings(next)
      if (patch.outputSaveMode) {
        setActiveOutputMode(patch.outputSaveMode)
      }
      return next
    })
  }, [])

  const notify = useCallback(
    (msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      setToast({ msg, type })
      setTimeout(() => setToast(null), 3500)
    },
    []
  )

  // Limpiar caché de miniaturas al desmontar el módulo para 0 consumo en reposo
  useEffect(() => {
    return () => {
      clearPdfThumbnailCache()
    }
  }, [])

  // ── Estados Viñeta 1: Unir PDF (Merge) ────────────────────────────
  const [mergeList, setMergeList] = useState<PdfDocumentInfo[]>([])

  // ── Estados Viñeta 2: Dividir y Extraer (Split) ───────────────────
  const [splitDoc, setSplitDoc] = useState<PdfDocumentInfo | null>(null)
  const [splitMode, setSplitMode] = useState<SplitPdfMode>('ranges')
  const [splitRangesText, setSplitRangesText] = useState('1-2')
  const [mergeRangesIntoOne, setMergeRangesIntoOne] = useState(false)
  const [selectedSplitPageIds, setSelectedSplitPageIds] = useState<string[]>([])

  // ── Estados Viñeta 3: Organizar, Rotar y Eliminar ─────────────────
  const [organizeBaseDoc, setOrganizeBaseDoc] = useState<PdfDocumentInfo | null>(null)
  const [organizedPages, setOrganizedPages] = useState<OrganizedPageSpec[]>([])

  // ── Estados Viñeta 4: Comprimir y Optimizar ───────────────────────
  const [compressDoc, setCompressDoc] = useState<PdfDocumentInfo | null>(null)
  const [compressionLevel, setCompressionLevel] = useState<PdfCompressionLevel>('medium')

  // ── Estados Viñeta 5: Convertir y Sellar ──────────────────────────
  const [convertSubTool, setConvertSubTool] = useState<ConvertSubTool>('img-to-pdf')
  const [imageItems, setImageItems] = useState<ImageInputItem[]>([])
  const [imgPageSize, setImgPageSize] = useState<'fit' | 'a4' | 'letter'>('a4')
  const [imgOrientation, setImgOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [imgMarginPt, setImgMarginPt] = useState<number>(20)
  const [optimizeHeavyImages, setOptimizeHeavyImages] = useState(true)

  const [convertPdfDoc, setConvertPdfDoc] = useState<PdfDocumentInfo | null>(null)
  const [exportImgFormat, setExportImgFormat] = useState<'jpg' | 'png'>('jpg')
  const [exportImgScale, setExportImgScale] = useState<1 | 2>(2)
  const [exportRangeMode, setExportRangeMode] = useState<'all' | 'custom'>('all')
  const [exportCustomRanges, setExportCustomRanges] = useState('1-5')

  const [enablePageNumbers, setEnablePageNumbers] = useState(true)
  const [pageNumberPosition, setPageNumberPosition] = useState<
    'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right' | 'top-center'
  >('bottom-right')
  const [pageNumberFormat, setPageNumberFormat] = useState<'simple' | 'page-of-total'>(
    'page-of-total'
  )
  const [startPageNumber, setStartPageNumber] = useState(1)
  const [enableWatermark, setEnableWatermark] = useState(false)
  const [watermarkText, setWatermarkText] = useState('CONFIDENCIAL')
  const [watermarkPosition, setWatermarkPosition] = useState<
    'diagonal' | 'center' | 'header' | 'footer'
  >('diagonal')
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.22)
  const [watermarkFontSize, setWatermarkFontSize] = useState(44)
  const [watermarkColorHex, setWatermarkColorHex] = useState('#e11d48')

  const [metaTitle, setMetaTitle] = useState('')
  const [metaAuthor, setMetaAuthor] = useState('')
  const [metaSubject, setMetaSubject] = useState('')
  const [metaKeywords, setMetaKeywords] = useState('')
  const [stripAllMetadata, setStripAllMetadata] = useState(false)
  const [securityAction, setSecurityAction] = useState<'none' | 'encrypt' | 'decrypt'>('none')
  const [securityPassword, setSecurityPassword] = useState('')
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  // Helpers de carga de archivos
  const addPdfsToMerge = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const inspected = await api.inspectPdfs(paths)
      setMergeList((prev) => {
        const existingPaths = new Set(prev.map((p) => p.path))
        const filtered = inspected.filter((d) => !d.error && !existingPaths.has(d.path))
        return [...prev, ...filtered]
      })
    } finally {
      setBusy(false)
    }
  }

  const loadSinglePdfForSplit = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const [doc] = await api.inspectPdfs([paths[0]])
      if (doc && !doc.error) {
        setSplitDoc(doc)
        setSplitRangesText(`1-${Math.min(2, doc.pageCount)}`)
        setSelectedSplitPageIds(
          Array.from({ length: doc.pageCount }, (_, i) => `${doc.path}::${i}`)
        )
      } else {
        notify(doc?.error ?? 'Archivo PDF inválido', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const loadPdfForOrganize = async (paths: string[], append = false): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const docs = await api.inspectPdfs(paths)
      const validDocs = docs.filter((d) => !d.error && d.pageCount > 0)
      if (validDocs.length === 0) {
        notify('No se pudo leer el documento PDF', 'error')
        return
      }

      if (!append || !organizeBaseDoc) {
        const first = validDocs[0]
        setOrganizeBaseDoc(first)
        const specs: OrganizedPageSpec[] = Array.from(
          { length: first.pageCount },
          (_, idx) => ({
            id: `${first.path}::${idx}::${Math.random().toString(36).slice(2, 7)}`,
            sourceFilePath: first.path,
            sourceFileName: first.name,
            sourcePageIndex: idx,
            originalPageNumber: idx + 1,
            rotation: 0
          })
        )
        setOrganizedPages(specs)
      } else {
        const addedSpecs: OrganizedPageSpec[] = []
        for (const doc of validDocs) {
          for (let idx = 0; idx < doc.pageCount; idx++) {
            addedSpecs.push({
              id: `${doc.path}::${idx}::${Math.random().toString(36).slice(2, 7)}`,
              sourceFilePath: doc.path,
              sourceFileName: doc.name,
              sourcePageIndex: idx,
              originalPageNumber: idx + 1,
              rotation: 0
            })
          }
        }
        setOrganizedPages((prev) => [...prev, ...addedSpecs])
        notify(`Se insertaron ${addedSpecs.length} páginas adicionales`, 'success')
      }
    } finally {
      setBusy(false)
    }
  }

  const loadPdfForCompress = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const [doc] = await api.inspectPdfs([paths[0]])
      if (doc && !doc.error) {
        setCompressDoc(doc)
        setLastResult(null)
      } else {
        notify(doc?.error ?? 'No se pudo cargar el PDF', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const loadPdfForConvert = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const [doc] = await api.inspectPdfs([paths[0]])
      if (doc && !doc.error) {
        setConvertPdfDoc(doc)
        setMetaTitle(doc.title ?? '')
        setMetaAuthor(doc.author ?? '')
        setMetaSubject(doc.subject ?? '')
        setMetaKeywords(doc.keywords ?? '')
        setExportCustomRanges(`1-${doc.pageCount}`)
      } else {
        notify(doc?.error ?? 'Error al leer el PDF', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const addImagesForConvert = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const inspected = await api.inspectImages(paths)
      setImageItems((prev) => {
        const existing = new Set(prev.map((i) => i.path))
        return [...prev, ...inspected.filter((i) => !existing.has(i.path))]
      })
    } finally {
      setBusy(false)
    }
  }

  // Páginas derivadas para Split
  const splitPagesSpec = useMemo<OrganizedPageSpec[]>(() => {
    if (!splitDoc) return []
    return Array.from({ length: splitDoc.pageCount }, (_, i) => ({
      id: `${splitDoc.path}::${i}`,
      sourceFilePath: splitDoc.path,
      sourceFileName: splitDoc.name,
      sourcePageIndex: i,
      originalPageNumber: i + 1,
      rotation: 0
    }))
  }, [splitDoc])

  // ── Ejecución de Operaciones ──────────────────────────────────────
  const runOperation = async (
    taskLabel: string,
    fn: () => Promise<PdfOperationOutput>
  ): Promise<void> => {
    setBusy(true)
    setProgressText(taskLabel)
    onStatusChangeRef.current?.(true, taskLabel)
    try {
      const res = await fn()
      if (res.canceled) {
        notify('Operación cancelada', 'info')
        return
      }
      setLastResult(res)
      notify(res.message, res.success ? 'success' : 'error')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error durante la operación', 'error')
    } finally {
      setBusy(false)
      setProgressText('')
      onStatusChangeRef.current?.(false, 'Listo (0 MB en reposo)')
    }
  }

  const handleExecuteMerge = (): void => {
    void runOperation('Uniendo documentos PDF...', () =>
      api.mergePdfs({
        filePaths: mergeList.map((d) => d.path),
        outputMode: activeOutputMode,
        customOutputDir: settings.customOutputDir,
        suffix: `${settings.defaultSuffix}_unido`,
        revealOnFinish: settings.revealInExplorerOnFinish
      })
    )
  }

  const handleExecuteSplit = (): void => {
    if (!splitDoc) return
    const selectedNumbers = selectedSplitPageIds
      .map((id) => {
        const idx = parseInt(id.split('::').pop() ?? '0', 10)
        return idx + 1
      })
      .sort((a, b) => a - b)

    void runOperation('Dividiendo documento PDF...', () =>
      api.splitPdf({
        filePath: splitDoc.path,
        mode: splitMode,
        rangesText: splitRangesText,
        mergeRangesIntoOne,
        selectedPages: selectedNumbers,
        outputMode: activeOutputMode,
        customOutputDir: settings.customOutputDir,
        suffix: `${settings.defaultSuffix}_dividido`,
        revealOnFinish: settings.revealInExplorerOnFinish
      })
    )
  }

  const handleExecuteOrganize = (): void => {
    if (!organizeBaseDoc || organizedPages.length === 0) return
    void runOperation('Guardando páginas organizadas...', () =>
      api.organizePdf({
        baseFilePath: organizeBaseDoc.path,
        pages: organizedPages,
        outputMode: activeOutputMode,
        customOutputDir: settings.customOutputDir,
        suffix: `${settings.defaultSuffix}_organizado`,
        revealOnFinish: settings.revealInExplorerOnFinish
      })
    )
  }

  const handleExecuteCompress = (): void => {
    if (!compressDoc) return
    void runOperation('Optimizando y comprimiendo PDF...', async () => {
      let rasterizedPages
      if (compressionLevel === 'medium' || compressionLevel === 'extreme') {
        rasterizedPages = await rasterizePdfPagesForCompression(
          compressDoc.path,
          compressionLevel,
          (curr, total) => {
            setProgressText(`Re-muestreando página ${curr} de ${total}...`)
          }
        )
      }
      return api.compressPdf({
        filePath: compressDoc.path,
        level: compressionLevel,
        rasterizedPages,
        outputMode: activeOutputMode,
        customOutputDir: settings.customOutputDir,
        suffix: `${settings.defaultSuffix}_comprimido`,
        revealOnFinish: settings.revealInExplorerOnFinish
      })
    })
  }

  const handleExecuteConvertSubTool = (): void => {
    if (convertSubTool === 'img-to-pdf') {
      void runOperation('Generando PDF desde imágenes...', () =>
        api.imagesToPdf({
          imagePaths: imageItems.map((i) => i.path),
          pageSize: imgPageSize,
          orientation: imgOrientation,
          marginPt: imgMarginPt,
          optimizeHeavyImages,
          maxDimensionPx: 2200,
          jpegQuality: 82,
          outputMode: activeOutputMode,
          customOutputDir: settings.customOutputDir,
          suffix: `${settings.defaultSuffix}_imagenes`,
          revealOnFinish: settings.revealInExplorerOnFinish
        })
      )
      return
    }

    if (!convertPdfDoc) return

    if (convertSubTool === 'pdf-to-img') {
      void runOperation('Exportando páginas del PDF a imágenes...', async () => {
        const total = convertPdfDoc.pageCount
        const pageNumbers: number[] = []
        if (exportRangeMode === 'all') {
          for (let p = 1; p <= total; p++) pageNumbers.push(p)
        } else {
          for (const part of exportCustomRanges.split(',')) {
            const trimmed = part.trim()
            if (trimmed.includes('-')) {
              const [s, e] = trimmed.split('-').map((n) => parseInt(n.trim(), 10))
              if (!Number.isNaN(s) && !Number.isNaN(e)) {
                for (let p = Math.max(1, s); p <= Math.min(total, e); p++) pageNumbers.push(p)
              }
            } else {
              const p = parseInt(trimmed, 10)
              if (!Number.isNaN(p) && p >= 1 && p <= total) pageNumbers.push(p)
            }
          }
        }

        const rendered = await exportPdfPagesToImages(
          convertPdfDoc.path,
          pageNumbers,
          exportImgFormat,
          exportImgScale,
          (curr, count) => {
            setProgressText(`Renderizando página ${curr} de ${count}...`)
          }
        )

        return api.saveExportedImages({
          sourcePdfPath: convertPdfDoc.path,
          images: rendered,
          outputMode: activeOutputMode,
          customOutputDir: settings.customOutputDir,
          revealOnFinish: settings.revealInExplorerOnFinish
        })
      })
      return
    }

    if (convertSubTool === 'stamp') {
      void runOperation('Estampando numeración y marca de agua...', () =>
        api.stampPdf({
          filePath: convertPdfDoc.path,
          enablePageNumbers,
          pageNumberPosition,
          pageNumberFormat,
          startPageNumber,
          enableWatermark,
          watermarkText,
          watermarkPosition,
          watermarkOpacity,
          watermarkFontSize,
          watermarkColorHex,
          outputMode: activeOutputMode,
          customOutputDir: settings.customOutputDir,
          suffix: `${settings.defaultSuffix}_sellado`,
          revealOnFinish: settings.revealInExplorerOnFinish
        })
      )
      return
    }

    if (convertSubTool === 'metadata') {
      void runOperation('Actualizando metadatos y seguridad...', () =>
        api.updateMetadataAndSecurity({
          filePath: convertPdfDoc.path,
          title: metaTitle,
          author: metaAuthor,
          subject: metaSubject,
          keywords: metaKeywords,
          stripAllMetadata,
          securityAction,
          password: securityPassword,
          outputMode: activeOutputMode,
          customOutputDir: settings.customOutputDir,
          suffix: `${settings.defaultSuffix}_meta`,
          revealOnFinish: settings.revealInExplorerOnFinish
        })
      )
    }
  }

  const handleContainerDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!isDraggingFiles) setIsDraggingFiles(true)
  }

  const handleContainerDragLeave = (e: React.DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingFiles(false)
    }
  }

  const dispatchDroppedPaths = useCallback(
    (paths: string[]): void => {
      if (busy || paths.length === 0) return

      const isImageMode = activeTab === 'convert' && convertSubTool === 'img-to-pdf'
      const validExts = isImageMode
        ? ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
        : ['.pdf']

      const validPaths = paths.filter((p) =>
        validExts.some((ext) => p.toLowerCase().endsWith(ext))
      )

      if (validPaths.length === 0) return

      if (activeTab === 'merge') {
        void addPdfsToMerge(validPaths)
      } else if (activeTab === 'split') {
        void loadSinglePdfForSplit([validPaths[0]])
      } else if (activeTab === 'organize') {
        void loadPdfForOrganize(validPaths, Boolean(organizeBaseDoc))
      } else if (activeTab === 'compress') {
        void loadPdfForCompress([validPaths[0]])
      } else if (activeTab === 'convert') {
        if (convertSubTool === 'img-to-pdf') {
          void addImagesForConvert(validPaths)
        } else {
          void loadPdfForConvert([validPaths[0]])
        }
      }
    },
    [
      busy,
      activeTab,
      convertSubTool,
      organizeBaseDoc,
      addPdfsToMerge,
      loadSinglePdfForSplit,
      loadPdfForOrganize,
      loadPdfForCompress,
      addImagesForConvert,
      loadPdfForConvert
    ]
  )

  // Escuchar eventos nativos de arrastre de archivos en Windows (Tauri v2 drag-drop)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let isMounted = true

    if (
      typeof window !== 'undefined' &&
      Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
    ) {
      import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => {
          if (!isMounted) return
          getCurrentWebview()
            .onDragDropEvent((event) => {
              if (!isMounted) return
              if (event.payload.type === 'enter' || event.payload.type === 'over') {
                setIsDraggingFiles(true)
              } else if (event.payload.type === 'leave') {
                setIsDraggingFiles(false)
              } else if (event.payload.type === 'drop') {
                setIsDraggingFiles(false)
                const droppedPaths = event.payload.paths
                if (droppedPaths && droppedPaths.length > 0) {
                  dispatchDroppedPaths(droppedPaths)
                }
              }
            })
            .then((fn) => {
              if (isMounted) {
                unlisten = fn
              } else {
                fn()
              }
            })
            .catch((err) => {
              console.error('Error onDragDropEvent in PdfModuleView:', err)
            })
        })
        .catch(() => {})
    }

    return () => {
      isMounted = false
      unlisten?.()
    }
  }, [dispatchDroppedPaths])

  const handleContainerDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    if (busy || !e.dataTransfer?.files?.length) return

    const files = Array.from(e.dataTransfer.files)
    const paths = files
      .map((f) => {
        try {
          return api.getPathForFile(f) || (f as File & { path?: string }).path || ''
        } catch {
          return (f as File & { path?: string }).path || ''
        }
      })
      .filter(Boolean)

    if (paths.length > 0) {
      dispatchDroppedPaths(paths)
    }
  }

  return (
    <div
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
      className="flex h-full flex-col gap-3.5 overflow-hidden"
    >
      {/* Cabecera de PDF Studio */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md shadow-rose-500/20">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t.pdf.title}
              </h2>
              <span className="rounded-md bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-400">
                {t.pdf.localTag}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {t.pdf.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isTauriPdf && !isElectronPdf && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
              {t.pdf.simulationMode}
            </span>
          )}
          {progressText && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              {progressText}
            </span>
          )}
        </div>
      </div>

      {/* Navegación por 6 Viñetas (Tabs) */}
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-[var(--border-subtle)] pb-2">
        {(
          [
            { id: 'merge', label: t.pdf.tabs.merge, icon: Layers },
            { id: 'split', label: t.pdf.tabs.split, icon: Scissors },
            { id: 'organize', label: t.pdf.tabs.organize, icon: LayoutGrid },
            { id: 'compress', label: t.pdf.tabs.compress, icon: Gauge },
            { id: 'convert', label: t.pdf.tabs.convert, icon: Stamp },
            { id: 'settings', label: t.pdf.tabs.settings, icon: Settings }
          ] as const
        ).map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id)
                setLastResult(null)
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/35'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Área Principal de Trabajo */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* ════════════════════════════════════════════════════════════════
            VIÑETA 1: UNIR PDF (MERGE)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'merge' && (
          <div className="space-y-4">
            <PdfDropZone
              mode="pdf"
              multiple
              compact={mergeList.length > 0}
              busy={busy}
              isDragging={isDraggingFiles}
              onBrowse={async () => {
                const paths = await api.selectPdfFiles(true)
                await addPdfsToMerge(paths)
              }}
              onDropFiles={(paths) => void addPdfsToMerge(paths)}
            />

            {mergeList.length > 0 && (
              <PanelCard className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {t.pdf.mergeQueueTitle
                        .replace('{0}', String(mergeList.length))
                        .replace('{1}', String(mergeList.reduce((a, b) => a + b.pageCount, 0)))}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMergeList([])}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-rose-400 transition hover:bg-rose-500/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t.pdf.clearList}
                  </button>
                </div>

                <div className="space-y-2">
                  {mergeList.map((doc, idx) => (
                    <div
                      key={doc.path}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--bg-surface)] font-mono text-[11px] font-bold text-[var(--text-muted)]">
                          {idx + 1}
                        </span>
                        <CoverThumb filePath={doc.path} enabled={settings.showRealThumbnails} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                            {doc.name}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                            {formatSize(doc.sizeBytes)} · {doc.pageCount} {t.pdf.settingsView.pagesCount.replace('{0}', '')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            setMergeList((prev) => {
                              const copy = [...prev]
                              const [moved] = copy.splice(idx, 1)
                              copy.splice(idx - 1, 0, moved)
                              return copy
                            })
                          }}
                          title={t.pdf.moveUp}
                          className="icon-btn"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === mergeList.length - 1}
                          onClick={() => {
                            setMergeList((prev) => {
                              const copy = [...prev]
                              const [moved] = copy.splice(idx, 1)
                              copy.splice(idx + 1, 0, moved)
                              return copy
                            })
                          }}
                          title={t.pdf.moveDown}
                          className="icon-btn"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMergeList((prev) => prev.filter((item) => item.path !== doc.path))
                          }
                          title={t.pdf.removeFromList}
                          className="icon-btn text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelCard>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            VIÑETA 2: DIVIDIR Y EXTRAER (SPLIT & EXTRACT)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'split' && (
          <div className="space-y-4">
            {!splitDoc ? (
              <PdfDropZone
                mode="pdf"
                multiple={false}
                busy={busy}
                isDragging={isDraggingFiles}
                title={t.pdf.splitDropzoneTitle}
                onBrowse={async () => {
                  const paths = await api.selectPdfFiles(false)
                  await loadSinglePdfForSplit(paths)
                }}
                onDropFiles={(paths) => void loadSinglePdfForSplit(paths)}
              />
            ) : (
              <>
                <PanelCard className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CoverThumb filePath={splitDoc.path} enabled={settings.showRealThumbnails} />
                      <div>
                        <h3 className="text-xs font-bold text-[var(--text-primary)]">
                          {splitDoc.name}
                        </h3>
                        <p className="font-mono text-[11px] text-[var(--text-muted)]">
                          {formatSize(splitDoc.sizeBytes)} · {splitDoc.pageCount} {t.pdf.settingsView.pagesCount.replace('{0}', '')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          { id: 'ranges', label: t.pdf.splitModeRanges },
                          { id: 'selected-pages', label: t.pdf.splitModePages },
                          { id: 'explode-all', label: t.pdf.splitModeAll }
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSplitMode(m.id)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                            splitMode === m.id
                              ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40'
                              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setSplitDoc(null)}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-rose-400"
                      >
                        {t.pdf.changePdf}
                      </button>
                    </div>
                  </div>

                  {splitMode === 'ranges' && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                      <div className="min-w-[240px] flex-1">
                        <label className="block text-xs font-semibold text-[var(--text-primary)]">
                          {t.pdf.rangesLabel}
                        </label>
                        <input
                          type="text"
                          value={splitRangesText}
                          onChange={(e) => setSplitRangesText(e.target.value)}
                          placeholder="1-3, 5, 8-12"
                          className="mt-1.5 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-rose-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {t.pdf.mergeRangesIntoOne}
                        </span>
                        <Switch
                          checked={mergeRangesIntoOne}
                          accent="rose"
                          onChange={setMergeRangesIntoOne}
                        />
                      </div>
                    </div>
                  )}

                  {splitMode === 'selected-pages' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2.5 text-xs">
                      <span className="text-[var(--text-secondary)]">
                        {t.pdf.splitPagesHint
                          .replace('{0}', String(selectedSplitPageIds.length))
                          .replace('{1}', String(splitDoc.pageCount))}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSplitPageIds(splitPagesSpec.map((p) => p.id))
                          }
                          className="rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium hover:text-rose-400"
                        >
                          {t.pdf.selectAll}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedSplitPageIds([])}
                          className="rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium hover:text-rose-400"
                        >
                          {t.pdf.selectNone}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSplitPageIds(
                              splitPagesSpec
                                .filter((_, i) => (i + 1) % 2 === 1)
                                .map((p) => p.id)
                            )
                          }
                          className="rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium hover:text-rose-400"
                        >
                          {t.pdf.selectOdd}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSplitPageIds(
                              splitPagesSpec
                                .filter((_, i) => (i + 1) % 2 === 0)
                                .map((p) => p.id)
                            )
                          }
                          className="rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium hover:text-rose-400"
                        >
                          {t.pdf.selectEven}
                        </button>
                      </div>
                    </div>
                  )}
                </PanelCard>

                <PanelCard className="p-4">
                  <PageGrid
                    pages={splitPagesSpec}
                    showRealThumbnails={settings.showRealThumbnails}
                    quality={settings.thumbnailQuality}
                    maxAutoPages={settings.maxAutoThumbnailPages}
                    selectable={splitMode === 'selected-pages'}
                    selectedPageIds={selectedSplitPageIds}
                    onToggleSelectPage={(page) => {
                      setSelectedSplitPageIds((prev) =>
                        prev.includes(page.id)
                          ? prev.filter((id) => id !== page.id)
                          : [...prev, page.id]
                      )
                    }}
                  />
                </PanelCard>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            VIÑETA 3: ORGANIZAR, ROTAR Y ELIMINAR (ORGANIZE)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'organize' && (
          <div className="space-y-4">
            {!organizeBaseDoc ? (
              <PdfDropZone
                mode="pdf"
                multiple={false}
                busy={busy}
                isDragging={isDraggingFiles}
                title={t.pdf.organizeDropzoneTitle}
                onBrowse={async () => {
                  const paths = await api.selectPdfFiles(false)
                  await loadPdfForOrganize(paths, false)
                }}
                onDropFiles={(paths) => void loadPdfForOrganize(paths, false)}
              />
            ) : (
              <>
                <PanelCard className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <CoverThumb
                      filePath={organizeBaseDoc.path}
                      enabled={settings.showRealThumbnails}
                    />
                    <div>
                      <h3 className="text-xs font-bold text-[var(--text-primary)]">
                        {organizeBaseDoc.name}
                      </h3>
                      <p className="font-mono text-[11px] text-[var(--text-muted)]">
                        {t.pdf.activePagesCount.replace('{0}', String(organizedPages.length))}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOrganizedPages((prev) =>
                          prev.map((p) => ({
                            ...p,
                            rotation: ((p.rotation + 270) % 360) as 0 | 90 | 180 | 270
                          }))
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t.pdf.rotateAllLeft}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOrganizedPages((prev) =>
                          prev.map((p) => ({
                            ...p,
                            rotation: ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270
                          }))
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <RotateCw className="h-3.5 w-3.5" /> {t.pdf.rotateAllRight}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const extra = await api.selectPdfFiles(true)
                        await loadPdfForOrganize(extra, true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/25"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" /> {t.pdf.insertOtherPdf}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadPdfForOrganize([organizeBaseDoc.path], false)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {t.pdf.resetBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrganizeBaseDoc(null)
                        setOrganizedPages([])
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-rose-400"
                    >
                      {t.pdf.closePdf}
                    </button>
                  </div>
                </PanelCard>

                <PanelCard className="p-4">
                  <PageGrid
                    pages={organizedPages}
                    showRealThumbnails={settings.showRealThumbnails}
                    quality={settings.thumbnailQuality}
                    maxAutoPages={settings.maxAutoThumbnailPages}
                    onRotatePage={(id, delta) => {
                      setOrganizedPages((prev) =>
                        prev.map((p) =>
                          p.id === id
                            ? { ...p, rotation: ((p.rotation + delta) % 360) as 0 | 90 | 180 | 270 }
                            : p
                        )
                      )
                    }}
                    onDeletePage={(id) => {
                      setOrganizedPages((prev) => prev.filter((p) => p.id !== id))
                    }}
                    onMovePage={(index, dir) => {
                      setOrganizedPages((prev) => {
                        const target = index + dir
                        if (target < 0 || target >= prev.length) return prev
                        const copy = [...prev]
                        const [moved] = copy.splice(index, 1)
                        copy.splice(target, 0, moved)
                        return copy
                      })
                    }}
                  />
                </PanelCard>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            VIÑETA 4: COMPRIMIR Y OPTIMIZAR (COMPRESS)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'compress' && (
          <div className="space-y-4">
            {!compressDoc ? (
              <PdfDropZone
                mode="pdf"
                multiple={false}
                busy={busy}
                isDragging={isDraggingFiles}
                title={t.pdf.compressDropzoneTitle}
                onBrowse={async () => {
                  const paths = await api.selectPdfFiles(false)
                  await loadPdfForCompress(paths)
                }}
                onDropFiles={(paths) => void loadPdfForCompress(paths)}
              />
            ) : (
              <PanelCard className="space-y-5 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <CoverThumb
                      filePath={compressDoc.path}
                      enabled={settings.showRealThumbnails}
                    />
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        {compressDoc.name}
                      </h3>
                      <p className="font-mono text-xs text-rose-400">
                        {t.pdf.currentSize
                          .replace('{0}', formatSize(compressDoc.sizeBytes))
                          .replace('{1}', String(compressDoc.pageCount))}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompressDoc(null)}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-rose-400"
                  >
                    {t.pdf.changeFile}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {(
                    [
                      {
                        id: 'low',
                        title: t.pdf.compressLowTitle,
                        badge: t.pdf.compressLowBadge,
                        desc: t.pdf.compressLowDesc
                      },
                      {
                        id: 'medium',
                        title: t.pdf.compressMedTitle,
                        badge: t.pdf.compressMedBadge,
                        desc: t.pdf.compressMedDesc
                      },
                      {
                        id: 'extreme',
                        title: t.pdf.compressExtTitle,
                        badge: t.pdf.compressExtBadge,
                        desc: t.pdf.compressExtDesc
                      }
                    ] as const
                  ).map((lvl) => {
                    const selected = compressionLevel === lvl.id
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setCompressionLevel(lvl.id)}
                        className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-rose-500 bg-rose-500/10 ring-1 ring-rose-500/40'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              {lvl.title}
                            </span>
                            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-400">
                              {lvl.badge}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                            {lvl.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </PanelCard>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            VIÑETA 5: CONVERTIR Y SELLAR (CONVERT & STAMP)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'convert' && (
          <div className="space-y-4">
            {/* Selector de sub-herramienta */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'img-to-pdf', label: t.pdf.subImgToPdf, icon: ImageIcon },
                  { id: 'pdf-to-img', label: t.pdf.subPdfToImg, icon: Layers },
                  { id: 'stamp', label: t.pdf.subStamp, icon: Stamp },
                  { id: 'metadata', label: t.pdf.subMetadata, icon: Lock }
                ] as const
              ).map((sub) => {
                const SubIcon = sub.icon
                const active = convertSubTool === sub.id
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setConvertSubTool(sub.id)
                      setLastResult(null)
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                      active
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-400'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <SubIcon className="h-3.5 w-3.5" />
                    {sub.label}
                  </button>
                )
              })}
            </div>

            {/* Sub-herramienta 5A: Imágenes a PDF */}
            {convertSubTool === 'img-to-pdf' && (
              <div className="space-y-4">
                <PdfDropZone
                  mode="image"
                  multiple
                  compact={imageItems.length > 0}
                  busy={busy}
                  isDragging={isDraggingFiles}
                  onBrowse={async () => {
                    const paths = await api.selectImageFiles()
                    await addImagesForConvert(paths)
                  }}
                  onDropFiles={(paths) => void addImagesForConvert(paths)}
                />

                {imageItems.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <PanelCard className="p-4 lg:col-span-2">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                          {t.pdf.selectedImages.replace('{0}', String(imageItems.length))}
                        </h4>
                        <button
                          type="button"
                          onClick={() => setImageItems([])}
                          className="text-xs text-rose-400 hover:underline"
                        >
                          {t.pdf.clearAllImages}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {imageItems.map((img, idx) => (
                          <div
                            key={img.path}
                            className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2"
                          >
                            <ImagePreviewThumb filePath={img.path} />
                            <div className="mt-2">
                              <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                                {idx + 1}. {img.name}
                              </p>
                              <p className="font-mono text-[9px] text-[var(--text-muted)]">
                                {img.width}×{img.height} · {formatSize(img.sizeBytes)}
                              </p>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-1">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    setImageItems((prev) => {
                                      const c = [...prev]
                                      const [m] = c.splice(idx, 1)
                                      c.splice(idx - 1, 0, m)
                                      return c
                                    })
                                  }
                                  className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-25"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === imageItems.length - 1}
                                  onClick={() =>
                                    setImageItems((prev) => {
                                      const c = [...prev]
                                      const [m] = c.splice(idx, 1)
                                      c.splice(idx + 1, 0, m)
                                      return c
                                    })
                                  }
                                  className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-25"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setImageItems((prev) => prev.filter((i) => i.path !== img.path))
                                }
                                className="rounded p-1 text-rose-400 hover:bg-rose-500/15"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelCard>

                    <PanelCard className="space-y-3.5 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        {t.pdf.imgOptionsTitle}
                      </h4>

                      <div>
                        <label className="block text-xs font-medium text-[var(--text-primary)]">
                          {t.pdf.pageSize}
                        </label>
                        <select
                          value={imgPageSize}
                          onChange={(e) =>
                            setImgPageSize(e.target.value as 'fit' | 'a4' | 'letter')
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                        >
                          <option value="a4" className="bg-zinc-900">
                            {t.pdf.pageSizeA4}
                          </option>
                          <option value="letter" className="bg-zinc-900">
                            {t.pdf.pageSizeLetter}
                          </option>
                          <option value="fit" className="bg-zinc-900">
                            {t.pdf.pageSizeFit}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[var(--text-primary)]">
                          {t.pdf.orientation}
                        </label>
                        <select
                          value={imgOrientation}
                          onChange={(e) =>
                            setImgOrientation(
                              e.target.value as 'auto' | 'portrait' | 'landscape'
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                        >
                          <option value="auto" className="bg-zinc-900">
                            {t.pdf.orientationAuto}
                          </option>
                          <option value="portrait" className="bg-zinc-900">
                            {t.pdf.orientationPortrait}
                          </option>
                          <option value="landscape" className="bg-zinc-900">
                            {t.pdf.orientationLandscape}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[var(--text-primary)]">
                          {t.pdf.margins}
                        </label>
                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { pt: 0, label: t.pdf.marginNone },
                              { pt: 20, label: t.pdf.marginNormal },
                              { pt: 40, label: t.pdf.marginWide }
                            ] as const
                          ).map((m) => (
                            <button
                              key={m.pt}
                              type="button"
                              onClick={() => setImgMarginPt(m.pt)}
                              className={`rounded-lg py-1.5 text-xs font-medium transition ${
                                imgMarginPt === m.pt
                                  ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40'
                                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                        <div>
                          <p className="text-xs font-semibold text-[var(--text-primary)]">
                            {t.pdf.optimizeHeavyImages}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {t.pdf.optimizeHeavyImagesDesc}
                          </p>
                        </div>
                        <Switch
                          checked={optimizeHeavyImages}
                          accent="rose"
                          onChange={setOptimizeHeavyImages}
                        />
                      </div>
                    </PanelCard>
                  </div>
                )}
              </div>
            )}

            {/* Sub-herramientas 5B, 5C, 5D que operan sobre un archivo PDF */}
            {convertSubTool !== 'img-to-pdf' && (
              <>
                {!convertPdfDoc ? (
                  <PdfDropZone
                    mode="pdf"
                    multiple={false}
                    busy={busy}
                    isDragging={isDraggingFiles}
                    onBrowse={async () => {
                      const paths = await api.selectPdfFiles(false)
                      await loadPdfForConvert(paths)
                    }}
                    onDropFiles={(paths) => void loadPdfForConvert(paths)}
                  />
                ) : (
                  <PanelCard className="space-y-4 p-5">
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                      <div className="flex items-center gap-3">
                        <CoverThumb
                          filePath={convertPdfDoc.path}
                          enabled={settings.showRealThumbnails}
                        />
                        <div>
                          <h3 className="text-xs font-bold text-[var(--text-primary)]">
                            {convertPdfDoc.name}
                          </h3>
                          <p className="font-mono text-[11px] text-[var(--text-muted)]">
                            {formatSize(convertPdfDoc.sizeBytes)} · {convertPdfDoc.pageCount} {t.pdf.settingsView.pagesCount.replace('{0}', '')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConvertPdfDoc(null)}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-rose-400"
                      >
                        {t.pdf.changePdf}
                      </button>
                    </div>

                    {convertSubTool === 'pdf-to-img' && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                          <label className="block text-xs font-semibold text-[var(--text-primary)]">
                            {t.pdf.imgFormat}
                          </label>
                          <div className="mt-2 flex gap-2">
                            {(['jpg', 'png'] as const).map((fmt) => (
                              <button
                                key={fmt}
                                type="button"
                                onClick={() => setExportImgFormat(fmt)}
                                className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase transition ${
                                  exportImgFormat === fmt
                                    ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40'
                                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                                }`}
                              >
                                {fmt}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                          <label className="block text-xs font-semibold text-[var(--text-primary)]">
                            {t.pdf.resolutionScale}
                          </label>
                          <div className="mt-2 flex gap-2">
                            {(
                              [
                                { s: 1, label: t.pdf.scale1x },
                                { s: 2, label: t.pdf.scale2x }
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.s}
                                type="button"
                                onClick={() => setExportImgScale(opt.s)}
                                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                                  exportImgScale === opt.s
                                    ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40'
                                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                          <label className="block text-xs font-semibold text-[var(--text-primary)]">
                            {t.pdf.exportPages}
                          </label>
                          <div className="mt-2 flex items-center gap-2">
                            <select
                              value={exportRangeMode}
                              onChange={(e) =>
                                setExportRangeMode(e.target.value as 'all' | 'custom')
                              }
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                            >
                              <option value="all" className="bg-zinc-900">
                                {t.pdf.exportAll.replace('{0}', String(convertPdfDoc.pageCount))}
                              </option>
                              <option value="custom" className="bg-zinc-900">
                                {t.pdf.exportCustomRange}
                              </option>
                            </select>
                            {exportRangeMode === 'custom' && (
                              <input
                                type="text"
                                value={exportCustomRanges}
                                onChange={(e) => setExportCustomRanges(e.target.value)}
                                placeholder="1-5, 8"
                                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {convertSubTool === 'stamp' && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Numeración de Páginas */}
                        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-[var(--text-primary)]">
                                {t.pdf.numberPages}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                {t.pdf.numberPagesDesc}
                              </p>
                            </div>
                            <Switch
                              checked={enablePageNumbers}
                              accent="rose"
                              onChange={setEnablePageNumbers}
                            />
                          </div>

                          {enablePageNumbers && (
                            <div className="grid grid-cols-2 gap-3 pt-2">
                              <div>
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.position}
                                </label>
                                <select
                                  value={pageNumberPosition}
                                  onChange={(e) =>
                                    setPageNumberPosition(
                                      e.target.value as typeof pageNumberPosition
                                    )
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                                >
                                  <option value="bottom-right" className="bg-zinc-900">
                                    {t.pdf.posBottomRight}
                                  </option>
                                  <option value="bottom-center" className="bg-zinc-900">
                                    {t.pdf.posBottomCenter}
                                  </option>
                                  <option value="bottom-left" className="bg-zinc-900">
                                    {t.pdf.posBottomLeft}
                                  </option>
                                  <option value="top-right" className="bg-zinc-900">
                                    {t.pdf.posTopRight}
                                  </option>
                                  <option value="top-center" className="bg-zinc-900">
                                    {t.pdf.posTopCenter}
                                  </option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.numFormat}
                                </label>
                                <select
                                  value={pageNumberFormat}
                                  onChange={(e) =>
                                    setPageNumberFormat(
                                      e.target.value as 'simple' | 'page-of-total'
                                    )
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                                >
                                  <option value="page-of-total" className="bg-zinc-900">
                                    {t.pdf.numPageOfTotal}
                                  </option>
                                  <option value="simple" className="bg-zinc-900">
                                    {t.pdf.numSimple}
                                  </option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Marca de Agua */}
                        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-[var(--text-primary)]">
                                {t.pdf.watermark}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                {t.pdf.watermarkDesc}
                              </p>
                            </div>
                            <Switch
                              checked={enableWatermark}
                              accent="rose"
                              onChange={setEnableWatermark}
                            />
                          </div>

                          {enableWatermark && (
                            <div className="grid grid-cols-2 gap-3 pt-2">
                              <div className="col-span-2">
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.stampText}
                                </label>
                                <input
                                  type="text"
                                  value={watermarkText}
                                  onChange={(e) => setWatermarkText(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.layout}
                                </label>
                                <select
                                  value={watermarkPosition}
                                  onChange={(e) =>
                                    setWatermarkPosition(
                                      e.target.value as typeof watermarkPosition
                                    )
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                                >
                                  <option value="diagonal" className="bg-zinc-900">
                                    {t.pdf.layoutDiagonal}
                                  </option>
                                  <option value="center" className="bg-zinc-900">
                                    {t.pdf.layoutCenter}
                                  </option>
                                  <option value="header" className="bg-zinc-900">
                                    {t.pdf.layoutHeader}
                                  </option>
                                  <option value="footer" className="bg-zinc-900">
                                    {t.pdf.layoutFooter}
                                  </option>
                                </select>
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="flex-1">
                                  <label className="block text-[11px] text-[var(--text-secondary)]">
                                    {t.pdf.opacity.replace('{0}', String(Math.round(watermarkOpacity * 100)))}
                                  </label>
                                  <input
                                    type="range"
                                    min={0.08}
                                    max={0.8}
                                    step={0.04}
                                    value={watermarkOpacity}
                                    onChange={(e) =>
                                      setWatermarkOpacity(parseFloat(e.target.value))
                                    }
                                    className="mt-2 w-full accent-rose-500"
                                  />
                                </div>
                                <input
                                  type="color"
                                  value={watermarkColorHex}
                                  onChange={(e) => setWatermarkColorHex(e.target.value)}
                                  className="h-8 w-10 cursor-pointer rounded border border-[var(--border-subtle)] bg-transparent"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {convertSubTool === 'metadata' && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-[var(--text-primary)]">
                              {t.pdf.docMetadata}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[var(--text-muted)]">
                                {t.pdf.purgeAll}
                              </span>
                              <Switch
                                checked={stripAllMetadata}
                                accent="rose"
                                onChange={setStripAllMetadata}
                              />
                            </div>
                          </div>

                          {!stripAllMetadata && (
                            <div className="space-y-2.5 pt-1">
                              <div>
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.metaTitle}
                                </label>
                                <input
                                  type="text"
                                  value={metaTitle}
                                  onChange={(e) => setMetaTitle(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.metaAuthor}
                                </label>
                                <input
                                  type="text"
                                  value={metaAuthor}
                                  onChange={(e) => setMetaAuthor(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[var(--text-secondary)]">
                                  {t.pdf.metaSubject}
                                </label>
                                <input
                                  type="text"
                                  value={metaSubject}
                                  onChange={(e) => setMetaSubject(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <p className="text-xs font-bold text-[var(--text-primary)]">
                            {t.pdf.securityTitle}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {t.pdf.securityDesc}
                          </p>

                          <div>
                            <label className="block text-[11px] text-[var(--text-secondary)]">
                              {t.pdf.securityAction}
                            </label>
                            <select
                              value={securityAction}
                              onChange={(e) =>
                                setSecurityAction(
                                  e.target.value as 'none' | 'encrypt' | 'decrypt'
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                            >
                              <option value="none" className="bg-zinc-900">
                                {t.pdf.secNone}
                              </option>
                              <option value="encrypt" className="bg-zinc-900">
                                {t.pdf.secEncrypt}
                              </option>
                              <option value="decrypt" className="bg-zinc-900">
                                {t.pdf.secDecrypt}
                              </option>
                            </select>
                          </div>

                          {securityAction !== 'none' && (
                            <div>
                              <label className="block text-[11px] text-[var(--text-secondary)]">
                                {t.pdf.password}
                              </label>
                              <input
                                type="password"
                                value={securityPassword}
                                onChange={(e) => setSecurityPassword(e.target.value)}
                                placeholder={t.pdf.passwordPlaceholder}
                                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </PanelCard>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            VIÑETA 6: CONFIGURACIÓN INTERNA DEL MÓDULO
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <ModuleSettings
            settings={settings}
            onUpdate={updateSettings}
            onBrowseCustomFolder={async () => {
              const chosen = await api.selectOutputFolder(settings.customOutputDir)
              if (chosen) {
                updateSettings({ customOutputDir: chosen, outputSaveMode: 'custom-folder' })
                notify('Carpeta de salida predeterminada actualizada', 'success')
              }
            }}
            onResetDefaults={() => {
              updateSettings(DEFAULT_PDF_SETTINGS)
              notify('Ajustes de PDF Studio restaurados', 'info')
            }}
          />
        )}
      </div>

      {/* Pie de Acción Unificado en las pestañas operativas */}
      {activeTab !== 'settings' && (
        <ActionFooter
          summaryText={
            activeTab === 'merge'
              ? `${mergeList.length} documentos en cola para fusionar`
              : activeTab === 'split'
                ? splitDoc
                  ? `${splitDoc.name} (${splitDoc.pageCount} págs) · Modo: ${
                      splitMode === 'ranges'
                        ? 'Por rangos'
                        : splitMode === 'selected-pages'
                          ? `${selectedSplitPageIds.length} págs seleccionadas`
                          : 'Separar todas'
                    }`
                  : 'Selecciona un documento PDF para comenzar'
                : activeTab === 'organize'
                  ? organizeBaseDoc
                    ? `${organizedPages.length} páginas listas para reconstruir`
                    : 'Selecciona un documento PDF para organizar'
                  : activeTab === 'compress'
                    ? compressDoc
                      ? `${compressDoc.name} (${formatSize(compressDoc.sizeBytes)}) · Nivel: ${
                          compressionLevel === 'low'
                            ? 'Baja'
                            : compressionLevel === 'medium'
                              ? 'Media (150 DPI)'
                              : 'Extrema (100 DPI)'
                        }`
                      : 'Selecciona un documento PDF para comprimir'
                    : convertSubTool === 'img-to-pdf'
                      ? `${imageItems.length} imágenes listas para convertir en PDF`
                      : convertPdfDoc
                        ? `${convertPdfDoc.name} listo para procesar`
                        : 'Selecciona un archivo para continuar'
          }
          actionLabel={
            activeTab === 'merge'
              ? 'Unir PDFs Ahora'
              : activeTab === 'split'
                ? 'Dividir / Extraer PDF'
                : activeTab === 'organize'
                  ? 'Guardar PDF Organizado'
                  : activeTab === 'compress'
                    ? 'Comprimir PDF Ahora'
                    : convertSubTool === 'img-to-pdf'
                      ? 'Crear PDF desde Imágenes'
                      : convertSubTool === 'pdf-to-img'
                        ? 'Exportar Imágenes'
                        : convertSubTool === 'stamp'
                          ? 'Estampar Documento PDF'
                          : 'Aplicar Metadatos y Seguridad'
          }
          busy={busy}
          disabled={
            activeTab === 'merge'
              ? mergeList.length < 2
              : activeTab === 'split'
                ? !splitDoc
                : activeTab === 'organize'
                  ? !organizeBaseDoc || organizedPages.length === 0
                  : activeTab === 'compress'
                    ? !compressDoc
                    : convertSubTool === 'img-to-pdf'
                      ? imageItems.length === 0
                      : !convertPdfDoc
          }
          outputMode={activeOutputMode}
          lastResult={lastResult}
          onChangeOutputMode={(mode) => setActiveOutputMode(mode)}
          onExecute={
            activeTab === 'merge'
              ? handleExecuteMerge
              : activeTab === 'split'
                ? handleExecuteSplit
                : activeTab === 'organize'
                  ? handleExecuteOrganize
                  : activeTab === 'compress'
                    ? handleExecuteCompress
                    : handleExecuteConvertSubTool
          }
          onRevealResult={(p) => void api.revealInFolder(p)}
          onOpenResult={(p) => void api.openFile(p)}
        />
      )}

      <GlobalToast message={toast?.msg ?? null} type={toast?.type ?? 'info'} />
    </div>
  )
}

