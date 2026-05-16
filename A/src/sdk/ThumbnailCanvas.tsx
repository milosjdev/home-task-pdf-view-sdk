import { useEffect, useRef } from 'react'

interface ThumbnailCanvasProps {
  bitmap: ImageBitmap
  className?: string
}

export function ThumbnailCanvas({ bitmap, className }: ThumbnailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap])

  return <canvas ref={canvasRef} className={className} />
}
