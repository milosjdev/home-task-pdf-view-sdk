/// <reference lib="webworker" />
import type {
  GetTextPayload,
  GetThumbnailPayload,
  OpenPayload,
  RenderPagePayload,
  WorkerRequest,
  WorkerResponse,
} from '../lib/pdfiumTypes'
import {
  extractTextRuns,
  initPdfium,
  isWasmSupported,
  openDocument,
  openDocumentFromBytes,
  renderPage,
  renderThumbnail,
} from './pdfiumEngine'

function postSuccess(requestId: string, payload: unknown, transfer: Transferable[] = []): void {
  const message: WorkerResponse = { type: 'SUCCESS', requestId, payload }
  self.postMessage(message, transfer)
}

function postError(requestId: string, message: string): void {
  const response: WorkerResponse = { type: 'ERROR', requestId, message }
  self.postMessage(response)
}

function postInitProgress(requestId: string, progress: number): void {
  const response: WorkerResponse = { type: 'INIT_PROGRESS', requestId, progress }
  self.postMessage(response)
}

function postByteProgress(
  requestId: string,
  progress: number,
  loaded: number,
  total: number | null,
): void {
  const response: WorkerResponse = {
    type: 'BYTE_PROGRESS',
    requestId,
    progress,
    loaded,
    total,
  }
  self.postMessage(response)
}

function postDocumentReady(requestId: string, pageCount: number): void {
  const response: WorkerResponse = { type: 'DOCUMENT_READY', requestId, pageCount }
  self.postMessage(response)
}

async function handleMessage(event: MessageEvent<WorkerRequest>): Promise<void> {
  const request = event.data

  try {
    switch (request.type) {
      case 'INIT': {
        if (!isWasmSupported()) {
          throw new Error(
            'WebAssembly is not available. Enable WASM in your browser or disable the WebAssembly disable flag.',
          )
        }
        await initPdfium((progress) => postInitProgress(request.requestId, progress))
        postSuccess(request.requestId, { ready: true })
        break
      }

      case 'OPEN_BYTES': {
        const result = openDocumentFromBytes(request.bytes)
        const payload: OpenPayload = { pageCount: result.pageCount, bytes: result.fullBytes }
        // Do not transfer — may alias the caller's ArrayBuffer and detach it.
        postSuccess(request.requestId, payload)
        break
      }

      case 'OPEN': {
        const result = await openDocument(request.url, {
          onByteProgress: (progress, loaded, total) => {
            postByteProgress(request.requestId, progress, loaded, total)
          },
          onDocumentReady: (pageCount) => {
            postDocumentReady(request.requestId, pageCount)
          },
        })
        const payload: OpenPayload = { pageCount: result.pageCount, bytes: result.fullBytes }
        postSuccess(request.requestId, payload, [result.fullBytes.buffer])
        break
      }

      case 'RENDER_PAGE': {
        const { imageData, width, height } = renderPage(
          request.pageIndex,
          request.scale,
          request.rotation,
        )
        const payload: RenderPagePayload = { imageData, width, height }
        postSuccess(request.requestId, payload, [imageData.data.buffer])
        break
      }

      case 'GET_TEXT': {
        const runs = extractTextRuns(request.pageIndex)
        const payload: GetTextPayload = { runs }
        postSuccess(request.requestId, payload)
        break
      }

      case 'GET_THUMBNAIL': {
        const { bitmap, width, height } = await renderThumbnail(
          request.pageIndex,
          request.scale,
          request.rotation ?? 0,
        )
        const payload: GetThumbnailPayload = { bitmap, width, height }
        postSuccess(request.requestId, payload, [bitmap])
        break
      }

      default: {
        const unknownType = request as WorkerRequest
        postError(unknownType.requestId, 'Unknown request type')
        break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error'
    postError(request.requestId, message)
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleMessage(event)
}
