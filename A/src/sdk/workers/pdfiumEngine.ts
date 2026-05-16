import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium'
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url'
import type { Rotation, TextRun } from '../lib/pdfiumTypes'
import { RangePdfSource, concatPdfChunks } from './rangePdfSource'

interface PdfiumHeap {
  HEAPU8: Uint8Array
  getValue(ptr: number, type: string): number
}

const FPDF_REVERSE_BYTE_ORDER = 16
const THUMBNAIL_MAX_WIDTH = 160
const MIN_BYTES_BEFORE_OPEN = 128 * 1024

let pdfium: WrappedPdfiumModule | null = null
let docPtr = 0
let filePtr = 0
let pageCount = 0

export interface OpenProgressCallbacks {
  onByteProgress?: (progress: number, loaded: number, total: number | null) => void
  onDocumentReady?: (pageCount: number) => void
}

function rotationToFlag(rotation: Rotation): number {
  switch (rotation) {
    case 90:
      return 1
    case 180:
      return 2
    case 270:
      return 3
    default:
      return 0
  }
}

export async function initPdfium(onProgress?: (progress: number) => void): Promise<void> {
  if (pdfium) {
    return
  }

  onProgress?.(0.1)
  const response = await fetch(pdfiumWasmUrl)
  onProgress?.(0.5)
  const wasmBinary = await response.arrayBuffer()
  onProgress?.(0.8)
  pdfium = await init({ wasmBinary })
  pdfium.PDFiumExt_Init()
  onProgress?.(1)
}

function requirePdfium(): WrappedPdfiumModule {
  if (!pdfium) {
    throw new Error('PDFium is not initialized')
  }
  return pdfium
}

function heap(instance: WrappedPdfiumModule): PdfiumHeap {
  return instance.pdfium as unknown as PdfiumHeap
}

function closeDocument(): void {
  if (!pdfium) {
    return
  }
  if (docPtr) {
    pdfium.FPDF_CloseDocument(docPtr)
    docPtr = 0
  }
  if (filePtr) {
    pdfium.pdfium.wasmExports.free(filePtr)
    filePtr = 0
  }
  pageCount = 0
}

function loadBufferIntoWasm(instance: WrappedPdfiumModule, pdfData: Uint8Array): void {
  if (filePtr) {
    instance.pdfium.wasmExports.free(filePtr)
  }
  filePtr = instance.pdfium.wasmExports.malloc(pdfData.length)
  heap(instance).HEAPU8.set(pdfData, filePtr)
}

function tryOpenBuffer(instance: WrappedPdfiumModule, length: number): boolean {
  if (docPtr) {
    instance.FPDF_CloseDocument(docPtr)
    docPtr = 0
  }

  const loadedDoc = instance.FPDF_LoadMemDocument(filePtr, length, '')
  if (!loadedDoc) {
    return false
  }

  docPtr = loadedDoc
  pageCount = instance.FPDF_GetPageCount(docPtr)
  return pageCount > 0
}

function copyChunksToWasm(instance: WrappedPdfiumModule, chunks: Uint8Array[]): number {
  const merged = concatPdfChunks(chunks)
  loadBufferIntoWasm(instance, merged)
  return merged.length
}

