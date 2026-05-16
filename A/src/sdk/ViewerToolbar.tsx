import { useState, useCallback, useEffect, type FormEvent } from 'react'
import {
  ArrowLeft,
  Download,
  Maximize2,
  Minus,
  Plus,
  Printer,
  Rows3,
  Save,
  Square,
} from 'lucide-react'
import { useViewerStore } from './stores/viewerStore'

interface ViewerToolbarProps {
  onClose?: () => void
  onSave?: () => void | Promise<void>
  onPrint?: () => void | Promise<void>
  onJumpToPage?: (page: number) => void
  /** When the editor has source bytes, Quick Download uses pdf-lib export (includes edits). */
  editorExportReady?: boolean
  /** Original URL download — works before WASM init and while the file is still streaming. */
  rawQuickDownload?: { url: string; filename: string } | null
  onExportPdf?: () => void | Promise<void>
}

export function ViewerToolbar({
  onClose,
  onSave,
  onPrint,
  onJumpToPage,
  editorExportReady = false,
  rawQuickDownload,
  onExportPdf,
}: ViewerToolbarProps) {
  const docSource = useViewerStore((s) => s.docSource)
  const currentPage = useViewerStore((s) => s.currentPage)
  const totalPages = useViewerStore((s) => s.totalPages)
  const zoom = useViewerStore((s) => s.zoom)
  const fitMode = useViewerStore((s) => s.fitMode)
  const scrollMode = useViewerStore((s) => s.scrollMode)
  const mode = useViewerStore((s) => s.mode)

  const setCurrentPage = useViewerStore((s) => s.setCurrentPage)
  const adjustZoom = useViewerStore((s) => s.adjustZoom)
  const setFitMode = useViewerStore((s) => s.setFitMode)
  const toggleScrollMode = useViewerStore((s) => s.toggleScrollMode)
  const toggleMode = useViewerStore((s) => s.toggleMode)

  const [pageInput, setPageInput] = useState(String(currentPage))

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  const handlePageSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const parsed = Number.parseInt(pageInput, 10)
      if (Number.isNaN(parsed)) {
        return
      }
      setCurrentPage(parsed)
      onJumpToPage?.(parsed)
    },
    [onJumpToPage, pageInput, setCurrentPage],
  )

  const zoomPercent = Math.round(zoom * 100)

  return (
    <header className="flex shrink-0 flex-col border-b border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>

        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
          {docSource?.title ?? 'Document'}
        </h1>

        {docSource && (
          <>
            {editorExportReady && onExportPdf ? (
              <button
                type="button"
                onClick={() => void onExportPdf()}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Download className="h-4 w-4" />
                Quick Download
              </button>
            ) : rawQuickDownload ? (
              <a
                href={rawQuickDownload.url}
                download={rawQuickDownload.filename}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Download className="h-4 w-4" />
                Quick Download
              </a>
            ) : null}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={toggleMode}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === 'edit'
              ? 'bg-accent text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {mode === 'edit' ? 'View' : 'Edit'}
        </button>

        {mode === 'view' && (
        <>
        <div className="mx-1 h-6 w-px bg-slate-200" />

        <button
          type="button"
          title="Save (export PDF)"
          onClick={() => void onSave?.()}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Save className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Print"
          onClick={() => void onPrint?.()}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Printer className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <form onSubmit={handlePageSubmit} className="flex items-center gap-1 text-sm">
          <input
            type="number"
            min={1}
            max={totalPages || 1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            className="w-12 rounded border border-slate-300 px-1.5 py-1 text-center text-sm"
          />
          <span className="text-slate-500">/ {totalPages || '—'}</span>
        </form>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <button
          type="button"
          title="Zoom out"
          onClick={() => adjustZoom(-0.25)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs text-slate-600">{zoomPercent}%</span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => adjustZoom(0.25)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          type="button"
          title="Fit to width"
          onClick={() => setFitMode('width')}
          className={`rounded-md p-1.5 ${
            fitMode === 'width' ? 'bg-indigo-50 text-accent' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Fit to viewport"
          onClick={() => setFitMode('viewport')}
          className={`rounded-md p-1.5 ${
            fitMode === 'viewport'
              ? 'bg-indigo-50 text-accent'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Square className="h-4 w-4" />
        </button>

        <button
          type="button"
          title={scrollMode === 'continuous' ? 'Switch to single page' : 'Switch to continuous scroll'}
          onClick={toggleScrollMode}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${
            scrollMode === 'continuous'
              ? 'bg-indigo-50 text-accent'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {scrollMode === 'continuous' ? (
            <>
              <Rows3 className="h-4 w-4" />
              Continuous
            </>
          ) : (
            <>
              <Square className="h-4 w-4" />
              Single page
            </>
          )}
        </button>
        </>
        )}
      </div>
    </header>
  )
}
