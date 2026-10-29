import { BrowserWindow, dialog, ipcMain, nativeImage, shell, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import {
  IsolatedProcessTracker,
  type BackendModuleController,
  type DependencyStatus
} from '@panel/core-sdk'
import {
  PDF_IPC,
  type CompressPdfRequest,
  type ImageInputItem,
  type ImagesToPdfRequest,
  type MergePdfRequest,
  type MetadataSecurityRequest,
  type OrganizePdfRequest,
  type OutputSaveMode,
  type PdfDocumentInfo,
  type PdfOperationOutput,
  type SaveExportedImagesRequest,
  type SplitPdfRequest,
  type StampPdfRequest
} from '../shared/types'

function getUniqueFilePath(dir: string, baseName: string, suffix: string, ext = '.pdf'): string {
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`
  let candidate = path.join(dir, `${baseName}${suffix}${cleanExt}`)
  let counter = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}${suffix} (${counter})${cleanExt}`)
    counter++
  }
  return candidate
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255
    const g = parseInt(clean.slice(2, 4), 16) / 255
    const b = parseInt(clean.slice(4, 6), 16) / 255
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return { r, g, b }
    }
  }
  return { r: 0.85, g: 0.15, b: 0.25 }
}

function parsePageRanges(rangesText: string, maxPages: number): number[][] {
  const groups: number[][] = []
  const parts = rangesText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim())
      const start = Math.max(1, parseInt(startStr, 10))
      const end = Math.min(maxPages, parseInt(endStr, 10))
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        const group: number[] = []
        for (let p = start; p <= end; p++) {
          group.push(p - 1) // 0-based
        }
        if (group.length > 0) groups.push(group)
      }
    } else {
      const pageNum = parseInt(part, 10)
      if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        groups.push([pageNum - 1])
      }
    }
  }
  return groups
}

