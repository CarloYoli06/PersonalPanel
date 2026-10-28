declare module 'pdfkit' {
  import { Writable } from 'node:stream'

  export default class PDFDocument {
    constructor(options?: { autoFirstPage?: boolean; margin?: number })
    pipe<T extends Writable>(destination: T): T
    addPage(options?: { size?: [number, number]; margin?: number }): this
    image(
      src: string | Buffer,
      x: number,
      y: number,
      options?: {
        fit?: [number, number]
        align?: 'center' | 'left' | 'right'
        valign?: 'center' | 'top' | 'bottom'
      }
    ): this
    end(): void
  }
}

