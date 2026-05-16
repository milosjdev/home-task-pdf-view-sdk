import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPdfiumClient } from '../lib/pdfiumClient'
import type { Rotation, TextRun } from '../lib/pdfiumTypes'
import { pageCacheKey } from '../lib/viewerUtils'

export interface CachedPage {
  imageData: ImageData
  runs: TextRun[]
  displayWidth: number
  displayHeight: number
  pageHeightPt: number
  scale: number
}

interface UsePageRenderCacheOptions {
  rotation: Rotation
  enabled: boolean
}

export function usePageRenderCache({ rotation, enabled }: UsePageRenderCacheOptions) {
  const cacheRef = useRef(new Map<string, CachedPage>())
  const inflightRef = useRef(new Map<string, Promise<CachedPage | null>>())
  const [, bump] = useState(0)

  const invalidateAll = useCallback(() => {
    cacheRef.current.clear()
    inflightRef.current.clear()
    bump((n) => n + 1)
  }, [])

  const evictExcept = useCallback((keepKeys: Set<string>) => {
    for (const key of cacheRef.current.keys()) {
      if (!keepKeys.has(key)) {
        cacheRef.current.delete(key)
      }
    }
    bump((n) => n + 1)
  }, [])

  const loadPage = useCallback(
    async (pageIndex: number, scale: number): Promise<CachedPage | null> => {
      if (!enabled || scale <= 0) {
        return null
      }

      const key = pageCacheKey(pageIndex, scale, rotation)
      const cached = cacheRef.current.get(key)
      if (cached) {
        return cached
      }

      const inflight = inflightRef.current.get(key)
      if (inflight) {
        return inflight
      }

      const promise = (async () => {
        try {
          const client = getPdfiumClient()
          const [rendered, runs] = await Promise.all([
            client.renderPage(pageIndex, scale, rotation),
            client.getText(pageIndex),
          ])

          const pageHeightPt = rendered.height / scale
          const entry: CachedPage = {
            imageData: rendered.imageData,
            runs,
            displayWidth: rendered.width,
            displayHeight: rendered.height,
            pageHeightPt,
            scale,
          }
          cacheRef.current.set(key, entry)
          bump((n) => n + 1)
          return entry
        } catch {
          return null
        } finally {
          inflightRef.current.delete(key)
        }
      })()

      inflightRef.current.set(key, promise)
      return promise
    },
    [enabled, rotation],
  )

  const getCached = useCallback(
    (pageIndex: number, scale: number): CachedPage | undefined => {
      return cacheRef.current.get(pageCacheKey(pageIndex, scale, rotation))
    },
    [rotation],
  )

  useEffect(() => {
    invalidateAll()
  }, [rotation, invalidateAll])

  return useMemo(
    () => ({
      loadPage,
      getCached,
      invalidateAll,
      evictExcept,
    }),
    [evictExcept, getCached, invalidateAll, loadPage],
  )
}