export function createPdfBackendController(
  onActivityChange?: () => void
): BackendModuleController {
  const processTracker = new IsolatedProcessTracker()
  let registered = false
  let currentTask = ''

  const setTask = (label: string): void => {
    currentTask = label
    onActivityChange?.()
  }

  async function resolveOutputFilePath(
    sourcePath: string,
    outputMode: OutputSaveMode,
    customOutputDir: string | undefined,
    suffix: string
  ): Promise<string | null> {
    const parsed = path.parse(sourcePath)
    const effectiveSuffix = suffix || '_pdfstudio'

    if (outputMode === 'ask-always') {
      const win = BrowserWindow.getFocusedWindow()
      const defaultPath = getUniqueFilePath(parsed.dir, parsed.name, effectiveSuffix, '.pdf')
      const res = win
        ? await dialog.showSaveDialog(win, {
            title: 'Guardar archivo PDF resultante',
            defaultPath,
            filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
          })
        : await dialog.showSaveDialog({
            title: 'Guardar archivo PDF resultante',
            defaultPath,
            filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
          })
      if (res.canceled || !res.filePath) return null
      return res.filePath
    }

    if (outputMode === 'custom-folder' && customOutputDir && fs.existsSync(customOutputDir)) {
      return getUniqueFilePath(customOutputDir, parsed.name, effectiveSuffix, '.pdf')
    }

    return getUniqueFilePath(parsed.dir, parsed.name, effectiveSuffix, '.pdf')
  }

  async function resolveOutputFolder(
    sourcePath: string,
    outputMode: OutputSaveMode,
    customOutputDir: string | undefined,
    subFolderSuffix: string
  ): Promise<string | null> {
    const parsed = path.parse(sourcePath)

    if (outputMode === 'ask-always') {
      const win = BrowserWindow.getFocusedWindow()
      const res = win
        ? await dialog.showOpenDialog(win, {
            title: 'Seleccionar carpeta de destino',
            defaultPath: parsed.dir,
            properties: ['openDirectory', 'createDirectory']
          })
        : await dialog.showOpenDialog({
            title: 'Seleccionar carpeta de destino',
            defaultPath: parsed.dir,
            properties: ['openDirectory', 'createDirectory']
          })
      if (res.canceled || res.filePaths.length === 0) return null
      return res.filePaths[0]
    }

    const baseDir =
      outputMode === 'custom-folder' && customOutputDir && fs.existsSync(customOutputDir)
        ? customOutputDir
        : parsed.dir

    const targetDir = path.join(baseDir, `${parsed.name}${subFolderSuffix}`)
    if (!fs.existsSync(targetDir)) {
      await fsp.mkdir(targetDir, { recursive: true })
    }
    return targetDir
  }

  async function checkQpdfAvailable(): Promise<boolean> {
    const res = await processTracker.execFileAsync('qpdf', ['--version'], {
      windowsHide: true,
      timeoutMs: 4000
    })
    return res.ok
  }

  return {
    id: 'mod-pdf',

    registerIpc() {
      if (registered) return
      registered = true

      ipcMain.handle(PDF_IPC.selectPdfFiles, async (_e, multiple = true): Promise<string[]> => {
        const win = BrowserWindow.getFocusedWindow()
        const properties: Array<'openFile' | 'multiSelections'> = multiple
          ? ['openFile', 'multiSelections']
          : ['openFile']
        const res = win
          ? await dialog.showOpenDialog(win, {
              title: 'Seleccionar archivos PDF',
              filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
              properties
            })
          : await dialog.showOpenDialog({
              title: 'Seleccionar archivos PDF',
              filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
              properties
            })
        return res.canceled ? [] : res.filePaths
      })

      ipcMain.handle(PDF_IPC.selectImageFiles, async (): Promise<string[]> => {
        const win = BrowserWindow.getFocusedWindow()
        const res = win
          ? await dialog.showOpenDialog(win, {
              title: 'Seleccionar imágenes para convertir a PDF',
              filters: [
                { name: 'Imágenes soportadas', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
              ],
              properties: ['openFile', 'multiSelections']
            })
          : await dialog.showOpenDialog({
              title: 'Seleccionar imágenes para convertir a PDF',
              filters: [
                { name: 'Imágenes soportadas', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
              ],
              properties: ['openFile', 'multiSelections']
            })
        return res.canceled ? [] : res.filePaths
      })

      ipcMain.handle(
        PDF_IPC.selectOutputFolder,
        async (_e, defaultPath?: string): Promise<string | null> => {
          const win = BrowserWindow.getFocusedWindow()
          const fallback = defaultPath || app.getPath('documents')
          const res = win
            ? await dialog.showOpenDialog(win, {
                title: 'Seleccionar carpeta de salida por defecto',
                defaultPath: fallback,
                properties: ['openDirectory', 'createDirectory']
              })
            : await dialog.showOpenDialog({
                title: 'Seleccionar carpeta de salida por defecto',
                defaultPath: fallback,
                properties: ['openDirectory', 'createDirectory']
              })
          return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
        }
      )

      ipcMain.handle(
        PDF_IPC.inspectPdfs,
        async (_e, filePaths: string[]): Promise<PdfDocumentInfo[]> => {
          const results: PdfDocumentInfo[] = []
          for (const filePath of filePaths) {
            try {
              const stat = await fsp.stat(filePath)
              const bytes = await fsp.readFile(filePath)
              const doc = await PDFDocument.load(bytes, {
                ignoreEncryption: true,
                updateMetadata: false
              })
              results.push({
                path: filePath,
                name: path.basename(filePath),
                sizeBytes: stat.size,
                pageCount: doc.getPageCount(),
                title: doc.getTitle() ?? '',
                author: doc.getAuthor() ?? '',
                subject: doc.getSubject() ?? '',
                keywords: doc.getKeywords() ?? '',
                creator: doc.getCreator() ?? '',
                encrypted: doc.isEncrypted
              })
            } catch (err) {
              let sizeBytes = 0
              try {
                sizeBytes = (await fsp.stat(filePath)).size
              } catch {
                /* ignore */
              }
              results.push({
                path: filePath,
                name: path.basename(filePath),
                sizeBytes,
                pageCount: 0,
                error: err instanceof Error ? err.message : 'No se pudo leer el archivo PDF'
              })
            }
          }
          return results
        }
      )

      ipcMain.handle(
        PDF_IPC.inspectImages,
        async (_e, filePaths: string[]): Promise<ImageInputItem[]> => {
          const results: ImageInputItem[] = []
          for (const filePath of filePaths) {
            try {
              const stat = await fsp.stat(filePath)
              const img = nativeImage.createFromPath(filePath)
              const size = img.getSize()
              results.push({
                path: filePath,
                name: path.basename(filePath),
                sizeBytes: stat.size,
                width: size.width || 1200,
                height: size.height || 1600
              })
            } catch {
              /* ignore invalid image */
            }
          }
          return results
        }
      )

      ipcMain.handle(
        PDF_IPC.readPdfBytes,
        async (_e, filePath: string): Promise<Uint8Array | null> => {
          try {
            const buf = await fsp.readFile(filePath)
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
          } catch {
            return null
          }
        }
      )

      ipcMain.handle(
        PDF_IPC.readImageDataUrl,
        async (_e, filePath: string, maxPreviewPx = 320): Promise<string | null> => {
          try {
            const img = nativeImage.createFromPath(filePath)
            if (img.isEmpty()) return null
            const { width, height } = img.getSize()
            if (width > maxPreviewPx || height > maxPreviewPx) {
              const resized =
                width >= height
                  ? img.resize({ width: maxPreviewPx, quality: 'good' })
                  : img.resize({ height: maxPreviewPx, quality: 'good' })
              return `data:image/jpeg;base64,${resized.toJPEG(78).toString('base64')}`
            }
            return `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}`
          } catch {
            return null
          }
        }
      )

      // 1. UNIR PDF (MERGE)
      ipcMain.handle(
        PDF_IPC.mergePdfs,
        async (_e, req: MergePdfRequest): Promise<PdfOperationOutput> => {
          if (!req.filePaths || req.filePaths.length < 2) {
            return {
              success: false,
              message: 'Selecciona al menos 2 archivos PDF para unir.'
            }
          }

          setTask(`Uniendo ${req.filePaths.length} documentos PDF...`)
          try {
            const outputPath = await resolveOutputFilePath(
              req.filePaths[0],
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_unido'
            )
            if (!outputPath) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const mergedPdf = await PDFDocument.create()
            let totalOriginalBytes = 0

            for (const filePath of req.filePaths) {
              const stat = await fsp.stat(filePath)
              totalOriginalBytes += stat.size
              const bytes = await fsp.readFile(filePath)
              const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
              const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices())
              for (const page of copiedPages) {
                mergedPdf.addPage(page)
              }
            }

            const outBytes = await mergedPdf.save({ useObjectStreams: true })
            await fsp.writeFile(outputPath, outBytes)

            if (req.revealOnFinish) {
              shell.showItemInFolder(outputPath)
            }

            return {
              success: true,
              message: `Se unieron ${req.filePaths.length} PDFs (${mergedPdf.getPageCount()} páginas en total).`,
              outputPath,
              originalBytes: totalOriginalBytes,
              outputBytes: outBytes.byteLength
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al unir los documentos PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 2. DIVIDIR Y EXTRAER (SPLIT & EXTRACT)
      ipcMain.handle(
        PDF_IPC.splitPdf,
        async (_e, req: SplitPdfRequest): Promise<PdfOperationOutput> => {
          setTask('Dividiendo documento PDF...')
          try {
            const bytes = await fsp.readFile(req.filePath)
            const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
            const totalPages = srcDoc.getPageCount()
            const parsed = path.parse(req.filePath)

            // Caso A: Un solo archivo resultante (Selected pages o Rangos fusionados)
            if (
              req.mode === 'selected-pages' ||
              (req.mode === 'ranges' && req.mergeRangesIntoOne)
            ) {
              let indices: number[] = []
              if (req.mode === 'selected-pages') {
                indices = (req.selectedPages ?? [])
                  .map((p) => p - 1)
                  .filter((idx) => idx >= 0 && idx < totalPages)
              } else {
                const groups = parsePageRanges(req.rangesText ?? '', totalPages)
                indices = groups.flat()
              }

              if (indices.length === 0) {
                return {
                  success: false,
                  message: 'No se seleccionaron páginas o rangos válidos para extraer.'
                }
              }

              const outputPath = await resolveOutputFilePath(
                req.filePath,
                req.outputMode,
                req.customOutputDir,
                req.suffix || '_extraido'
              )
              if (!outputPath) {
                return { success: false, canceled: true, message: 'Operación cancelada.' }
              }

              const outDoc = await PDFDocument.create()
              const copied = await outDoc.copyPages(srcDoc, indices)
              for (const p of copied) outDoc.addPage(p)

              const outBytes = await outDoc.save({ useObjectStreams: true })
              await fsp.writeFile(outputPath, outBytes)

              if (req.revealOnFinish) {
                shell.showItemInFolder(outputPath)
              }

              return {
                success: true,
                message: `Se extrajeron ${indices.length} páginas en un nuevo documento PDF.`,
                outputPath,
                outputBytes: outBytes.byteLength
              }
            }

            // Caso B: Múltiples archivos (Rangos independientes o Separar todo)
            const groups: number[][] =
              req.mode === 'explode-all'
                ? Array.from({ length: totalPages }, (_, i) => [i])
                : parsePageRanges(req.rangesText ?? '', totalPages)

            if (groups.length === 0) {
              return {
                success: false,
                message: 'Introduce al menos un rango válido (ej. 1-3, 5, 8-10).'
              }
            }

            const outFolder = await resolveOutputFolder(
              req.filePath,
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_dividido'
            )
            if (!outFolder) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const outputPaths: string[] = []
            for (let i = 0; i < groups.length; i++) {
              const group = groups[i]
              const subDoc = await PDFDocument.create()
              const copied = await subDoc.copyPages(srcDoc, group)
              for (const p of copied) subDoc.addPage(p)

              const label =
                group.length === 1
                  ? `_pag_${String(group[0] + 1).padStart(3, '0')}`
                  : `_rango_${group[0] + 1}-${group[group.length - 1] + 1}`

              const targetFile = getUniqueFilePath(outFolder, parsed.name, label, '.pdf')
              const subBytes = await subDoc.save({ useObjectStreams: true })
              await fsp.writeFile(targetFile, subBytes)
              outputPaths.push(targetFile)
            }

            if (req.revealOnFinish && outputPaths.length > 0) {
              shell.showItemInFolder(outputPaths[0])
            }

            return {
              success: true,
              message: `Se generaron ${outputPaths.length} archivos PDF en la carpeta de destino.`,
              outputPath: outputPaths[0],
              outputPaths,
              outputDir: outFolder
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al dividir el documento PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 3. ORGANIZAR, ROTAR, ELIMINAR E INSERTAR PÁGINAS
      ipcMain.handle(
        PDF_IPC.organizePdf,
        async (_e, req: OrganizePdfRequest): Promise<PdfOperationOutput> => {
          if (!req.pages || req.pages.length === 0) {
            return {
              success: false,
              message: 'El documento debe conservar al menos una página.'
            }
          }

          setTask('Reconstruyendo y organizando páginas del PDF...')
          try {
            const outputPath = await resolveOutputFilePath(
              req.baseFilePath,
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_organizado'
            )
            if (!outputPath) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const outDoc = await PDFDocument.create()
            const sourceCache = new Map<string, PDFDocument>()

            for (const spec of req.pages) {
              let srcDoc = sourceCache.get(spec.sourceFilePath)
              if (!srcDoc) {
                const bytes = await fsp.readFile(spec.sourceFilePath)
                srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
                sourceCache.set(spec.sourceFilePath, srcDoc)
              }

              const [copiedPage] = await outDoc.copyPages(srcDoc, [spec.sourcePageIndex])
              if (spec.rotation !== 0) {
                const currentAngle = copiedPage.getRotation().angle
                copiedPage.setRotation(degrees((currentAngle + spec.rotation) % 360))
              }
              outDoc.addPage(copiedPage)
            }

            const outBytes = await outDoc.save({ useObjectStreams: true })
            await fsp.writeFile(outputPath, outBytes)

            if (req.revealOnFinish) {
              shell.showItemInFolder(outputPath)
            }

            return {
              success: true,
              message: `Documento organizado guardado (${outDoc.getPageCount()} páginas).`,
              outputPath,
              outputBytes: outBytes.byteLength
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al organizar el documento PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 4. COMPRIMIR Y OPTIMIZAR (COMPRESS)
      ipcMain.handle(
        PDF_IPC.compressPdf,
        async (_e, req: CompressPdfRequest): Promise<PdfOperationOutput> => {
          setTask('Optimizando y comprimiendo flujos del PDF...')
          try {
            const stat = await fsp.stat(req.filePath)
            const originalBytes = stat.size

            const outputPath = await resolveOutputFilePath(
              req.filePath,
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_comprimido'
            )
            if (!outputPath) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const rawBytes = await fsp.readFile(req.filePath)
            const srcDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true })

            // Construir versión optimizada estructuralmente (limpieza de objetos huérfanos y ObjectStreams)
            const cleanDoc = await PDFDocument.create()
            const copiedPages = await cleanDoc.copyPages(srcDoc, srcDoc.getPageIndices())
            for (const p of copiedPages) cleanDoc.addPage(p)
            cleanDoc.setTitle('')
            cleanDoc.setAuthor('')
            cleanDoc.setSubject('')
            cleanDoc.setKeywords([])
            cleanDoc.setProducer('PersonalPanel PDF Studio')
            cleanDoc.setCreator('')

            const structuralBytes = await cleanDoc.save({
              useObjectStreams: true,
              addDefaultPage: false,
              objectsPerTick: 100
            })

            let finalBytes = structuralBytes

            // Si es compresión Media o Extrema y se enviaron páginas rasterizadas a menor DPI/JPEG
            if (
              (req.level === 'medium' || req.level === 'extreme') &&
              req.rasterizedPages &&
              req.rasterizedPages.length > 0
            ) {
              const rasterDoc = await PDFDocument.create()
              rasterDoc.setProducer('PersonalPanel PDF Studio')

              for (const pageData of req.rasterizedPages) {
                const cleanBase64 = pageData.jpegBase64.replace(/^data:image\/\w+;base64,/, '')
                const imgBuf = Buffer.from(cleanBase64, 'base64')
                const embeddedJpg = await rasterDoc.embedJpg(imgBuf)
                const page = rasterDoc.addPage([pageData.widthPt, pageData.heightPt])
                page.drawImage(embeddedJpg, {
                  x: 0,
                  y: 0,
                  width: pageData.widthPt,
                  height: pageData.heightPt
                })
              }

              const rasterBytes = await rasterDoc.save({ useObjectStreams: true })
              // Elegir siempre el resultado de menor peso para garantizar ahorro real
              if (rasterBytes.byteLength < finalBytes.byteLength) {
                finalBytes = rasterBytes
              }
            }

            // Si ni siquiera la reconstrucción redujo respecto al original, escribir la versión más ligera
            const outputBytes = finalBytes.byteLength
            await fsp.writeFile(outputPath, finalBytes)

            const savedBytes = Math.max(0, originalBytes - outputBytes)
            const savedPercent =
              originalBytes > 0 ? Math.max(0, Math.round((savedBytes / originalBytes) * 100)) : 0

            if (req.revealOnFinish) {
              shell.showItemInFolder(outputPath)
            }

            return {
              success: true,
              message:
                savedPercent > 0
                  ? `PDF optimizado con éxito: ahorraste un ${savedPercent}% de espacio.`
                  : 'PDF optimizado (el archivo original ya se encontraba altamente comprimido).',
              outputPath,
              originalBytes,
              outputBytes,
              savedPercent
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al comprimir el documento PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 5A. IMÁGENES A PDF (CON SOPORTE DE IMÁGENES PESADAS)
      ipcMain.handle(
        PDF_IPC.imagesToPdf,
        async (_e, req: ImagesToPdfRequest): Promise<PdfOperationOutput> => {
          if (!req.imagePaths || req.imagePaths.length === 0) {
            return { success: false, message: 'Añade al menos una imagen para generar el PDF.' }
          }

          setTask(`Convirtiendo ${req.imagePaths.length} imágenes a PDF...`)
          try {
            const outputPath = await resolveOutputFilePath(
              req.imagePaths[0],
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_imagenes'
            )
            if (!outputPath) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const pdfDoc = await PDFDocument.create()
            let totalOriginalBytes = 0

            for (const imgPath of req.imagePaths) {
              const stat = await fsp.stat(imgPath)
              totalOriginalBytes += stat.size
              const ext = path.extname(imgPath).toLowerCase()

              let embeddedImg
              let imgWidth = 1000
              let imgHeight = 1400

              const needsNativeReencode =
                req.optimizeHeavyImages ||
                ext === '.webp' ||
                ext === '.bmp' ||
                stat.size > 4 * 1024 * 1024

              if (needsNativeReencode) {
                let nImg = nativeImage.createFromPath(imgPath)
                const sz = nImg.getSize()
                const maxDim = req.maxDimensionPx || 2200
                if (sz.width > maxDim || sz.height > maxDim) {
                  nImg =
                    sz.width >= sz.height
                      ? nImg.resize({ width: maxDim, quality: 'better' })
                      : nImg.resize({ height: maxDim, quality: 'better' })
                }
                const jpgBuf = nImg.toJPEG(req.jpegQuality || 82)
                embeddedImg = await pdfDoc.embedJpg(jpgBuf)
                const finalSize = nImg.getSize()
                imgWidth = finalSize.width || embeddedImg.width
                imgHeight = finalSize.height || embeddedImg.height
              } else {
                const rawBuf = await fsp.readFile(imgPath)
                if (ext === '.png') {
                  embeddedImg = await pdfDoc.embedPng(rawBuf)
                } else {
                  embeddedImg = await pdfDoc.embedJpg(rawBuf)
                }
                imgWidth = embeddedImg.width
                imgHeight = embeddedImg.height
              }

              const margin = Math.max(0, req.marginPt ?? 0)
              let pageW = imgWidth + margin * 2
              let pageH = imgHeight + margin * 2

              if (req.pageSize === 'a4' || req.pageSize === 'letter') {
                const baseW = req.pageSize === 'a4' ? 595.28 : 612
                const baseH = req.pageSize === 'a4' ? 841.89 : 792
                const isLandscape =
                  req.orientation === 'landscape' ||
                  (req.orientation === 'auto' && imgWidth > imgHeight)
                pageW = isLandscape ? baseH : baseW
                pageH = isLandscape ? baseW : baseH
              }

              const page = pdfDoc.addPage([pageW, pageH])
              const availW = Math.max(20, pageW - margin * 2)
              const availH = Math.max(20, pageH - margin * 2)
              const scale = Math.min(availW / imgWidth, availH / imgHeight)
              const drawW = imgWidth * scale
              const drawH = imgHeight * scale
              const drawX = (pageW - drawW) / 2
              const drawY = (pageH - drawH) / 2

              page.drawImage(embeddedImg, {
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH
              })
            }

            const outBytes = await pdfDoc.save({ useObjectStreams: true })
            await fsp.writeFile(outputPath, outBytes)

            if (req.revealOnFinish) {
              shell.showItemInFolder(outputPath)
            }

            return {
              success: true,
              message: `Documento PDF creado con ${req.imagePaths.length} imágenes.`,
              outputPath,
              originalBytes: totalOriginalBytes,
              outputBytes: outBytes.byteLength
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al convertir las imágenes en PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 5B. GUARDAR PÁGINAS DE PDF EXPORTADAS A IMÁGENES
      ipcMain.handle(
        PDF_IPC.saveExportedImages,
        async (_e, req: SaveExportedImagesRequest): Promise<PdfOperationOutput> => {
          if (!req.images || req.images.length === 0) {
            return { success: false, message: 'No hay páginas renderizadas para exportar.' }
          }

          setTask(`Exportando ${req.images.length} páginas como imágenes...`)
          try {
            const parsed = path.parse(req.sourcePdfPath)
            const outFolder = await resolveOutputFolder(
              req.sourcePdfPath,
              req.outputMode,
              req.customOutputDir,
              '_imagenes'
            )
            if (!outFolder) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const outputPaths: string[] = []
            for (const item of req.images) {
              const cleanBase64 = item.dataUrl.replace(/^data:image\/\w+;base64,/, '')
              const buf = Buffer.from(cleanBase64, 'base64')
              const pageLabel = `_pag_${String(item.pageNumber).padStart(3, '0')}`
              const targetPath = getUniqueFilePath(outFolder, parsed.name, pageLabel, item.ext)
              await fsp.writeFile(targetPath, buf)
              outputPaths.push(targetPath)
            }

            if (req.revealOnFinish && outputPaths.length > 0) {
              shell.showItemInFolder(outputPaths[0])
            }

            return {
              success: true,
              message: `Se exportaron ${outputPaths.length} imágenes correctamente.`,
              outputPath: outputPaths[0],
              outputPaths,
              outputDir: outFolder
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al guardar las imágenes exportadas.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 5C. NUMERAR PÁGINAS Y ESTAMPAR MARCA DE AGUA
      ipcMain.handle(
        PDF_IPC.stampPdf,
        async (_e, req: StampPdfRequest): Promise<PdfOperationOutput> => {
          if (!req.enablePageNumbers && (!req.enableWatermark || !req.watermarkText.trim())) {
            return {
              success: false,
              message: 'Activa la numeración de páginas o escribe un texto de marca de agua.'
            }
          }

          setTask('Estampando numeración y marca de agua...')
          try {
            const outputPath = await resolveOutputFilePath(
              req.filePath,
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_sellado'
            )
            if (!outputPath) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const bytes = await fsp.readFile(req.filePath)
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
            const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

            const pages = pdfDoc.getPages()
            const total = pages.length
            const wmColor = parseHexColor(req.watermarkColorHex)

            for (let i = 0; i < total; i++) {
              const page = pages[i]
              const { width, height } = page.getSize()

              // Marca de agua
              if (req.enableWatermark && req.watermarkText.trim()) {
                const text = req.watermarkText.trim()
                const fontSize = Math.max(12, Math.min(120, req.watermarkFontSize || 42))
                const textWidth = fontBold.widthOfTextAtSize(text, fontSize)
                const opacity = Math.max(0.05, Math.min(1, req.watermarkOpacity || 0.22))

                if (req.watermarkPosition === 'diagonal') {
                  page.drawText(text, {
                    x: width / 2 - (textWidth * Math.cos(Math.PI / 4)) / 2,
                    y: height / 2 - (textWidth * Math.sin(Math.PI / 4)) / 2,
                    size: fontSize,
                    font: fontBold,
                    color: rgb(wmColor.r, wmColor.g, wmColor.b),
                    opacity,
                    rotate: degrees(45)
                  })
                } else {
                  const x = Math.max(20, (width - textWidth) / 2)
                  const y =
                    req.watermarkPosition === 'header'
                      ? height - fontSize - 28
                      : req.watermarkPosition === 'footer'
                        ? 28
                        : height / 2
                  page.drawText(text, {
                    x,
                    y,
                    size: fontSize,
                    font: fontBold,
                    color: rgb(wmColor.r, wmColor.g, wmColor.b),
                    opacity
                  })
                }
              }

              // Numeración de páginas
              if (req.enablePageNumbers) {
                const num = (req.startPageNumber || 1) + i
                const totalLabel = (req.startPageNumber || 1) + total - 1
                const label =
                  req.pageNumberFormat === 'simple'
                    ? `${num}`
                    : `Página ${num} de ${totalLabel}`
                const numFontSize = 10
                const labelWidth = fontRegular.widthOfTextAtSize(label, numFontSize)

                const marginX = 32
                const marginY = 24
                let x = width - labelWidth - marginX
                let y = marginY

                if (
                  req.pageNumberPosition === 'bottom-center' ||
                  req.pageNumberPosition === 'top-center'
                ) {
                  x = (width - labelWidth) / 2
                } else if (req.pageNumberPosition === 'bottom-left') {
                  x = marginX
                }

                if (
                  req.pageNumberPosition === 'top-right' ||
                  req.pageNumberPosition === 'top-center'
                ) {
                  y = height - marginY - numFontSize
                }

                page.drawText(label, {
                  x,
                  y,
                  size: numFontSize,
                  font: fontRegular,
                  color: rgb(0.32, 0.32, 0.36),
                  opacity: 0.9
                })
              }
            }

            const outBytes = await pdfDoc.save({ useObjectStreams: true })
            await fsp.writeFile(outputPath, outBytes)

            if (req.revealOnFinish) {
              shell.showItemInFolder(outputPath)
            }

            return {
              success: true,
              message: `Sellado aplicado a las ${total} páginas del documento.`,
              outputPath,
              outputBytes: outBytes.byteLength
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al estampar el documento PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      // 5D. METADATOS Y SEGURIDAD (CON INTEGRACIÓN OPCIONAL QPDF)
      ipcMain.handle(
        PDF_IPC.updateMetadataAndSecurity,
        async (_e, req: MetadataSecurityRequest): Promise<PdfOperationOutput> => {
          setTask('Actualizando metadatos y seguridad del PDF...')
          try {
            const outputPath = await resolveOutputFilePath(
              req.filePath,
              req.outputMode,
              req.customOutputDir,
              req.suffix || '_meta'
            )
            if (!outputPath) {
              return { success: false, canceled: true, message: 'Operación cancelada.' }
            }

            const bytes = await fsp.readFile(req.filePath)
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })

            if (req.stripAllMetadata) {
              pdfDoc.setTitle('')
              pdfDoc.setAuthor('')
              pdfDoc.setSubject('')
              pdfDoc.setKeywords([])
              pdfDoc.setProducer('')
              pdfDoc.setCreator('')
            } else {
              pdfDoc.setTitle(req.title.trim())
              pdfDoc.setAuthor(req.author.trim())
              pdfDoc.setSubject(req.subject.trim())
              pdfDoc.setKeywords(
                req.keywords
                  .split(',')
                  .map((k) => k.trim())
                  .filter(Boolean)
              )
            }

            const outBytes = await pdfDoc.save({ useObjectStreams: true })
            await fsp.writeFile(outputPath, outBytes)

            // Si solicitó encriptar/desencriptar con contraseña, verificar qpdf vía process-runner
            if (req.securityAction !== 'none' && req.password) {
              const hasQpdf = await checkQpdfAvailable()
              if (hasQpdf) {
                const tempInput = `${outputPath}.tmp.pdf`
                await fsp.rename(outputPath, tempInput)
                const qpdfArgs =
                  req.securityAction === 'encrypt'
                    ? [
                        '--encrypt',
                        req.password,
                        req.password,
                        '256',
                        '--',
                        tempInput,
                        outputPath
                      ]
                    : [`--password=${req.password}`, '--decrypt', tempInput, outputPath]

                const qRes = await processTracker.execFileAsync('qpdf', qpdfArgs, {
                  windowsHide: true,
                  timeoutMs: 20000
                })
                await fsp.rm(tempInput, { force: true })

                if (!qRes.ok) {
                  return {
                    success: false,
                    message: 'qpdf reportó un error al procesar el cifrado del PDF.',
                    error: qRes.stderr
                  }
                }
              } else {
                if (req.revealOnFinish) {
                  shell.showItemInFolder(outputPath)
                }
                return {
                  success: true,
                  message:
                    'Metadatos actualizados y flujos reconstruidos (Nota: Para cifrado AES por contraseña se requiere tener qpdf en el PATH del sistema).',
                  outputPath,
                  outputBytes: outBytes.byteLength,
                  engineUsed: 'pdf-lib'
                }
              }
            }

            if (req.revealOnFinish) {
              shell.showItemInFolder(outputPath)
            }

            return {
              success: true,
              message: req.stripAllMetadata
                ? 'Todos los metadatos y rastros de autor fueron eliminados del PDF.'
                : 'Metadatos del documento PDF actualizados correctamente.',
              outputPath,
              outputBytes: outBytes.byteLength
            }
          } catch (err) {
            return {
              success: false,
              message: 'Error al actualizar metadatos del PDF.',
              error: err instanceof Error ? err.message : String(err)
            }
          } finally {
            setTask('')
          }
        }
      )

      ipcMain.handle(PDF_IPC.revealInFolder, async (_e, targetPath: string): Promise<void> => {
        if (targetPath && fs.existsSync(targetPath)) {
          shell.showItemInFolder(targetPath)
        }
      })

      ipcMain.handle(PDF_IPC.openFile, async (_e, targetPath: string): Promise<void> => {
        if (targetPath && fs.existsSync(targetPath)) {
          await shell.openPath(targetPath)
        }
      })
    },

    async unregisterIpc() {
      if (!registered) return
      registered = false
      processTracker.killAll()
      Object.values(PDF_IPC).forEach((channel) => ipcMain.removeHandler(channel))
    },

    async killActiveProcesses() {
      processTracker.killAll()
      setTask('')
    },

    async checkDependencies(): Promise<DependencyStatus[]> {
      const qpdfReady = await checkQpdfAvailable()
      return [
        {
          name: 'pdf-lib & Electron nativeImage Engine',
          description: 'Motor estructural nativo de fusión, división, rotación, estampado y conversión de PDFs',
          ready: true
        },
        {
          name: 'pdfjs-dist Canvas Rasterizer',
          description: 'Renderizador bajo demanda de miniaturas reales y compresión por re-muestreo DPI',
          ready: true
        },
        {
          name: 'qpdf CLI (Cifrado AES-256 opcional)',
          description: 'Binario opcional en PATH para encriptación con contraseña AES-256',
          ready: qpdfReady,
          optional: true
        }
      ]
    },

    isRunning() {
      return currentTask.length > 0 || processTracker.activeCount > 0
    },

    getStatusText() {
      return currentTask || 'Listo (0 MB en reposo)'
    }
  }
}

