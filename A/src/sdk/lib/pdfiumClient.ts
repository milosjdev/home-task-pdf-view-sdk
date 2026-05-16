import type {
  GetTextPayload,
  GetThumbnailPayload,
  OpenPayload,
  OpenResult,
  RenderPagePayload,
  RenderPageResult,
  Rotation,
  TextRun,
  WorkerRequest,
  WorkerRequestIn,
  WorkerResponse,
} from './pdfiumTypes'

export interface OpenCallbacks {
  onByteProgress?: (progress: number, loaded: number, total: number | null) => void
  onDocumentReady?: (pageCount: number) => void
}

let clientInstance: PdfiumClient | null = null

export function getPdfiumClient(): PdfiumClient {
  if (!clientInstance) {
    clientInstance = new PdfiumClient()
  }
  return clientInstance
}

export function isWasmSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
}

export class PdfiumClient {
  private worker: Worker
  private nextId = 0
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason: Error) => void
      onProgress?: (progress: number) => void
      openCallbacks?: OpenCallbacks
    }
  >()
  private initPromise: Promise<void> | null = null

  constructor() {
    this.worker = new Worker(new URL('../workers/pdfium.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(event.data)
    }
    this.worker.onerror = () => {
      this.rejectAll(new Error('PDFium worker crashed'))
    }
  }

  private handleWorkerMessage(message: WorkerResponse): void {
    if (message.type === 'INIT_PROGRESS') {
      const pending = this.pending.get(message.requestId)
      pending?.onProgress?.(message.progress)
      return
    }

    const pending = this.pending.get(message.requestId)
    if (!pending) {
      return
    }

    if (message.type === 'BYTE_PROGRESS') {
      pending.openCallbacks?.onByteProgress?.(message.progress, message.loaded, message.total)
      return
    }

    if (message.type === 'DOCUMENT_READY') {
      pending.openCallbacks?.onDocumentReady?.(message.pageCount)
      return
    }

    this.pending.delete(message.requestId)

    if (message.type === 'ERROR') {
      pending.reject(new Error(message.message))
      return
    }

    pending.resolve(message.payload)
  }

  private send<T>(
    request: WorkerRequestIn,
    options?: { onProgress?: (progress: number) => void; openCallbacks?: OpenCallbacks },
  ): Promise<T> {
    const requestId = `req-${++this.nextId}`
    const fullRequest: WorkerRequest = { ...request, requestId }

    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress: options?.onProgress,
        openCallbacks: options?.openCallbacks,
      })
      this.worker.postMessage(fullRequest)
    })
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  init(onProgress?: (progress: number) => void): Promise<void> {
    if (!isWasmSupported()) {
      return Promise.reject(
        new Error(
          'WebAssembly is not available. Enable WASM in your browser settings to use the PDF viewer.',
        ),
      )
    }

    if (!this.initPromise) {
      this.initPromise = this.send<{ ready: boolean }>({ type: 'INIT' }, { onProgress }).then(
        () => undefined,
      )
    }

    return this.initPromise
  }

  open(url: string, callbacks?: OpenCallbacks): Promise<OpenResult> {
    return this.send<OpenPayload>({ type: 'OPEN', url }, { openCallbacks: callbacks }).then(
      (payload) => ({
        pageCount: payload.pageCount,
        pdfBytes: payload.bytes,
      }),
    )
  }

  openBytes(bytes: Uint8Array): Promise<OpenResult> {
    return this.send<OpenPayload>({ type: 'OPEN_BYTES', bytes }, undefined).then((payload) => ({
      pageCount: payload.pageCount,
      pdfBytes: payload.bytes,
    }))
  }

  renderPage(pageIndex: number, scale: number, rotation: Rotation = 0): Promise<RenderPageResult> {
    return this.send<RenderPagePayload>({
      type: 'RENDER_PAGE',
      pageIndex,
      scale,
      rotation,
    }).then((payload) => ({
      imageData: payload.imageData,
      width: payload.width,
      height: payload.height,
    }))
  }

  getText(pageIndex: number): Promise<TextRun[]> {
    return this.send<GetTextPayload>({ type: 'GET_TEXT', pageIndex }).then(
      (payload) => payload.runs,
    )
  }

  getThumbnail(pageIndex: number, scale?: number, rotation: Rotation = 0): Promise<ImageBitmap> {
    return this.send<GetThumbnailPayload>({
      type: 'GET_THUMBNAIL',
      pageIndex,
      scale,
      rotation,
    }).then((payload) => payload.bitmap)
  }

  terminate(): void {
    this.worker.terminate()
    this.rejectAll(new Error('PDFium worker terminated'))
    clientInstance = null
  }
}
