import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import type { RasterizedPagePayload, ThumbnailQuality } from '../../shared/types'
import { getPdfApi } from './pdfApi'

// Polyfill ECMAScript 2025 Uint8Array.prototype.toHex requerido por pdfjs-dist v6
if (typeof (Uint8Array.prototype as unknown as { toHex?: () => string }).toHex !== 'function') {
  ;(Uint8Array.prototype as unknown as { toHex: () => string }).toHex = function () {
    return Array.from(this as unknown as Uint8Array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}

// Polyfill Promise.try si el runtime de Chromium o Electron no lo expone en el contexto
if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
  ;(Promise as unknown as { try: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T> }).try = function (fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)))
  }
}

// Configurar el worker embebido en memoria (sin peticiones de red ni bloqueo de CSP)
;(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker


const docPromiseCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy | null>>()
const thumbDataUrlCache = new Map<string, string>()

const QUALITY_SCALE: Record<ThumbnailQuality, number> = {
  low: 0.35,
  medium: 0.55,
  high: 0.85
}

export async function getLoadedPdfDocument(
  filePath: string
): Promise<pdfjsLib.PDFDocumentProxy | null> {
  const existing = docPromiseCache.get(filePath)
  if (existing) return existing

  const loadPromise = (async () => {
    try {
      const api = getPdfApi()
      const rawBytes = await api.readPdfBytes(filePath)
      if (!rawBytes) {
        docPromiseCache.delete(filePath)
        return null
      }

      // Normalizar bytes devueltos por Electron IPC (Uint8Array / ArrayBuffer / Buffer serializado)
      const raw: unknown = rawBytes
      let copy: Uint8Array
      if (raw instanceof Uint8Array) {
        copy = new Uint8Array(raw.byteLength)
        copy.set(raw)
      } else if (ArrayBuffer.isView(raw)) {
        const view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
        copy = new Uint8Array(view.byteLength)
        copy.set(view)
      } else if (raw instanceof ArrayBuffer) {
        copy = new Uint8Array(raw.slice(0))
      } else {
        copy = new Uint8Array(Object.values(raw as Record<string, number>))
      }

      if (copy.byteLength === 0) {
        docPromiseCache.delete(filePath)
        return null
      }

      const loadingTask = pdfjsLib.getDocument({
        data: copy,
        useSystemFonts: true,
        isOffscreenCanvasSupported: false
      })
      return await loadingTask.promise
    } catch (err) {
      console.warn('[pdfThumbnailRenderer] Error cargando PDF en pdfjs-dist:', err)
      docPromiseCache.delete(filePath)
      return null
    }
  })()

  docPromiseCache.set(filePath, loadPromise)
  return loadPromise
}

export async function renderPageThumbnail(
  filePath: string,
  pageNumber: number,
  quality: ThumbnailQuality = 'medium'
): Promise<string | null> {
  const cacheKey = `${filePath}::${pageNumber}::${quality}`
  const cached = thumbDataUrlCache.get(cacheKey)
  if (cached) return cached

  const pdfDoc = await getLoadedPdfDocument(filePath)
  if (!pdfDoc) return null
  if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return null

  try {
    const page = await pdfDoc.getPage(pageNumber)
    const scale = QUALITY_SCALE[quality] ?? 0.55
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvasContext: ctx,
      canvas,
      viewport
    }).promise

    const jpegQuality = quality === 'low' ? 0.65 : quality === 'high' ? 0.88 : 0.76
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality)

    // Liberar memoria del canvas temporal
    canvas.width = 0
    canvas.height = 0

    if (thumbDataUrlCache.size > 250) {
      const firstKey = thumbDataUrlCache.keys().next().value
      if (firstKey) thumbDataUrlCache.delete(firstKey)
    }
    thumbDataUrlCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch (err) {
    console.warn(`[pdfThumbnailRenderer] Falló miniatura pág ${pageNumber}:`, err)
    return null
  }
}

export async function rasterizePdfPagesForCompression(
  filePath: string,
  level: 'medium' | 'extreme',
  onProgress?: (current: number, total: number) => void
): Promise<RasterizedPagePayload[]> {
  const pdfDoc = await getLoadedPdfDocument(filePath)
  if (!pdfDoc) return []

  const total = pdfDoc.numPages
  const targetScale = level === 'medium' ? 150 / 72 : 100 / 72
  const jpegQuality = level === 'medium' ? 0.74 : 0.50
  const results: RasterizedPagePayload[] = []

  for (let p = 1; p <= total; p++) {
    onProgress?.(p, total)
    const page = await pdfDoc.getPage(p)
    const baseViewport = page.getViewport({ scale: 1 })
    const renderViewport = page.getViewport({ scale: targetScale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(renderViewport.width))
    canvas.height = Math.max(1, Math.floor(renderViewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvasContext: ctx,
      canvas,
      viewport: renderViewport
    }).promise

    const jpegBase64 = canvas.toDataURL('image/jpeg', jpegQuality)
    canvas.width = 0
    canvas.height = 0

    results.push({
      jpegBase64,
      widthPt: baseViewport.width,
      heightPt: baseViewport.height
    })
  }

  return results
}

export async function exportPdfPagesToImages(
  filePath: string,
  pageNumbers: number[],
  ext: 'jpg' | 'png',
  scale: 1 | 2,
  onProgress?: (current: number, total: number) => void
): Promise<Array<{ pageNumber: number; dataUrl: string; ext: 'jpg' | 'png' }>> {
  const pdfDoc = await getLoadedPdfDocument(filePath)
  if (!pdfDoc) return []

  const validPages = pageNumbers.filter((n) => n >= 1 && n <= pdfDoc.numPages)
  const results: Array<{ pageNumber: number; dataUrl: string; ext: 'jpg' | 'png' }> = []
  const renderScale = scale === 2 ? 2.5 : 1.5

  for (let i = 0; i < validPages.length; i++) {
    const pageNum = validPages[i]
    onProgress?.(i + 1, validPages.length)
    const page = await pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: renderScale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvasContext: ctx,
      canvas,
      viewport
    }).promise

    const dataUrl =
      ext === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)

    canvas.width = 0
    canvas.height = 0

    results.push({ pageNumber: pageNum, dataUrl, ext })
  }

  return results
}

export function clearPdfThumbnailCache(): void {
  thumbDataUrlCache.clear()
  for (const p of docPromiseCache.values()) {
    void p.then((doc) => {
      void doc?.cleanup()
    })
  }
  docPromiseCache.clear()
}
