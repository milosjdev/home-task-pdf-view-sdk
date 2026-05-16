import { Loader2 } from 'lucide-react'
import { PageCanvas } from './PageCanvas'
import { TextLayer } from './TextLayer'
import type { CachedPage } from './hooks/usePageRenderCache'

interface PageViewProps {
  pageNumber: number
  cached: CachedPage | null
  isLoading: boolean
  estimatedHeight: number
  estimatedWidth: number
}

export function PageView({
  pageNumber,
  cached,
  isLoading,
  estimatedHeight,
  estimatedWidth,
}: PageViewProps) {
  const width = cached?.displayWidth ?? estimatedWidth
  const height = cached?.displayHeight ?? estimatedHeight
  const showSpinner = isLoading && !cached

  return (
    <article
      className="mx-auto flex flex-col items-center py-4"
      data-page={pageNumber}
      style={{ minHeight: height + 32 }}
    >
      <div
        className="relative bg-white shadow-md ring-1 ring-slate-200"
        style={{ width, height }}
      >
        {showSpinner && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}

        {cached && (
          <>
            <PageCanvas
              imageData={cached.imageData}
              displayWidth={cached.displayWidth}
              displayHeight={cached.displayHeight}
            />
            <TextLayer
              runs={cached.runs}
              pageHeightPt={cached.pageHeightPt}
              scale={cached.scale}
              displayWidth={cached.displayWidth}
              displayHeight={cached.displayHeight}
            />
            {isLoading && (
              <div className="pointer-events-none absolute inset-0 bg-white/40" aria-hidden />
            )}
          </>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400">Page {pageNumber}</p>
    </article>
  )
}
