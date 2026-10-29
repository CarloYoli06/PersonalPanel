/// <reference types="vite/client" />
declare module '*.mjs?url' {
  const src: string
  export default src
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  const worker: unknown
  export default worker
}


