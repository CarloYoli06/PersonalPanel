export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ImageFilters {
  brightness: number
  contrast: number
  sharpness: number
}

/**
 * Motor Canvas de edición de imágenes escaneadas (migrado y tipado desde Escaner Albedo).
 * Incluye soporte de limpieza (`destroy`) para liberar memoria RAM inmediatamente al salir del módulo.
 */
export class ImageEditor {
  private canvas: HTMLCanvasElement
  private cropCanvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cropCtx: CanvasRenderingContext2D

  public sourceImage: HTMLImageElement | null = null
  public zoom = 1.0
  public rotation = 0
  public flipH = false
  public cropRect: CropRect | null = null
  public filters: ImageFilters = { brightness: 0, contrast: 0, sharpness: 0 }

  public cropMode = false
  private cropDragging = false
  private cropStart: { x: number; y: number } | null = null
  private cropEnd: { x: number; y: number } | null = null

  private onMouseDownBound: (e: MouseEvent) => void
  private onMouseMoveBound: (e: MouseEvent) => void
  private onMouseUpBound: () => void

  constructor(canvas: HTMLCanvasElement, cropCanvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.cropCanvas = cropCanvas
    const ctx = this.canvas.getContext('2d')
    const cropCtx = this.cropCanvas.getContext('2d')
    if (!ctx || !cropCtx) throw new Error('No se pudo inicializar contexto 2D del Canvas.')
    this.ctx = ctx
    this.cropCtx = cropCtx

    this.onMouseDownBound = (e: MouseEvent) => {
      if (!this.cropMode) return
      this.cropDragging = true
      this.cropStart = this.canvasPos(e)
      this.cropEnd = { ...this.cropStart }
    }

    this.onMouseMoveBound = (e: MouseEvent) => {
      if (!this.cropMode || !this.cropDragging) return
      this.cropEnd = this.canvasPos(e)
      this.drawCropOverlay()
    }

    this.onMouseUpBound = () => {
      if (!this.cropMode) return
      this.cropDragging = false
    }

    this.cropCanvas.addEventListener('mousedown', this.onMouseDownBound)
    this.cropCanvas.addEventListener('mousemove', this.onMouseMoveBound)
    this.cropCanvas.addEventListener('mouseup', this.onMouseUpBound)
  }

  destroy(): void {
    this.cropCanvas.removeEventListener('mousedown', this.onMouseDownBound)
    this.cropCanvas.removeEventListener('mousemove', this.onMouseMoveBound)
    this.cropCanvas.removeEventListener('mouseup', this.onMouseUpBound)
    this.sourceImage = null
    this.canvas.width = 1
    this.canvas.height = 1
    this.cropCanvas.width = 1
    this.cropCanvas.height = 1
  }

