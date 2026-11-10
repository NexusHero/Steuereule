declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  const worker: Record<string, unknown>
  export default worker
}

declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export function getDocument(params: {
    readonly data: Uint8Array
    readonly disableAutoFetch?: boolean
    readonly isEvalSupported?: boolean
  }): { readonly promise: Promise<unknown> }
}
