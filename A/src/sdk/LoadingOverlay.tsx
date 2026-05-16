interface LoadingOverlayProps {
  phase: 'wasm' | 'bytes'
  progress: number
  sublabel?: string
}

export function LoadingOverlay({ phase, progress, sublabel }: LoadingOverlayProps) {
  const percent = Math.round(progress * 100)
  const detail =
    phase === 'wasm'
      ? 'Initializing PDFium WebAssembly…'
      : 'Fetching document bytes…'

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/90 backdrop-blur-sm">
      <div className="w-full max-w-sm px-6 text-center">
        <p className="text-base font-medium text-slate-800">Loading</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
        {sublabel && <p className="mt-1 text-xs tabular-nums text-slate-400">{sublabel}</p>}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-slate-500">{percent}%</p>
      </div>
    </div>
  )
}