  loadBase64(base64: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        this.sourceImage = img
        this.rotation = 0
        this.flipH = false
        this.cropRect = null
        this.zoom = 1.0
        this.render()
        resolve()
      }
      img.src = base64
    })
  }

  render(): void {
    if (!this.sourceImage) return
    const src = this.sourceImage

    const rx = this.cropRect ? this.cropRect.x : 0
    const ry = this.cropRect ? this.cropRect.y : 0
    const rw = this.cropRect ? this.cropRect.w : src.width
    const rh = this.cropRect ? this.cropRect.h : src.height

    const swapped = this.rotation === 90 || this.rotation === 270
    const dispW = Math.max(1, Math.round((swapped ? rh : rw) * this.zoom))
    const dispH = Math.max(1, Math.round((swapped ? rw : rh) * this.zoom))

    this.canvas.width = dispW
    this.canvas.height = dispH
    this.cropCanvas.width = dispW
    this.cropCanvas.height = dispH

    const ctx = this.ctx
    ctx.save()
    ctx.filter = this.buildFilter()
    ctx.translate(dispW / 2, dispH / 2)
    ctx.rotate((this.rotation * Math.PI) / 180)
    if (this.flipH) ctx.scale(-1, 1)

    const dw = rw * this.zoom
    const dh = rh * this.zoom
    ctx.drawImage(src, rx, ry, rw, rh, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()

    this.cropCtx.clearRect(0, 0, dispW, dispH)
  }

  private buildFilter(): string {
    const bPct = 100 + this.filters.brightness
    const cPct = 100 + this.filters.contrast
    return `brightness(${bPct}%) contrast(${cPct}%)`
  }

  zoomIn(): void {
    this.zoom = Math.min(4, +(this.zoom + 0.2).toFixed(1))
    this.render()
  }

  zoomOut(): void {
    this.zoom = Math.max(0.1, +(this.zoom - 0.2).toFixed(1))
    this.render()
  }

  zoomPercent(): string {
    return `${Math.round(this.zoom * 100)}%`
  }

  fitToWrapper(wrapper: HTMLElement | null): void {
    if (!this.sourceImage || !wrapper) return
    const src = this.sourceImage
    const swapped = this.rotation === 90 || this.rotation === 270
    const srcW = this.cropRect ? this.cropRect.w : src.width
    const srcH = this.cropRect ? this.cropRect.h : src.height
    const effW = swapped ? srcH : srcW
    const effH = swapped ? srcW : srcH
    const pad = 40
    const zw = Math.max(0.1, (wrapper.clientWidth - pad) / effW)
    const zh = Math.max(0.1, (wrapper.clientHeight - pad) / effH)
    this.zoom = +Math.min(zw, zh, 2).toFixed(2)
    this.render()
  }

  rotateLeft(): void {
    this.rotation = (this.rotation + 270) % 360
    this.render()
  }

  rotateRight(): void {
    this.rotation = (this.rotation + 90) % 360
    this.render()
  }

  flipHorizontal(): void {
    this.flipH = !this.flipH
    this.render()
  }

  setFilters(f: Partial<ImageFilters>): void {
    Object.assign(this.filters, f)
    this.render()
  }

  enterCropMode(): void {
    this.cropMode = true
    this.cropDragging = false
    this.cropStart = null
    this.cropEnd = null
    this.cropCtx.clearRect(0, 0, this.cropCanvas.width, this.cropCanvas.height)
  }

  exitCropMode(): void {
    this.cropMode = false
    this.cropCtx.clearRect(0, 0, this.cropCanvas.width, this.cropCanvas.height)
  }

  applyCrop(): void {
    if (!this.cropStart || !this.cropEnd || !this.sourceImage) return
    const sel = this.getSelectionInSourceCoords()
    if (!sel || sel.w < 4 || sel.h < 4) return

    const prev = this.cropRect || {
      x: 0,
      y: 0,
      w: this.sourceImage.width,
      h: this.sourceImage.height
    }
    this.cropRect = {
      x: prev.x + sel.x,
      y: prev.y + sel.y,
      w: sel.w,
      h: sel.h
    }
    this.exitCropMode()
    this.render()
  }

  cancelCrop(): void {
    this.exitCropMode()
  }

  resetCrop(): void {
    this.cropRect = null
    this.rotation = 0
    this.flipH = false
    this.filters = { brightness: 0, contrast: 0, sharpness: 0 }
    this.zoom = 1.0
    this.render()
  }

  detectWhiteMargins(minCutFraction = 0.02): CropRect | null {
    if (!this.sourceImage) return null

    const src = this.sourceImage
    const rx = this.cropRect?.x ?? 0
    const ry = this.cropRect?.y ?? 0
    const rw = this.cropRect?.w ?? src.width
    const rh = this.cropRect?.h ?? src.height

    const MAX_DIM = 1200
    const scale = Math.min(1, MAX_DIM / Math.max(rw, rh))
    const sw = Math.max(1, Math.round(rw * scale))
    const sh = Math.max(1, Math.round(rh * scale))

    const offscreen = document.createElement('canvas')
    offscreen.width = sw
    offscreen.height = sh
    const octx = offscreen.getContext('2d')
    if (!octx) return null
    octx.drawImage(src, rx, ry, rw, rh, 0, 0, sw, sh)

    let data: Uint8ClampedArray
    try {
      data = octx.getImageData(0, 0, sw, sh).data
    } catch {
      return null
    }

    const rowEdges = new Int32Array(sh)
    const colEdges = new Int32Array(sw)
    const edgeThreshold = 45

    const marginX = Math.max(2, Math.floor(sw * 0.02))
    const marginY = Math.max(2, Math.floor(sh * 0.02))

    for (let y = marginY; y < sh - marginY; y++) {
      for (let x = marginX; x < sw - marginX; x++) {
        const i = (y * sw + x) * 4
        const leftIdx = (y * sw + (x - 1)) * 4
        const upIdx = ((y - 1) * sw + x) * 4

        const diffX =
          Math.abs(data[i] - data[leftIdx]) +
          Math.abs(data[i + 1] - data[leftIdx + 1]) +
          Math.abs(data[i + 2] - data[leftIdx + 2])
        const diffY =
          Math.abs(data[i] - data[upIdx]) +
          Math.abs(data[i + 1] - data[upIdx + 1]) +
          Math.abs(data[i + 2] - data[upIdx + 2])

        if (diffX > edgeThreshold || diffY > edgeThreshold) {
          rowEdges[y]++
          colEdges[x]++
        }
      }
    }

    const minEdgesX = Math.max(3, Math.floor(sh * 0.005))
    const minEdgesY = Math.max(3, Math.floor(sw * 0.005))

    let top = marginY
    let bottom = sh - marginY - 1
    let left = marginX
    let right = sw - marginX - 1

    while (top < bottom && rowEdges[top] < minEdgesY) top++
    while (bottom > top && rowEdges[bottom] < minEdgesY) bottom--
    while (left < right && colEdges[left] < minEdgesX) left++
    while (right > left && colEdges[right] < minEdgesX) right--

    if (top >= bottom || left >= right) return null

    const pad = Math.max(10, Math.round(15 * scale))
    const cx = Math.max(0, left - pad)
    const cy = Math.max(0, top - pad)
    const cw = Math.min(sw - cx, right - left + pad * 2 + 1)
    const ch = Math.min(sh - cy, bottom - top + pad * 2 + 1)

    const cutFraction = 1 - (cw * ch) / (sw * sh)
    if (cutFraction < minCutFraction) return null

    const srcX = Math.round(cx / scale)
    const srcY = Math.round(cy / scale)
    const srcW = Math.min(rw - srcX, Math.round(cw / scale))
    const srcH = Math.min(rh - srcY, Math.round(ch / scale))

    const baseX = this.cropRect?.x ?? 0
    const baseY = this.cropRect?.y ?? 0
    return { x: baseX + srcX, y: baseY + srcY, w: srcW, h: srcH }
  }

  applyAutoCrop(rect: CropRect | null): void {
    if (!rect) return
    this.cropRect = rect
    this.exitCropMode()
    this.render()
  }

  exportBase64(format = 'image/png', quality = 0.92): string {
    if (!this.sourceImage) return ''

    const src = this.sourceImage
    const rx = this.cropRect ? this.cropRect.x : 0
    const ry = this.cropRect ? this.cropRect.y : 0
    const rw = this.cropRect ? this.cropRect.w : src.width
    const rh = this.cropRect ? this.cropRect.h : src.height

    const swapped = this.rotation === 90 || this.rotation === 270
    const fullW = swapped ? rh : rw
    const fullH = swapped ? rw : rh

    const offscreen = document.createElement('canvas')
    offscreen.width = fullW
    offscreen.height = fullH
    const ctx = offscreen.getContext('2d')
    if (!ctx) return ''

    ctx.save()
    ctx.filter = this.buildFilter()
    ctx.translate(fullW / 2, fullH / 2)
    ctx.rotate((this.rotation * Math.PI) / 180)
    if (this.flipH) ctx.scale(-1, 1)

    ctx.drawImage(src, rx, ry, rw, rh, -rw / 2, -rh / 2, rw, rh)
    ctx.restore()

    return offscreen.toDataURL(format, quality)
  }

  private canvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = this.cropCanvas.getBoundingClientRect()
    const scaleX = this.cropCanvas.width / rect.width
    const scaleY = this.cropCanvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  private drawCropOverlay(): void {
    const ctx = this.cropCtx
    const w = this.cropCanvas.width
    const h = this.cropCanvas.height
    ctx.clearRect(0, 0, w, h)

    if (!this.cropStart || !this.cropEnd) return

    const x = Math.min(this.cropStart.x, this.cropEnd.x)
    const y = Math.min(this.cropStart.y, this.cropEnd.y)
    const sw = Math.abs(this.cropEnd.x - this.cropStart.x)
    const sh = Math.abs(this.cropEnd.y - this.cropStart.y)

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, w, h)
    ctx.clearRect(x, y, sw, sh)

    ctx.strokeStyle = '#00b4d8'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, sw, sh)

    ctx.strokeStyle = 'rgba(0,180,216,0.3)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(x + (sw * i) / 3, y)
      ctx.lineTo(x + (sw * i) / 3, y + sh)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, y + (sh * i) / 3)
      ctx.lineTo(x + sw, y + (sh * i) / 3)
      ctx.stroke()
    }

    const hs = 8
    ctx.fillStyle = '#00b4d8'
    const corners = [
      [x, y],
      [x + sw, y],
      [x, y + sh],
      [x + sw, y + sh]
    ]
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
    }
  }

  private getSelectionInSourceCoords(): CropRect | null {
    if (!this.cropStart || !this.cropEnd) return null
    const cw = this.cropCanvas.width
    const ch = this.cropCanvas.height

    const sw = this.cropRect ? this.cropRect.w : (this.sourceImage?.width ?? cw)
    const sh = this.cropRect ? this.cropRect.h : (this.sourceImage?.height ?? ch)

    const scaleX = sw / cw
    const scaleY = sh / ch

    const x = Math.round(Math.min(this.cropStart.x, this.cropEnd.x) * scaleX)
    const y = Math.round(Math.min(this.cropStart.y, this.cropEnd.y) * scaleY)
    const w = Math.round(Math.abs(this.cropEnd.x - this.cropStart.x) * scaleX)
    const h = Math.round(Math.abs(this.cropEnd.y - this.cropStart.y) * scaleY)

    return { x, y, w, h }
  }
}

