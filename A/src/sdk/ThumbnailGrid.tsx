import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Loader2 } from 'lucide-react'
import { ThumbnailCanvas } from './ThumbnailCanvas'
import { getPdfiumClient } from './lib/pdfiumClient'
import type { Rotation } from './lib/pdfiumTypes'
import { useEditorStore, pageRefKey, type PageRef } from './stores/editorStore'

interface ThumbnailGridProps {
  onReorder: (fromIndex: number, toIndex: number) => void
}

interface ThumbnailItemProps {
  id: string
  displayIndex: number
  pageRef: PageRef
  rotation: Rotation
  bitmap: ImageBitmap | null
  isLoading: boolean
  isSelected: boolean
  editorZoom: number
  onSelect: (ref: PageRef) => void
}

function ThumbnailItem({
  id,
  displayIndex,
  pageRef,
  rotation,
  bitmap,
  isLoading,
  isSelected,
  editorZoom,
  onSelect,
}: ThumbnailItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const thumbWidth = Math.round(140 * editorZoom)
  const thumbHeight = bitmap
    ? Math.round((bitmap.height / bitmap.width) * thumbWidth)
    : Math.round(180 * editorZoom)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center"
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onSelect(pageRef)
        }}
        className={`relative overflow-hidden rounded-md bg-white shadow-sm ring-2 transition ${
          isSelected ? 'ring-accent' : 'ring-slate-200 hover:ring-slate-300'
        }`}
        style={{ width: thumbWidth, height: thumbHeight }}
      >
        {bitmap && <ThumbnailCanvas bitmap={bitmap} className="h-full w-full object-contain" />}
        {isLoading && !bitmap && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        )}
        {rotation !== 0 && (
          <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
            {rotation}°
          </span>
        )}
      </button>
      <span className="mt-1.5 text-xs font-medium text-slate-600">Page {displayIndex + 1}</span>
    </div>
  )
}

export function ThumbnailGrid({ onReorder }: ThumbnailGridProps) {
  const pageOrder = useEditorStore((s) => s.pageOrder)
  const rotations = useEditorStore((s) => s.rotations)
  const selectedKeys = useEditorStore((s) => s.selectedKeys)
  const editorZoom = useEditorStore((s) => s.editorZoom)
  const selectionMode = useEditorStore((s) => s.selectionMode)
  const previewRevision = useEditorStore((s) => s.previewRevision)
  const previewSyncing = useEditorStore((s) => s.previewSyncing)
  const toggleSelect = useEditorStore((s) => s.toggleSelect)
  const selectOnly = useEditorStore((s) => s.selectOnly)

  const [bitmaps, setBitmaps] = useState<Record<string, ImageBitmap>>({})
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())
  const inflightRef = useRef(new Set<string>())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const sortableIds = pageOrder.map((ref) => ref.instanceId)

  const loadThumbnail = useCallback(
    async (displayIndex: number, ref: PageRef, revision: number) => {
      const cacheKey = `${revision}:${ref.instanceId}`
      if (inflightRef.current.has(cacheKey)) {
        return
      }

      inflightRef.current.add(cacheKey)
      setLoadingKeys((prev) => new Set(prev).add(cacheKey))

      try {
        const client = getPdfiumClient()
        const scale = 0.2 * editorZoom
        // Rotation is baked into the preview PDF via pdf-lib; do not pass it again here.
        const bitmap = await client.getThumbnail(displayIndex, scale, 0)
        if (revision !== useEditorStore.getState().previewRevision) {
          bitmap.close()
          return
        }
        setBitmaps((prev) => ({ ...prev, [cacheKey]: bitmap }))
      } catch {
        // Thumbnail failed — leave placeholder.
      } finally {
        inflightRef.current.delete(cacheKey)
        setLoadingKeys((prev) => {
          const next = new Set(prev)
          next.delete(cacheKey)
          return next
        })
      }
    },
    [editorZoom],
  )

  useEffect(() => {
    setBitmaps({})
    inflightRef.current.clear()
    setLoadingKeys(new Set())
  }, [previewRevision])

  useEffect(() => {
    if (previewSyncing || previewRevision === 0) {
      return
    }

    pageOrder.forEach((ref, displayIndex) => {
      void loadThumbnail(displayIndex, ref, previewRevision)
    })
  }, [pageOrder, previewRevision, previewSyncing, loadThumbnail, editorZoom])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    const fromIndex = sortableIds.indexOf(String(active.id))
    const toIndex = sortableIds.indexOf(String(over.id))
    if (fromIndex >= 0 && toIndex >= 0) {
      onReorder(fromIndex, toIndex)
    }
  }

  function handleSelect(ref: PageRef) {
    if (selectionMode) {
      toggleSelect(ref)
    } else {
      selectOnly(ref)
    }
  }

  if (pageOrder.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">No pages in document.</p>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {pageOrder.map((ref, displayIndex) => {
            const rotation = rotations[pageRefKey(ref)] ?? 0
            const cacheKey = `${previewRevision}:${ref.instanceId}`

            return (
              <ThumbnailItem
                key={ref.instanceId}
                id={ref.instanceId}
                displayIndex={displayIndex}
                pageRef={ref}
                rotation={rotation}
                bitmap={previewSyncing ? null : (bitmaps[cacheKey] ?? null)}
                isLoading={previewSyncing || loadingKeys.has(cacheKey)}
                isSelected={selectedKeys.includes(pageRefKey(ref))}
                editorZoom={editorZoom}
                onSelect={handleSelect}
              />
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
