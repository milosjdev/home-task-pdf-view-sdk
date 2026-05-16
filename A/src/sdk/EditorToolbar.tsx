import { useRef } from 'react'
import {
  ClipboardPaste,
  Copy,
  FileInput,
  FileOutput,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { applyEditsAndExport, downloadPdfBytes, extractPages } from './lib/pdfEditor'
import { useEditorStore, pageRefKey } from './stores/editorStore'
import { useViewerStore } from './stores/viewerStore'

export function EditorToolbar() {
  const importInputRef = useRef<HTMLInputElement>(null)

  const pageOrder = useEditorStore((s) => s.pageOrder)
  const selectedKeys = useEditorStore((s) => s.selectedKeys)
  const sourceDocs = useEditorStore((s) => s.sourceDocs)
  const rotations = useEditorStore((s) => s.rotations)
  const editorZoom = useEditorStore((s) => s.editorZoom)
  const selectionMode = useEditorStore((s) => s.selectionMode)
  const undoStack = useEditorStore((s) => s.undoStack)
  const redoStack = useEditorStore((s) => s.redoStack)
  const clipboard = useEditorStore((s) => s.clipboard)

  const deleteSelected = useEditorStore((s) => s.deleteSelected)
  const rotateSelected = useEditorStore((s) => s.rotateSelected)
  const addImportedDocument = useEditorStore((s) => s.addImportedDocument)
  const copySelected = useEditorStore((s) => s.copySelected)
  const pastePages = useEditorStore((s) => s.pastePages)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const adjustEditorZoom = useEditorStore((s) => s.adjustEditorZoom)
  const toggleSelectionMode = useEditorStore((s) => s.toggleSelectionMode)

  const docTitle = useViewerStore((s) => s.docSource?.title ?? 'document.pdf')

  const hasSelection = selectedKeys.length > 0
  const zoomPercent = Math.round(editorZoom * 100)

  async function handleImportFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const pdf = await PDFDocument.load(bytes)
    const docId = `import-${Date.now()}`
    addImportedDocument(docId, bytes, pdf.getPageCount())
  }

  async function handleExtract() {
    if (!hasSelection) {
      return
    }
    const selected = new Set(selectedKeys)
    const refs = pageOrder.filter((ref) => selected.has(pageRefKey(ref)))
    const bytes = await extractPages(sourceDocs, refs, rotations)
    const baseName = docTitle.replace(/\.pdf$/i, '')
    downloadPdfBytes(bytes, `${baseName}-extract.pdf`)
  }

  async function handleQuickExport() {
    const bytes = await applyEditsAndExport(sourceDocs, { pageOrder, rotations })
    downloadPdfBytes(bytes, docTitle.endsWith('.pdf') ? docTitle : `${docTitle}.pdf`)
  }

  return (
    <div className="flex flex-col border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          title="Import PDF pages"
          onClick={() => importInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
        >
          <FileInput className="h-3.5 w-3.5" />
          Import
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void handleImportFile(file)
            }
            event.target.value = ''
          }}
        />

        <div className="mx-1 h-5 w-px bg-slate-200" />

        <button
          type="button"
          title="Delete selected pages"
          disabled={!hasSelection}
          onClick={deleteSelected}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Rotate left"
          disabled={!hasSelection}
          onClick={() => rotateSelected(-90)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Rotate right"
          disabled={!hasSelection}
          onClick={() => rotateSelected(90)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        <button
          type="button"
          title="Undo"
          disabled={undoStack.length === 0}
          onClick={undo}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Redo"
          disabled={redoStack.length === 0}
          onClick={redo}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        <button
          type="button"
          title="Zoom out"
          onClick={() => adjustEditorZoom(-0.1)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[2.5rem] text-center text-xs text-slate-600">{zoomPercent}%</span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => adjustEditorZoom(0.1)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          type="button"
          title="Select area"
          onClick={toggleSelectionMode}
          className={`rounded-md p-1.5 ${
            selectionMode ? 'bg-indigo-50 text-accent' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MousePointer2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          title="Copy pages"
          disabled={!hasSelection}
          onClick={copySelected}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Paste pages"
          disabled={clipboard.length === 0}
          onClick={pastePages}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        <button
          type="button"
          title="Extract selected pages"
          disabled={!hasSelection}
          onClick={() => void handleExtract()}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        >
          <FileOutput className="h-3.5 w-3.5" />
          Extract
        </button>
        <button
          type="button"
          title="Export edited PDF"
          onClick={() => void handleQuickExport()}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          Export
        </button>
      </div>

      <p className="border-t border-slate-100 px-3 py-1 text-xs text-slate-500">
        {pageOrder.length} pages · {selectedKeys.length} selected
        {selectionMode ? ' · Selection mode on' : ''}
      </p>
    </div>
  )
}
