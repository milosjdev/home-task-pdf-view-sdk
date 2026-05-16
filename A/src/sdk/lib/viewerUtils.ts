import type { Rotation } from './pdfiumTypes'
import type { FitMode, PageDimensions } from '../stores/viewerStore'

export function computeRenderScale(
  pageSize: PageDimensions,
  containerWidth: number,
  containerHeight: number,
  zoom: number,
  fitMode: FitMode,
): number {
  const { width, height } = pageSize
  if (width <= 0 || height <= 0) {
    return zoom
  }

  if (fitMode === 'width' && containerWidth > 0) {
    return (containerWidth / width) * zoom
  }

  if (fitMode === 'viewport' && containerWidth > 0 && containerHeight > 0) {
    return Math.min(containerWidth / width, containerHeight / height) * zoom
  }

  return zoom
}

export function pageCacheKey(
  pageIndex: number,
  scale: number,
  rotation: Rotation,
): string {
  return `${pageIndex}:${scale.toFixed(4)}:${rotation}`
}

export function dimensionsFromRender(
  pixelWidth: number,
  pixelHeight: number,
  scale: number,
  rotation: Rotation,
): PageDimensions {
  let width = pixelWidth / scale
  let height = pixelHeight / scale
  if (rotation === 90 || rotation === 270) {
    ;[width, height] = [height, width]
  }
  return { width, height }
}
