import { useCallback, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { isWasmSupported, PdfViewer } from './sdk'

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<{ url: string; title: string } | null>(null)

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const url = URL.createObjectURL(file)
    setSelected({ url, title: file.name })
    event.target.value = ''
  }, [])

  const handleClose = useCallback(() => {
    if (selected?.url.startsWith('blob:')) {
      URL.revokeObjectURL(selected.url)
    }
    setSelected(null)
  }, [selected])

  if (!isWasmSupported()) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-red-600">
          WebAssembly is not available in this browser.
        </p>
      </main>
    )
  }

  if (selected) {
    return (
      <div className="h-full min-h-screen">
        <PdfViewer url={selected.url} title={selected.title} onClose={handleClose} />
      </div>
    )
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800">PDF Viewer SDK</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Phase 2 viewer — continuous scroll, zoom, fit modes, page navigation, and selectable
          text layer.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        <FileUp className="h-4 w-4" />
        Import PDF
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </main>
  )
}

export default App
