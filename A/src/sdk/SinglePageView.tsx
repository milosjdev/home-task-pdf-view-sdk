import { useEffect, useState } from 'react'
import { PageView } from './PageView'
import type { CachedPage } from './hooks/usePageRenderCache'
import { getPageDimensions, useViewerStore } from './stores/viewerStore'
import { computeRenderScale } from './lib/viewerUtils'

interface SinglePageViewProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  loadPage: (pageIndex: number, scale: number) => Promise<CachedPage | null>
  getCached: (pageIndex: number, scale: number) => CachedPage | undefined
  reloadToken?: number
}

export function SinglePageView({
  containerRef,
  loadPage,
  getCached,
  reloadToken = 0,
}: SinglePageViewProps) {
  const currentPage = useViewerStore((s) => s.currentPage)
  const zoom = useViewerStore((s) => s.zoom)
  const fitMode = useViewerStore((s) => s.fitMode)
  const rotation = useViewerStore((s) => s.rotation)
  const pageDimensions = useViewerStore((s) => s.pageDimensions)
  const [isLoading, setIsLoading] = useState(false)

  const pageIndex = currentPage - 1
  const size = getPageDimensions(pageDimensions, pageIndex, rotation)
  const container = containerRef.current
  const padding = 48
  const scale = computeRenderScale(
    size,
    (container?.clientWidth ?? 800) - padding,
    (container?.clientHeight ?? 600) - padding,
    zoom,
    fitMode,
  )

  const cached = getCached(pageIndex, scale)
  const estimated = { width: size.width * scale, height: size.height * scale }

  useEffect(() => {
    if (scale <= 0) {
      return
    }
    setIsLoading(true)
    void loadPage(pageIndex, scale).finally(() => setIsLoading(false))
  }, [loadPage, pageIndex, reloadToken, scale])

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-6">
      <PageView
        pageNumber={currentPage}
        cached={cached ?? null}
        isLoading={isLoading && !cached}
        estimatedWidth={estimated.width}
        estimatedHeight={estimated.height}
      />
    </div>
  )
}
