import { useCallback, useEffect, useRef } from 'react'
import { getPdfiumClient } from '../lib/pdfiumClient'
import { applyEditsAndExport } from '../lib/pdfEditor'
import { useEditorStore } from '../stores/editorStore'
import { useViewerStore } from '../stores/viewerStore'

const REBUILD_DEBOUNCE_MS = 300

/**
 * Keeps the PDFium worker document in sync with editor pageOrder + rotations.
 * Thumbnails and the view mode both read from this merged preview PDF.
 */
export function useEditorPreview() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const prevModeRef = useRef(useViewerStore.getState().mode)
  const wasInitializedRef = useRef(false)

  const mode = useViewerStore((s) => s.mode)
  const pageOrder = useEditorStore((s) => s.pageOrder)
  const rotations = useEditorStore((s) => s.rotations)
  const sourceDocs = useEditorStore((s) => s.sourceDocs)
  const isInitialized = useEditorStore((s) => s.isInitialized)
  const setPreviewSyncing = useEditorStore((s) => s.setPreviewSyncing)
  const bumpPreviewRevision = useEditorStore((s) => s.bumpPreviewRevision)
  const setTotalPages = useViewerStore((s) => s.setTotalPages)

  const runSync = useCallback(async () => {
    if (!isInitialized || pageOrder.length === 0) {
      return
    }

    const generation = ++generationRef.current
    setPreviewSyncing(true)

    try {
      const bytes = await applyEditsAndExport(sourceDocs, { pageOrder, rotations })
      if (generation !== generationRef.current) {
        return
      }

      const client = getPdfiumClient()
      const { pageCount } = await client.openBytes(bytes)
      if (generation !== generationRef.current) {
        return
      }

      bumpPreviewRevision()
      setTotalPages(pageCount)
    } catch {
      // Preview rebuild failed — UI will retry on the next edit.
    } finally {
      if (generation === generationRef.current) {
        setPreviewSyncing(false)
      }
    }
  }, [
    bumpPreviewRevision,
    isInitialized,
    pageOrder,
    rotations,
    setPreviewSyncing,
    setTotalPages,
    sourceDocs,
  ])

  useEffect(() => {
    if (!isInitialized || pageOrder.length === 0) {
      wasInitializedRef.current = false
      return
    }

    const justInitialized = !wasInitializedRef.current
    wasInitializedRef.current = true

    const modeChanged = prevModeRef.current !== mode
    prevModeRef.current = mode

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (justInitialized || modeChanged) {
      void runSync()
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }
      }
    }

    timerRef.current = setTimeout(() => {
      void runSync()
    }, REBUILD_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isInitialized, mode, pageOrder, rotations, sourceDocs, runSync])
}
