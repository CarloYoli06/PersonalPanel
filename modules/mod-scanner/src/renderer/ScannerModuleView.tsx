import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Crop,
  FlipHorizontal,
  FolderOpen,
  Maximize2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  ScanLine,
  Sparkles,
  Trash2,
  Wifi,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { ModuleViewProps } from '@panel/core-sdk'
import { GlobalToast, useI18n } from '@panel/ui-kit'
import type { ScannedPage } from '../shared/types'
import { ImageEditor, type CropRect } from './lib/imageEditor'
import { getScannerApi } from './lib/scannerApi'

export default function ScannerModuleView({ activity }: ModuleViewProps): JSX.Element {
  const { t } = useI18n()
  const api = useMemo(() => getScannerApi(), [])

  // Estado del escáner y páginas
  const [savedDevice, setSavedDevice] = useState<{ id: string; name: string }>({ id: '', name: '' })
  const [pages, setPages] = useState<ScannedPage[]>([])
  const [currentPage, setCurrentPage] = useState<number>(-1)
  const [destFolder, setDestFolder] = useState<string>('')

  // Configuración de escaneo WIA
  const [dpi, setDpi] = useState<number>(300)
  const [colorMode, setColorMode] = useState<number>(2)
  const [scanBrightness, setScanBrightness] = useState<number>(0)
  const [scanContrast, setScanContrast] = useState<number>(0)

  // Filtros post-escaneo
  const [imgBrightness, setImgBrightness] = useState<number>(0)
  const [imgContrast, setImgContrast] = useState<number>(0)
  const [imgSharpness, setImgSharpness] = useState<number>(0)

  // Configuración de exportación
  const [format, setFormat] = useState<'pdf' | 'jpg' | 'png'>('pdf')
  const [pageSize, setPageSize] = useState<'letter' | 'a4'>('letter')
  const [fileName, setFileName] = useState<string>('Albedo')

  // Estado de UI y Editor
  const [scanning, setScanning] = useState<boolean>(false)
  const [scanOverlayMsg, setScanOverlayMsg] = useState<{ title: string; sub: string } | null>(null)
  const [cropMode, setCropMode] = useState<boolean>(false)
  const [autoCropRect, setAutoCropRect] = useState<CropRect | null>(null)
  const [zoomText, setZoomText] = useState<string>('—')
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null)

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<ImageEditor | null>(null)
  const toastTimer = useRef<number>()

  const notify = useCallback(
    (msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      window.clearTimeout(toastTimer.current)
      setToast({ msg, type })
      toastTimer.current = window.setTimeout(() => setToast(null), 3500)
    },
    []
  )

  // Inicializar ImageEditor y liberar recursos al desmontar el módulo
  useEffect(() => {
    if (!mainCanvasRef.current || !cropCanvasRef.current) return
    const ed = new ImageEditor(mainCanvasRef.current, cropCanvasRef.current)
    editorRef.current = ed

    return () => {
      window.clearTimeout(toastTimer.current)
      ed.destroy()
      editorRef.current = null
    }
  }, [])

  // Cargar configuración inicial del escáner y ruta de documentos
  useEffect(() => {
    let mounted = true
    Promise.all([api.getConfig(), api.getDocsPath()])
      .then(([cfg, docs]) => {
        if (!mounted) return
        if (cfg.deviceId) {
          setSavedDevice({ id: cfg.deviceId, name: cfg.deviceName || 'Escáner WIA' })
        }
        setDestFolder(docs)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [api])

  const updateCurrentPageThumb = useCallback(() => {
    const ed = editorRef.current
    if (!ed || currentPage < 0) return
    const edited = ed.exportBase64('image/png')
    if (!edited) return
    setPages((prev) =>
      prev.map((p, idx) => (idx === currentPage ? { ...p, editedBase64: edited } : p))
    )
  }, [currentPage])

  const loadPageIntoEditor = useCallback(async (page: ScannedPage | undefined) => {
    const ed = editorRef.current
    if (!ed || !page) return
    const src = page.editedBase64 || page.base64
    await ed.loadBase64(src)
    ed.fitToWrapper(wrapperRef.current)
    setZoomText(ed.zoomPercent())
    setImgBrightness(0)
    setImgContrast(0)
    setImgSharpness(0)
    setCropMode(false)
    const detected = ed.detectWhiteMargins()
    setAutoCropRect(detected)
  }, [])

  const selectPage = useCallback(
    async (index: number, list: ScannedPage[] = pages) => {
      if (index < 0 || index >= list.length) return
      setCurrentPage(index)
      await loadPageIntoEditor(list[index])
    },
    [pages, loadPageIntoEditor]
  )

  const handleResetScanner = async (): Promise<void> => {
    await api.resetDevice()
    setSavedDevice({ id: '', name: '' })
    notify('Selecciona tu escáner en el próximo escaneo', 'info')
  }

  const doScan = async (forceSelect = false): Promise<void> => {
    const needsDialog = !savedDevice.id || forceSelect
    setScanning(true)
    activity.start(needsDialog ? 'Seleccionando escáner WIA…' : 'Escaneando documento…')

    if (needsDialog) {
      setScanOverlayMsg({
        title: 'Selecciona tu escáner…',
        sub: 'Elige tu escáner en el diálogo nativo de Windows'
      })
      await new Promise((r) => setTimeout(r, 500))
      setScanOverlayMsg(null)
    } else {
      setScanOverlayMsg({
        title: 'Escaneando…',
        sub: 'Por favor no mueva el documento del cristal'
      })
    }

    try {
      const result = await api.scanSmart({
        deviceId: savedDevice.id || '',
        forceSelect,
        dpi,
        colorMode,
        brightness: scanBrightness,
        contrast: scanContrast
      })

      if (result.cancelled) {
        notify('Escaneo cancelado', 'info')
        activity.succeed()
        return
      }
      if (!result.success || !result.base64 || !result.tempPath) {
        throw new Error(result.error || 'Error desconocido al escanear')
      }

      if (result.deviceId && result.deviceId !== savedDevice.id) {
        setSavedDevice({ id: result.deviceId, name: result.deviceName || 'Escáner' })
        notify(`Escáner guardado: ${result.deviceName || 'Escáner'}`, 'success')
      }

      const newPage: ScannedPage = {
        id: crypto.randomUUID(),
        base64: result.base64,
        tempPath: result.tempPath
      }

      const nextPages = [...pages, newPage]
      const nextIndex = nextPages.length - 1
      setPages(nextPages)
      setCurrentPage(nextIndex)
      await loadPageIntoEditor(newPage)
      notify('Escaneo completado', 'success')
      activity.succeed()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify('Error al escanear: ' + msg, 'error')
      activity.fail(msg)
    } finally {
      setScanOverlayMsg(null)
      setScanning(false)
    }
  }

  const deletePage = async (index: number): Promise<void> => {
    const next = pages.filter((_, i) => i !== index)
    setPages(next)
    if (next.length === 0) {
      setCurrentPage(-1)
      setAutoCropRect(null)
      setZoomText('—')
    } else {
      const nextIdx = Math.min(index, next.length - 1)
      setCurrentPage(nextIdx)
      await loadPageIntoEditor(next[nextIdx])
    }
  }

  const clearAllPages = (): void => {
    setPages([])
    setCurrentPage(-1)
    setAutoCropRect(null)
    setZoomText('—')
  }

  // Herramientas de edición
  const hasActivePage = currentPage >= 0 && currentPage < pages.length

  const toggleCropMode = (): void => {
    const ed = editorRef.current
    if (!ed || !hasActivePage) return
    if (cropMode) {
      ed.exitCropMode()
      setCropMode(false)
    } else {
      ed.enterCropMode()
      setCropMode(true)
      setAutoCropRect(null)
      notify('Dibuja el área de recorte con el ratón sobre el documento', 'info')
    }
  }

  const applyManualCrop = (): void => {
    const ed = editorRef.current
    if (!ed) return
    ed.applyCrop()
    setCropMode(false)
    setZoomText(ed.zoomPercent())
    updateCurrentPageThumb()
  }

  const cancelManualCrop = (): void => {
    editorRef.current?.cancelCrop()
    setCropMode(false)
  }

  const triggerAutoCrop = (rect?: CropRect | null): void => {
    const ed = editorRef.current
    if (!ed) return
    const target = rect ?? ed.detectWhiteMargins()
    if (!target) {
      notify('No se detectó margen blanco significativo', 'info')
      return
    }
    ed.applyAutoCrop(target)
    setAutoCropRect(null)
    setZoomText(ed.zoomPercent())
    updateCurrentPageThumb()
    notify('Auto-recorte aplicado', 'success')
  }

  const handleFilterChange = (b: number, c: number, s: number): void => {
    setImgBrightness(b)
    setImgContrast(c)
    setImgSharpness(s)
    editorRef.current?.setFilters({ brightness: b, contrast: c, sharpness: s })
  }

  const handleResetEdits = async (): Promise<void> => {
    const ed = editorRef.current
    if (!ed || !hasActivePage) return
    ed.resetCrop()
    setImgBrightness(0)
    setImgContrast(0)
    setImgSharpness(0)
    setZoomText(ed.zoomPercent())
    updateCurrentPageThumb()
    setAutoCropRect(ed.detectWhiteMargins())
    notify('Ajustes de la página restablecidos', 'info')
  }

  const handleDiscardAllEdits = async (): Promise<void> => {
    const cleaned = pages.map(({ id, base64, tempPath }) => ({ id, base64, tempPath }))
    setPages(cleaned)
    if (currentPage >= 0 && cleaned[currentPage]) {
      await loadPageIntoEditor(cleaned[currentPage])
    }
    notify('Ediciones descartadas — imágenes originales restauradas', 'info')
  }

  const pickDestFolder = async (): Promise<void> => {
    const res = await api.showOpenFolder()
    if (!res.canceled && res.filePaths.length > 0) {
      setDestFolder(res.filePaths[0])
    }
  }

  const exportPages = async (): Promise<void> => {
    if (pages.length === 0) return
    const folder = destFolder || (await api.getDocsPath())
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const baseName = fileName.trim() || 'Albedo'

    activity.start('Exportando documento…')
    try {
      if (format === 'pdf') {
        const docsPath = await api.getDocsPath()
        const tempPaths: string[] = []
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i]
          if (p.editedBase64) {
            const tmp = `${docsPath}\\export_p${i + 1}_${Date.now()}.png`
            const saved = await api.saveImage({ base64: p.editedBase64, destPath: tmp })
            tempPaths.push(saved.success && saved.path ? saved.path : p.tempPath)
          } else {
            tempPaths.push(p.tempPath)
          }
        }
        const destPath = `${folder}\\${baseName}_${ts}.pdf`
        const res = await api.savePDF({ imagePaths: tempPaths, destPath, pageSize })
        if (!res.success) throw new Error(res.error)
        notify(`PDF guardado: ${baseName}_${ts}.pdf`, 'success')
        activity.succeed(`${baseName}_${ts}.pdf`)
      } else {
        for (let i = 0; i < pages.length; i++) {
          const base64 = pages[i].editedBase64 || pages[i].base64
          const destPath = `${folder}\\${baseName}_${ts}_p${i + 1}.${format}`
          const res = await api.saveImage({ base64, destPath })
          if (!res.success) throw new Error(res.error)
        }
        notify(`${pages.length} imagen(es) guardada(s)`, 'success')
        activity.succeed()
      }
      setDestFolder(folder)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify('Error al exportar: ' + msg, 'error')
      activity.fail(msg)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 gap-3 overflow-hidden">
      {/* Sidebar Izquierdo: Escáner y Páginas */}
      <aside className="panel flex w-[235px] shrink-0 flex-col overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] p-3.5">
          <p className="section-label">{t.scanner.deviceSection}</p>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
            <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
              {savedDevice.name || '—'}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {savedDevice.id ? t.scanner.remembered : t.scanner.clickToChoose}
            </p>
            <button
              type="button"
              onClick={() => void handleResetScanner()}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw className="h-3 w-3" /> {t.scanner.changeScanner}
            </button>
          </div>

          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span
              className={`h-2 w-2 rounded-full ${
                savedDevice.id
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
                  : 'bg-amber-400'
              }`}
            />
            <span>{savedDevice.id ? t.scanner.readyToScan : t.scanner.autoSelection}</span>
          </div>
        </div>

        {/* Lista de páginas */}
        <div className="flex min-h-0 flex-1 flex-col p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="section-label !mb-0">{t.scanner.pages}</p>
            <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              {pages.length}
            </span>
          </div>

          {pages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center text-xs text-[var(--text-muted)]">
              {t.scanner.noPages}
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {pages.map((p, idx) => {
                const active = idx === currentPage
                return (
                  <div
                    key={p.id}
                    onClick={() => void selectPage(idx)}
                    className={`group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl border-2 transition ${
                      active
                        ? 'border-cyan-400 shadow-lg shadow-cyan-500/10'
                        : 'border-transparent bg-[var(--bg-card)] hover:border-cyan-400/50'
                    }`}
                  >
                    <img
                      src={p.editedBase64 || p.base64}
                      alt={`#${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void deletePage(idx)
                      }}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/90 text-white opacity-0 transition group-hover:opacity-100"
                      title={t.scanner.discardEdits}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Botones de acción de escaneo */}
        <div className="space-y-2 border-t border-[var(--border-subtle)] p-3">
          <button
            type="button"
            disabled={pages.length === 0}
            onClick={clearAllPages}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t.scanner.clearAll}
          </button>

          <button
            type="button"
            disabled={scanning}
            onClick={() => void doScan(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
          >
            <ScanLine className={`h-4 w-4 ${scanning ? 'animate-pulse' : ''}`} />
            {scanning ? t.scanner.scanning : t.scanner.scan}
          </button>

          <button
            type="button"
            disabled={scanning}
            onClick={() => void doScan(true)}
            title={t.scanner.nativeWifi}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs font-medium text-cyan-600 dark:text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-40"
          >
            <Wifi className="h-3.5 w-3.5" /> {t.scanner.nativeWifi}
          </button>
        </div>
      </aside>

      {/* Área Central: Toolbar + Lienzo Canvas */}
      <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra de herramientas del editor */}
        <div className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--border-subtle)] px-3">
          <button
            type="button"
            disabled={!hasActivePage}
            onClick={toggleCropMode}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-35 ${
              cropMode
                ? ' bg-cyan-500/20 text-cyan-500 dark:text-cyan-300 ring-1 ring-cyan-500/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Crop className="h-3.5 w-3.5" /> {t.scanner.crop}
          </button>

          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => triggerAutoCrop()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-35"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> {t.scanner.autoCrop}
          </button>

          {cropMode && (
            <>
              <button
                type="button"
                onClick={applyManualCrop}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-500 dark:text-emerald-300 ring-1 ring-emerald-500/30"
              >
                <Check className="h-3.5 w-3.5" /> {t.scanner.apply}
              </button>
              <button
                type="button"
                onClick={cancelManualCrop}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-xs font-medium text-rose-400"
              >
                <X className="h-3.5 w-3.5" /> {t.scanner.cancel}
              </button>
            </>
          )}

          <div className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />

          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => {
              editorRef.current?.rotateLeft()
              setZoomText(editorRef.current?.zoomPercent() ?? '—')
              updateCurrentPageThumb()
            }}
            className="icon-btn"
            title={t.scanner.rotateLeft}
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => {
              editorRef.current?.rotateRight()
              setZoomText(editorRef.current?.zoomPercent() ?? '—')
              updateCurrentPageThumb()
            }}
            className="icon-btn"
            title={t.scanner.rotateRight}
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => {
              editorRef.current?.flipHorizontal()
              updateCurrentPageThumb()
            }}
            className="icon-btn"
            title={t.scanner.flipHoriz}
          >
            <FlipHorizontal className="h-4 w-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />

          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => {
              editorRef.current?.zoomOut()
              setZoomText(editorRef.current?.zoomPercent() ?? '—')
            }}
            className="icon-btn"
            title={t.scanner.zoomOut}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[44px] text-center font-mono text-xs text-[var(--text-muted)]">
            {zoomText}
          </span>
          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => {
              editorRef.current?.zoomIn()
              setZoomText(editorRef.current?.zoomPercent() ?? '—')
            }}
            className="icon-btn"
            title={t.scanner.zoomIn}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!hasActivePage}
            onClick={() => {
              editorRef.current?.fitToWrapper(wrapperRef.current)
              setZoomText(editorRef.current?.zoomPercent() ?? '—')
            }}
            className="icon-btn"
            title={t.scanner.fitToWindow}
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!hasActivePage}
              onClick={() => void handleResetEdits()}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-35"
            >
              ↩ {t.scanner.reset}
            </button>
          </div>
        </div>

        {/* Banner sugerencia Auto-crop */}
        {autoCropRect && (
          <div className="flex shrink-0 items-center justify-between border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-500 dark:text-amber-300">
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {t.scanner.autoCropPrompt}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => triggerAutoCrop(autoCropRect)}
                className="rounded-md bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-500/30"
              >
                {t.scanner.apply}
              </button>
              <button
                type="button"
                onClick={() => setAutoCropRect(null)}
                className="rounded-md px-1.5 py-1 hover:bg-amber-500/20"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Lienzo Canvas */}
        <div
          ref={wrapperRef}
          onWheel={(e) => {
            if (!editorRef.current?.sourceImage) return
            e.preventDefault()
            if (e.deltaY < 0) editorRef.current.zoomIn()
            else editorRef.current.zoomOut()
            setZoomText(editorRef.current.zoomPercent())
          }}
          className="relative flex flex-1 items-center justify-center overflow-auto p-6"
          style={{
            backgroundImage:
              'repeating-conic-gradient(rgba(148,163,184,0.05) 0% 25%, transparent 0% 50%)',
            backgroundSize: '20px 20px'
          }}
        >
          {!hasActivePage && (
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-cyan-400 ring-1 ring-cyan-500/30">
                <ScanLine className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {t.scanner.scannerTitle}
              </h3>
              <p className="max-w-xs text-xs leading-relaxed text-[var(--text-muted)]">
                {t.scanner.scannerHeroDesc}
              </p>
            </div>
          )}

          <div
            className="relative inline-block shadow-2xl"
            style={{ display: hasActivePage ? 'inline-block' : 'none' }}
          >
            <canvas ref={mainCanvasRef} className="block" />
            <canvas
              ref={cropCanvasRef}
              className={`absolute left-0 top-0 ${
                cropMode ? ' pointer-events-auto cursor-crosshair' : 'pointer-events-none'
              }`}
            />
          </div>
        </div>
      </main>

      {/* Sidebar Derecho: Configuración y Exportar */}
      <aside className="panel flex w-[255px] shrink-0 flex-col gap-4 overflow-y-auto p-4">
        {/* Ajustes de captura */}
        <div className="space-y-2.5 border-b border-[var(--border-subtle)] pb-4">
          <p className="section-label !mb-1">{t.scanner.scanParams}</p>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.scanner.dpi}
            </label>
            <select
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-cyan-400"
            >
              <option value={75}>{t.scanner.res75}</option>
              <option value={150}>{t.scanner.res150}</option>
              <option value={300}>{t.scanner.res300}</option>
              <option value={600}>{t.scanner.res600}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.scanner.colorMode}
            </label>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-cyan-400"
            >
              <option value={2}>{t.scanner.color24}</option>
              <option value={1}>{t.scanner.gray8}</option>
              <option value={0}>{t.scanner.bw1}</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
              <span>{t.scanner.scanBrightness}</span>
              <span className="font-mono text-cyan-400">{scanBrightness}</span>
            </div>
            <input
              type="range"
              min={-1000}
              max={1000}
              step={50}
              value={scanBrightness}
              onChange={(e) => setScanBrightness(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
              <span>{t.scanner.scanContrast}</span>
              <span className="font-mono text-cyan-400">{scanContrast}</span>
            </div>
            <input
              type="range"
              min={-1000}
              max={1000}
              step={50}
              value={scanContrast}
              onChange={(e) => setScanContrast(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>

        {/* Ajustes visuales post-escaneo */}
        <div className="space-y-2.5 border-b border-[var(--border-subtle)] pb-4">
          <p className="section-label !mb-1">{t.scanner.visualAdjust}</p>

          <div>
            <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
              <span>{t.scanner.imgBrightness}</span>
              <span className="font-mono text-cyan-400">{imgBrightness}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              disabled={!hasActivePage}
              value={imgBrightness}
              onChange={(e) =>
                handleFilterChange(Number(e.target.value), imgContrast, imgSharpness)
              }
              onMouseUp={updateCurrentPageThumb}
              className="w-full accent-cyan-400"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
              <span>{t.scanner.imgContrast}</span>
              <span className="font-mono text-cyan-400">{imgContrast}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              disabled={!hasActivePage}
              value={imgContrast}
              onChange={(e) =>
                handleFilterChange(imgBrightness, Number(e.target.value), imgSharpness)
              }
              onMouseUp={updateCurrentPageThumb}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>

        {/* Exportar */}
        <div className="space-y-2.5">
          <p className="section-label !mb-1">{t.scanner.export}</p>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.scanner.outputFormat}
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'pdf' | 'jpg' | 'png')}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-cyan-400"
            >
              <option value="pdf">{t.scanner.formatPdfMulti}</option>
              <option value="jpg">{t.scanner.formatJpgPage}</option>
              <option value="png">{t.scanner.formatPngPage}</option>
            </select>
          </div>

          {format === 'pdf' && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                {t.scanner.pageSize}
              </label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as 'letter' | 'a4')}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-cyan-400"
              >
                <option value="letter">{t.scanner.pageSizeLetter}</option>
                <option value="a4">{t.scanner.pageSizeA4}</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.scanner.baseFileName}
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={t.scanner.baseFileNamePlaceholder}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.scanner.destFolder}
            </label>
            <button
              type="button"
              onClick={() => void pickDestFolder()}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <span className="truncate" title={destFolder}>
                {destFolder || t.scanner.defaultDocumentsFolder}
              </span>
            </button>
          </div>

          <button
            type="button"
            disabled={pages.length === 0}
            onClick={() => void exportPages()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/20 px-4 py-2.5 text-xs font-semibold text-emerald-500 dark:text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/30 disabled:pointer-events-none disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {t.scanner.saveDoc}
          </button>

          <button
            type="button"
            disabled={!destFolder}
            onClick={() => void api.openPath(destFolder)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <FolderOpen className="h-3.5 w-3.5" /> {t.scanner.openFolder}
          </button>

          <button
            type="button"
            disabled={pages.length === 0}
            onClick={() => void handleDiscardAllEdits()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-40"
          >
            ↩ {t.scanner.discardEdits}
          </button>
        </div>
      </aside>

      {/* Overlay de progreso de escaneo */}
      {scanOverlayMsg && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/75 backdrop-blur-md">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
          <p className="text-sm font-semibold text-white">{scanOverlayMsg.title}</p>
          <p className="text-xs text-zinc-400">{scanOverlayMsg.sub}</p>
        </div>
      )}

      <GlobalToast message={toast?.msg ?? null} type={toast?.type ?? 'info'} />
    </div>
  )
}