export async function openDocument(
  url: string,
  callbacks: OpenProgressCallbacks = {},
): Promise<{ pageCount: number; fullBytes: Uint8Array }> {
  const instance = requirePdfium()
  closeDocument()

  const source = new RangePdfSource(url)
  await source.probe()

  const chunks: Uint8Array[] = []
  let opened = false
  let notifiedReady = false
  let openedAtLength = 0

  for await (const chunk of source.readChunks((byteProgress) => {
    callbacks.onByteProgress?.(byteProgress.progress, byteProgress.loaded, byteProgress.total)
  })) {
    chunks.push(chunk)
    const length = copyChunksToWasm(instance, chunks)

    if (!opened && length >= MIN_BYTES_BEFORE_OPEN) {
      opened = tryOpenBuffer(instance, length)
      if (opened) {
        openedAtLength = length
        if (!notifiedReady) {
          notifiedReady = true
          callbacks.onDocumentReady?.(pageCount)
        }
      }
    }
  }

  const finalLength = copyChunksToWasm(instance, chunks)

  if (!opened) {
    const success = tryOpenBuffer(instance, finalLength)
    if (!success) {
      const error = instance.FPDF_GetLastError()
      instance.pdfium.wasmExports.free(filePtr)
      filePtr = 0
      throw new Error(`Failed to load PDF (error ${error})`)
    }
    if (!notifiedReady) {
      callbacks.onDocumentReady?.(pageCount)
    }
  } else if (finalLength > openedAtLength) {
    // Re-open only when additional bytes arrived (avoids redundant close/reopen flicker).
    if (!tryOpenBuffer(instance, finalLength)) {
      throw new Error('Failed to reload PDF after full download')
    }
  }

  callbacks.onByteProgress?.(1, finalLength, finalLength)
  const fullBytes = concatPdfChunks(chunks)
  return { pageCount, fullBytes }
}

export function openDocumentFromBytes(
  pdfData: Uint8Array,
): { pageCount: number; fullBytes: Uint8Array } {
  const instance = requirePdfium()
  closeDocument()
  loadBufferIntoWasm(instance, pdfData)

  const success = tryOpenBuffer(instance, pdfData.length)
  if (!success) {
    const error = instance.FPDF_GetLastError()
    instance.pdfium.wasmExports.free(filePtr)
    filePtr = 0
    throw new Error(`Failed to load PDF from bytes (error ${error})`)
  }

  return { pageCount, fullBytes: pdfData }
}

function renderPageToImageData(
  pageIndex: number,
  scale: number,
  rotation: Rotation,
): { imageData: ImageData; width: number; height: number } {
  const instance = requirePdfium()
  if (!docPtr) {
    throw new Error('No document is open')
  }
  if (pageIndex < 0 || pageIndex >= pageCount) {
    throw new Error(`Invalid page index: ${pageIndex}`)
  }

  const pagePtr = instance.FPDF_LoadPage(docPtr, pageIndex)
  if (!pagePtr) {
    throw new Error(`Failed to load page ${pageIndex}`)
  }

  try {
    const pageWidth = instance.FPDF_GetPageWidthF(pagePtr)
    const pageHeight = instance.FPDF_GetPageHeightF(pagePtr)
    const rotateFlag = rotationToFlag(rotation)

    let bitmapWidth = Math.max(1, Math.floor(pageWidth * scale))
    let bitmapHeight = Math.max(1, Math.floor(pageHeight * scale))

    if (rotation === 90 || rotation === 270) {
      ;[bitmapWidth, bitmapHeight] = [bitmapHeight, bitmapWidth]
    }

    const bitmapPtr = instance.FPDFBitmap_Create(bitmapWidth, bitmapHeight, 0)
    if (!bitmapPtr) {
      throw new Error('Failed to create bitmap')
    }

    try {
      instance.FPDFBitmap_FillRect(bitmapPtr, 0, 0, bitmapWidth, bitmapHeight, 0xffffffff)
      instance.FPDF_RenderPageBitmap(
        bitmapPtr,
        pagePtr,
        0,
        0,
        bitmapWidth,
        bitmapHeight,
        rotateFlag,
        FPDF_REVERSE_BYTE_ORDER,
      )

      const bufferPtr = instance.FPDFBitmap_GetBuffer(bitmapPtr)
      if (!bufferPtr) {
        throw new Error('Failed to get bitmap buffer')
      }

      const bufferSize = bitmapWidth * bitmapHeight * 4
      const moduleHeap = heap(instance)
      const buffer = new Uint8ClampedArray(
        moduleHeap.HEAPU8.buffer,
        moduleHeap.HEAPU8.byteOffset + bufferPtr,
        bufferSize,
      ).slice()

      const imageData = new ImageData(buffer, bitmapWidth, bitmapHeight)
      return {
        imageData,
        width: bitmapWidth,
        height: bitmapHeight,
      }
    } finally {
      instance.FPDFBitmap_Destroy(bitmapPtr)
    }
  } finally {
    instance.FPDF_ClosePage(pagePtr)
  }
}

