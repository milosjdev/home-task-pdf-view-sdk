import { PDFDocument, degrees } from 'pdf-lib'
import type { Rotation } from './pdfiumTypes'
import type { PageRef } from '../stores/editorStore'
import { pageRefKey } from '../stores/editorStore'

export interface EditorExportState {
  pageOrder: PageRef[]
  rotations: Record<string, Rotation>
}

export async function applyEditsAndExport(
  sourceDocs: Record<string, Uint8Array>,
  editorState: EditorExportState,
): Promise<Uint8Array> {
  const output = await PDFDocument.create()

  for (const ref of editorState.pageOrder) {
    const sourceBytes = sourceDocs[ref.docId]
    if (!sourceBytes) {
      continue
    }

    const sourcePdf = await PDFDocument.load(sourceBytes)
    const [copied] = await output.copyPages(sourcePdf, [ref.originalIndex])
    const rotation = editorState.rotations[pageRefKey(ref)] ?? 0
    if (rotation) {
      copied.setRotation(degrees(rotation))
    }
    output.addPage(copied)
  }

  return output.save()
}

export async function extractPages(
  sourceDocs: Record<string, Uint8Array>,
  pageRefs: PageRef[],
  rotations: Record<string, Rotation>,
): Promise<Uint8Array> {
  return applyEditsAndExport(sourceDocs, { pageOrder: pageRefs, rotations })
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
