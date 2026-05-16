import { useCallback, useEffect, useRef, useState } from 'react'
import { PageView } from './PageView'
import type { CachedPage } from './hooks/usePageRenderCache'
import {
  getPageDimensions,
  useViewerStore,
  type PageDimensions,
} from './stores/viewerStore'
import { computeRenderScale, pageCacheKey } from './lib/viewerUtils'

const BUFFER_PAGES = 1

interface DocumentScrollerProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  loadPage: (pageIndex: number, scale: number) => Promise<CachedPage | null>
  getCached: (pageIndex: number, scale: number) => CachedPage | undefined
  evictExcept: (keys: Set<string>) => void
  onVisiblePageChange: (page: number) => void
  scrollToPage: number | null
  onScrollToPageDone: () => void
  /** Increment after clearing the render cache (e.g. preview PDF rebuilt) to force a reload. */
  reloadToken?: number
}

export function DocumentScroller({
  containerRef,
  loadPage,
  getCached,
  evictExcept,
  onVisiblePageChange,
  scrollToPage,
  onScrollToPageDone,
  reloadToken = 0,
}: DocumentScrollerProps) {
  const totalPages = useViewerStore((s) => s.totalPages)
  const zoom = useViewerStore((s) => s.zoom)
  const fitMode = useViewerStore((s) => s.fitMode)
  const rotation = useViewerStore((s) => s.rotation)
  const pageDimensions = useViewerStore((s) => s.pageDimensions)

  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([0]))
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set())
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const pageDimensionsRef = useRef(pageDimensions)
  const onVisiblePageChangeRef = useRef(onVisiblePageChange)
  const refreshGenerationRef = useRef(0)

  pageDimensionsRef.current = pageDimensions
  onVisiblePageChangeRef.current = onVisiblePageChange

  const getScaleForPage = useCallback(
    (pageIndex: number) => {
      const container = containerRef.current
      const size = getPageDimensions(pageDimensionsRef.current, pageIndex, rotation)
      const width = container?.clientWidth ?? 800
      const height = container?.clientHeight ?? 600
      const padding = 48
      return computeRenderScale(size, width - padding, height - padding, zoom, fitMode)
    },
    [containerRef, fitMode, rotation, zoom],
  )

  const getEstimatedSize = useCallback(
    (pageIndex: number): PageDimensions => {
      const size = getPageDimensions(pageDimensionsRef.current, pageIndex, rotation)
      const scale = getScaleForPage(pageIndex)
      return {
        width: size.width * scale,
        height: size.height * scale,
      }
    },
    [getScaleForPage, rotation],
  )

  const refreshVisiblePages = useCallback(
    async (pages: Set<number>) => {
      const generation = ++refreshGenerationRef.current
      const expanded = new Set<number>()
      for (const page of pages) {
        for (let offset = -BUFFER_PAGES; offset <= BUFFER_PAGES; offset++) {
          const index = page + offset
          if (index >= 0 && index < totalPages) {
            expanded.add(index)
          }
        }
      }

      const keepKeys = new Set<string>()
      const tasks: Promise<void>[] = []

      for (const pageIndex of expanded) {
        const scale = getScaleForPage(pageIndex)
        keepKeys.add(pageCacheKey(pageIndex, scale, rotation))

        if (!getCached(pageIndex, scale)) {
          setLoadingPages((prev) => new Set(prev).add(pageIndex))
          tasks.push(
            loadPage(pageIndex, scale)
              .then(() => undefined)
              .finally(() => {
                if (generation !== refreshGenerationRef.current) {
                  return
                }
                setLoadingPages((prev) => {
                  const next = new Set(prev)
                  next.delete(pageIndex)
                  return next
                })
              }),
          )
        }
      }

      evictExcept(keepKeys)
      await Promise.all(tasks)
    },
    [evictExcept, getCached, getScaleForPage, loadPage, rotation, totalPages],
  )

  const refreshVisiblePagesRef = useRef(refreshVisiblePages)
  refreshVisiblePagesRef.current = refreshVisiblePages

  useEffect(() => {
    const root = containerRef.current
    if (!root || totalPages === 0) {
      return
    }

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev)
          for (const entry of entries) {
            const pageAttr = entry.target.getAttribute('data-page-index')
            if (!pageAttr) {
              continue
            }
            const pageIndex = Number(pageAttr)
            if (entry.isIntersecting) {
              next.add(pageIndex)
            } else {
              next.delete(pageIndex)
            }
          }
          // IO often reports nothing intersecting before the scroll root has laid out; an empty set
          // skips refreshVisiblePages → blank until scroll. Always keep page 0 eligible.
          if (totalPages > 0 && next.size === 0) {
            next.add(0)
          }
          return next
        })
      },
      { root, rootMargin: '200px 0px', threshold: 0.05 },
    )

    for (const element of pageRefs.current.values()) {
      observerRef.current.observe(element)
    }

    return () => observerRef.current?.disconnect()
  }, [containerRef, totalPages])

  useEffect(() => {
    if (visiblePages.size === 0) {
      return
    }
    void refreshVisiblePages(visiblePages)

    const sorted = [...visiblePages].sort((a, b) => a - b)
    const center = sorted[Math.floor(sorted.length / 2)]
    onVisiblePageChangeRef.current(center + 1)
  }, [reloadToken, visiblePages, refreshVisiblePages])

  useEffect(() => {
    if (visiblePages.size === 0) {
      return
    }
    void refreshVisiblePagesRef.current(visiblePages)
  }, [zoom, fitMode, rotation, visiblePages])

  useEffect(() => {
    if (scrollToPage === null) {
      return
    }
    const element = pageRefs.current.get(scrollToPage - 1)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onScrollToPageDone()
  }, [scrollToPage, onScrollToPageDone])

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      {Array.from({ length: totalPages }, (_, pageIndex) => {
        const scale = getScaleForPage(pageIndex)
        const cached = getCached(pageIndex, scale)
        const estimated = getEstimatedSize(pageIndex)

        return (
          <div
            key={pageIndex}
            ref={(node) => {
              if (node) {
                pageRefs.current.set(pageIndex, node)
                observerRef.current?.observe(node)
              } else {
                pageRefs.current.delete(pageIndex)
              }
            }}
            data-page-index={pageIndex}
          >
            <PageView
              pageNumber={pageIndex + 1}
              cached={cached ?? null}
              isLoading={loadingPages.has(pageIndex)}
              estimatedWidth={estimated.width}
              estimatedHeight={estimated.height}
            />
          </div>
        )
      })}
    </div>
  )
}