export function renderPage(
  pageIndex: number,
  scale: number,
  rotation: Rotation,
): { imageData: ImageData; width: number; height: number } {
  return renderPageToImageData(pageIndex, scale, rotation)
}

export async function renderThumbnail(
  pageIndex: number,
  scale = 0.25,
  rotation: Rotation = 0,
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  if (!docPtr) {
    throw new Error('No document is open')
  }

  const instance = requirePdfium()
  const probePtr = instance.FPDF_LoadPage(docPtr, pageIndex)
  if (!probePtr) {
    throw new Error(`Failed to load page ${pageIndex}`)
  }

  let thumbScale = scale
  try {
    const pageWidth = instance.FPDF_GetPageWidthF(probePtr)
    thumbScale = Math.min(scale, THUMBNAIL_MAX_WIDTH / Math.max(pageWidth, 1))
  } finally {
    instance.FPDF_ClosePage(probePtr)
  }

  const { imageData, width, height } = renderPageToImageData(pageIndex, thumbScale, rotation)
  const bitmap = await createImageBitmap(imageData)
  return { bitmap, width, height }
}

export function extractTextRuns(pageIndex: number): TextRun[] {
  const instance = requirePdfium()
  if (!docPtr) {
    throw new Error('No document is open')
  }
  if (pageIndex < 0 || pageIndex >= pageCount) {
    throw new Error(`Invalid page index: ${pageIndex}`)
  }

  const pagePtr = instance.FPDF_LoadPage(docPtr, pageIndex)
  if (!pagePtr) {
    throw new Error(`Failed to load page ${pageIndex}`)
  }

  try {
    const textPagePtr = instance.FPDFText_LoadPage(pagePtr)
    if (!textPagePtr) {
      return []
    }

    try {
      const charCount = instance.FPDFText_CountChars(textPagePtr)
      if (charCount <= 0) {
        return []
      }

      const leftPtr = instance.pdfium.wasmExports.malloc(8)
      const rightPtr = instance.pdfium.wasmExports.malloc(8)
      const bottomPtr = instance.pdfium.wasmExports.malloc(8)
      const topPtr = instance.pdfium.wasmExports.malloc(8)

      try {
        const runs: TextRun[] = []
        let current = ''

        for (let i = 0; i < charCount; i++) {
          const code = instance.FPDFText_GetUnicode(textPagePtr, i)
          const char = code ? String.fromCodePoint(code) : ''

          instance.FPDFText_GetCharBox(textPagePtr, i, leftPtr, rightPtr, bottomPtr, topPtr)
          const moduleHeap = heap(instance)
          const left = moduleHeap.getValue(leftPtr, 'double')
          const right = moduleHeap.getValue(rightPtr, 'double')
          const bottom = moduleHeap.getValue(bottomPtr, 'double')
          const top = moduleHeap.getValue(topPtr, 'double')

          const x = left
          const y = top
          const width = Math.max(0, right - left)
          const height = Math.max(0, bottom - top)

          if (char === '\r' || char === '\n') {
            if (current) {
              runs.push({ text: current, x, y, width, height })
              current = ''
            }
            continue
          }

          if (!current) {
            runs.push({ text: char, x, y, width, height })
            current = char
          } else {
            const last = runs[runs.length - 1]
            last.text += char
            last.width = x + width - last.x
            last.height = Math.max(last.height, height)
          }
        }

        return runs
      } finally {
        instance.pdfium.wasmExports.free(leftPtr)
        instance.pdfium.wasmExports.free(rightPtr)
        instance.pdfium.wasmExports.free(bottomPtr)
        instance.pdfium.wasmExports.free(topPtr)
      }
    } finally {
      instance.FPDFText_ClosePage(textPagePtr)
    }
  } finally {
    instance.FPDF_ClosePage(pagePtr)
  }
}

export function isWasmSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
}
