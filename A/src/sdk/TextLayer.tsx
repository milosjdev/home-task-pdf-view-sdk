import type { TextRun } from './lib/pdfiumTypes'

interface TextLayerProps {
  runs: TextRun[]
  pageHeightPt: number
  scale: number
  displayWidth: number
  displayHeight: number
}

export function TextLayer({
  runs,
  pageHeightPt,
  scale,
  displayWidth,
  displayHeight,
}: TextLayerProps) {
  if (runs.length === 0) {
    return null
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 overflow-hidden"
      style={{ width: displayWidth, height: displayHeight }}
      aria-hidden
    >
      {runs.map((run, index) => {
        const left = run.x * scale
        const top = (pageHeightPt - run.y - run.height) * scale
        const width = Math.max(run.width * scale, 1)
        const height = Math.max(run.height * scale, 1)

        return (
          <span
            key={`${index}-${run.x}-${run.y}`}
            className="absolute whitespace-pre text-transparent selection:bg-indigo-200/80 selection:text-transparent"
            style={{
              left,
              top,
              width,
              height,
              fontSize: Math.max(height, 8),
              lineHeight: 1,
            }}
          >
            {run.text}
          </span>
        )
      })}
    </div>
  )
}
