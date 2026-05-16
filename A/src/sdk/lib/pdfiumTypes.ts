export type Rotation = 0 | 90 | 180 | 270

export interface TextRun {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface OpenResult {
  pageCount: number
  /** Full document bytes after the worker finished streaming/fetching (for export, no second fetch). */
  pdfBytes?: Uint8Array
}

export interface RenderPageResult {
  imageData: ImageData
  width: number
  height: number
}

export type WorkerRequestIn =
  | { type: 'INIT' }
  | { type: 'OPEN'; url: string }
  | { type: 'OPEN_BYTES'; bytes: Uint8Array }
  | { type: 'RENDER_PAGE'; pageIndex: number; scale: number; rotation: Rotation }
  | { type: 'GET_TEXT'; pageIndex: number }
  | { type: 'GET_THUMBNAIL'; pageIndex: number; scale?: number; rotation?: Rotation }

export type WorkerRequest = WorkerRequestIn & { requestId: string }

export type WorkerResponse =
  | { type: 'INIT_PROGRESS'; requestId: string; progress: number }
  | { type: 'BYTE_PROGRESS'; requestId: string; progress: number; loaded: number; total: number | null }
  | { type: 'DOCUMENT_READY'; requestId: string; pageCount: number }
  | { type: 'SUCCESS'; requestId: string; payload: unknown }
  | { type: 'ERROR'; requestId: string; message: string }

export interface InitPayload {
  ready: boolean
}

export interface OpenPayload {
  pageCount: number
  /** Present when the worker fully buffered the file (OPEN / OPEN_BYTES). */
  bytes?: Uint8Array
}

export interface RenderPagePayload {
  width: number
  height: number
  imageData: ImageData
}

export interface GetTextPayload {
  runs: TextRun[]
}

export interface GetThumbnailPayload {
  bitmap: ImageBitmap
  width: number
  height: number
}
