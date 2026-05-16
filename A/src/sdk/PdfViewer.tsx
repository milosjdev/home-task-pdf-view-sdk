import { useCallback, useEffect, useRef, useState } from 'react'
import { getPdfiumClient, isWasmSupported } from './lib/pdfiumClient'
import { applyEditsAndExport, downloadPdfBytes } from './lib/pdfEditor'
import { printPdfBytes } from './lib/print'
import { DocumentScroller } from './DocumentScroller'
import { EditorView } from './EditorView'
import { LoadingOverlay } from './LoadingOverlay'
import { SinglePageView } from './SinglePageView'
import { ViewerToolbar } from './ViewerToolbar'
import { useEditorPreview } from './hooks/useEditorPreview'
import { usePageRenderCache } from './hooks/usePageRenderCache'
import { useEditorStore } from './stores/editorStore'
import { useViewerStore } from './stores/viewerStore'

export interface PdfViewerProps {
  url?: string
  file?: File
  title?: string
  onClose?: () => void
}

function exportFileBasename(title: string): string {
  const trimmed = title.trim() || 'document'
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`
}

export function PdfViewer({ url, file, title, onClose }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const [scrollToPage, setScrollToPage] = useState<number | null>(null)
  const [viewReloadToken, setViewReloadToken] = useState(0)

  const loadPhase = useViewerStore((s) => s.loadPhase)
  const loadProgress = useViewerStore((s) => s.loadProgress)
  const bytesLoaded = useViewerStore((s) => s.bytesLoaded)
  const bytesTotal = useViewerStore((s) => s.bytesTotal)
  const isFullyDownloaded = useViewerStore((s) => s.isFullyDownloaded)
  const error = useViewerStore((s) => s.error)
  const isDocumentReady = useViewerStore((s) => s.isDocumentReady)
  const scrollMode = useViewerStore((s) => s.scrollMode)
  const mode = useViewerStore((s) => s.mode)
  const rotation = useViewerStore((s) => s.rotation)
  const zoom = useViewerStore((s) => s.zoom)
  const fitMode = useViewerStore((s) => s.fitMode)

  const isEditorInitialized = useEditorStore((s) => s.isInitialized)
  const previewRevision = useEditorStore((s) => s.previewRevision)

  const setDocSource = useViewerStore((s) => s.setDocSource)
  const setLoading = useViewerStore((s) => s.setLoading)
  const setLoadPhase = useViewerStore((s) => s.setLoadPhase)
  const setWasmProgress = useViewerStore((s) => s.setWasmProgress)
  const setByteProgress = useViewerStore((s) => s.setByteProgress)
  const setFullyDownloaded = useViewerStore((s) => s.setFullyDownloaded)
  const setError = useViewerStore((s) => s.setError)
  const setDocumentReady = useViewerStore((s) => s.setDocumentReady)
  const setTotalPages = useViewerStore((s) => s.setTotalPages)
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage)
  const docSource = useViewerStore((s) => s.docSource)
  const resetViewer = useViewerStore((s) => s.reset)
  const resetEditor = useEditorStore((s) => s.reset)
  const initEditor = useEditorStore((s) => s.initFromDocument)

  useEditorPreview()

  const exportEditedPdf = useCallback(async (): Promise<Uint8Array> => {
    const editor = useEditorStore.getState()
    return applyEditsAndExport(editor.sourceDocs, {
      pageOrder: editor.pageOrder,
      rotations: editor.rotations,
    })
  }, [])

  const handleExportPdf = useCallback(async (): Promise<void> => {
    try {
      const bytes = await exportEditedPdf()
      const name = exportFileBasename(useViewerStore.getState().docSource?.title ?? 'document.pdf')
      downloadPdfBytes(bytes, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF')
    }
  }, [exportEditedPdf, setError])

  const handlePrint = useCallback(async (): Promise<void> => {
    try {
      const bytes = await exportEditedPdf()
      printPdfBytes(bytes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to print PDF')
    }
  }, [exportEditedPdf, setError])

  const { loadPage, getCached, invalidateAll, evictExcept } = usePageRenderCache({
    rotation,
    enabled: isDocumentReady && mode === 'view',
  })

  const prevViewLayoutRef = useRef({ zoom, fitMode, rotation })

  useEffect(() => {
    if (mode !== 'view') {
      prevViewLayoutRef.current = { zoom, fitMode, rotation }
      return
    }
    const prev = prevViewLayoutRef.current
    const layoutChanged =
      prev.zoom !== zoom || prev.fitMode !== fitMode || prev.rotation !== rotation
    prevViewLayoutRef.current = { zoom, fitMode, rotation }
    if (layoutChanged) {
      invalidateAll()
    }
  }, [zoom, fitMode, rotation, mode, invalidateAll])

  useEffect(() => {
    if (mode === 'view' && isDocumentReady && isEditorInitialized && previewRevision > 0) {
      invalidateAll()
      setViewReloadToken((t) => t + 1)
    }
  }, [previewRevision, mode, isDocumentReady, isEditorInitialized, invalidateAll])

  useEffect(() => {
    if (!url && !file) {
      setError('No PDF source provided')
      return
    }

    let cancelled = false

    const sourceUrl = url
      ? url
      : (() => {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
          }
          const blobUrl = URL.createObjectURL(file!)
          objectUrlRef.current = blobUrl
          return blobUrl
        })()

    sourceUrlRef.current = sourceUrl
    const sourceTitle = title ?? (file?.name ?? url?.split('/').pop() ?? 'Document.pdf')

    resetViewer()
    resetEditor()
    invalidateAll()
    setDocSource({ url: sourceUrl, title: sourceTitle })
    setLoading(true, 0)
    setLoadPhase('wasm')
    setFullyDownloaded(false)

    void (async () => {
      try {
        const client = getPdfiumClient()
        await client.init((progress) => {
          if (!cancelled) {
            setWasmProgress(progress)
          }
        })
        if (cancelled) {
          return
        }

        setLoadPhase('bytes')

        const { pageCount, pdfBytes } = await client.open(sourceUrl, {
          onByteProgress: (progress, loaded, total) => {
            if (!cancelled) {
              setByteProgress(progress, loaded, total)
            }
          },
          onDocumentReady: (count) => {
            if (cancelled) {
              return
            }
            setTotalPages(count)
            setCurrentPage(1)
            setDocumentReady(true)
          },
        })

        if (!cancelled) {
          setFullyDownloaded(true)
          if (pdfBytes && pdfBytes.byteLength > 0) {
            initEditor('main', pageCount, pdfBytes)
          } else {
            setError('Could not buffer PDF bytes for editing')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    file,
    initEditor,
    resetEditor,
    resetViewer,
    setByteProgress,
    setCurrentPage,
    setDocSource,
    setDocumentReady,
    setError,
    setFullyDownloaded,
    setLoadPhase,
    setLoading,
    setTotalPages,
    setWasmProgress,
    title,
    url,
    invalidateAll,
  ])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      resetViewer()
      resetEditor()
    }
  }, [resetEditor, resetViewer])

  const handleVisiblePageChange = useCallback(
    (page: number) => {
      if (scrollMode === 'continuous') {
        setCurrentPage(page)
      }
    },
    [scrollMode, setCurrentPage],
  )

  const handleJumpToPage = useCallback(
    (page: number) => {
      if (scrollMode === 'continuous') {
        setScrollToPage(page)
      }
    },
    [scrollMode],
  )

  const showLoadingOverlay =
    !isDocumentReady && (loadPhase === 'wasm' || loadPhase === 'bytes')
  const loadingSublabel =
    loadPhase === 'bytes' && bytesTotal
      ? `${Math.round(bytesLoaded / 1024)} KB / ${Math.round(bytesTotal / 1024)} KB`
      : loadPhase === 'bytes' && bytesLoaded > 0
        ? `${Math.round(bytesLoaded / 1024)} KB downloaded`
        : undefined

  if (!isWasmSupported()) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-red-600">
          WebAssembly is not available. Enable WASM in your browser settings to use the PDF
          viewer.
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-slate-100">
      <ViewerToolbar
        onClose={onClose}
        onJumpToPage={handleJumpToPage}
        onSave={isEditorInitialized ? handleExportPdf : undefined}
        onPrint={isEditorInitialized ? handlePrint : undefined}
        editorExportReady={isEditorInitialized}
        rawQuickDownload={
          docSource && !isEditorInitialized
            ? {
                url: docSource.url,
                filename: exportFileBasename(docSource.title),
              }
            : null
        }
        onExportPdf={isEditorInitialized ? handleExportPdf : undefined}
      />

      {isDocumentReady && !isFullyDownloaded && mode === 'view' && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Downloading remaining bytes…</span>
            <span>
              {bytesTotal
                ? `${Math.round((bytesLoaded / bytesTotal) * 100)}%`
                : `${Math.round(bytesLoaded / 1024)} KB`}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{
                width: `${bytesTotal ? Math.max(4, (bytesLoaded / bytesTotal) * 100) : 30}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      {mode === 'edit' && isDocumentReady ? (
        <EditorView />
      ) : (
        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
          {isDocumentReady && scrollMode === 'continuous' && (
            <DocumentScroller
              containerRef={containerRef}
              loadPage={loadPage}
              getCached={getCached}
              evictExcept={evictExcept}
              onVisiblePageChange={handleVisiblePageChange}
              scrollToPage={scrollToPage}
              onScrollToPageDone={() => setScrollToPage(null)}
              reloadToken={viewReloadToken}
            />
          )}

          {isDocumentReady && scrollMode === 'single' && (
            <SinglePageView
              containerRef={containerRef}
              loadPage={loadPage}
              getCached={getCached}
              reloadToken={viewReloadToken}
            />
          )}

          {showLoadingOverlay && (
            <LoadingOverlay
              phase={loadPhase === 'wasm' ? 'wasm' : 'bytes'}
              sublabel={loadingSublabel}
              progress={loadProgress}
            />
          )}
        </div>
      )}
    </div>
  )
}
