import { useCallback } from 'react'
import { EditorToolbar } from './EditorToolbar'
import { ThumbnailGrid } from './ThumbnailGrid'
import { useEditorStore } from './stores/editorStore'

export function EditorView() {
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot)
  const reorderPages = useEditorStore((s) => s.reorderPages)

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      pushSnapshot()
      reorderPages(fromIndex, toIndex)
    },
    [pushSnapshot, reorderPages],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorToolbar />
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
        <ThumbnailGrid onReorder={handleReorder} />
      </div>
    </div>
  )
}
