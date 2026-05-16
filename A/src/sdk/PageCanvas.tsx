import { useEffect, useRef } from 'react'

interface PageCanvasProps {
  imageData: ImageData | null
  displayWidth?: number
  displayHeight?: number
  className?: string
}

export function PageCanvas({
  imageData,
  displayWidth,
  displayHeight,
  className,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageData) {
      return
    }

    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.putImageData(imageData, 0, 0)
  }, [imageData])

  const cssWidth = displayWidth ?? imageData?.width
  const cssHeight = displayHeight ?? imageData?.height

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: cssWidth ? `${cssWidth}px` : undefined,
        height: cssHeight ? `${cssHeight}px` : undefined,
        display: imageData ? 'block' : 'none',
      }}
    />
  )
}
