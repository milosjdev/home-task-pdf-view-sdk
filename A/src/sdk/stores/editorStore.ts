import { create } from 'zustand'
import type { Rotation } from '../lib/pdfiumTypes'

export interface PageRef {
  docId: string
  originalIndex: number
  /** Unique per slot in pageOrder (duplicates after paste get new ids). */
  instanceId: string
}

function newInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createPageRef(docId: string, originalIndex: number): PageRef {
  return { docId, originalIndex, instanceId: newInstanceId() }
}

export interface EditorSnapshot {
  pageOrder: PageRef[]
  rotations: Record<string, Rotation>
}

interface EditorState {
  pageOrder: PageRef[]
  rotations: Record<string, Rotation>
  selectedKeys: string[]
  clipboard: PageRef[]
  undoStack: EditorSnapshot[]
  redoStack: EditorSnapshot[]
  sourceDocs: Record<string, Uint8Array>
  editorZoom: number
  selectionMode: boolean
  isInitialized: boolean
  /** Bumped when the worker preview PDF matches current pageOrder + rotations. */
  previewRevision: number
  previewSyncing: boolean

  initFromDocument: (docId: string, pageCount: number, pdfBytes: Uint8Array) => void
  reset: () => void
  getRotation: (ref: PageRef) => Rotation
  setRotation: (ref: PageRef, rotation: Rotation) => void
  toggleSelect: (ref: PageRef) => void
  selectOnly: (ref: PageRef) => void
  clearSelection: () => void
  selectAll: () => void
  isSelected: (ref: PageRef) => boolean
  deleteSelected: () => void
  rotateSelected: (delta: 90 | -90) => void
  reorderPages: (fromIndex: number, toIndex: number) => void
  setPageOrder: (order: PageRef[]) => void
  addImportedDocument: (docId: string, pdfBytes: Uint8Array, pageCount: number) => void
  copySelected: () => void
  pastePages: () => void
  undo: () => void
  redo: () => void
  adjustEditorZoom: (delta: number) => void
  setEditorZoom: (zoom: number) => void
  toggleSelectionMode: () => void
  pushSnapshot: () => void
  setPreviewSyncing: (syncing: boolean) => void
  bumpPreviewRevision: () => void
}

/** Stable key for selection, rotation, and per-instance editor state. */
export function pageRefKey(ref: PageRef): string {
  return ref.instanceId
}

const initialState = {
  pageOrder: [] as PageRef[],
  rotations: {} as Record<string, Rotation>,
  selectedKeys: [] as string[],
  clipboard: [] as PageRef[],
  undoStack: [] as EditorSnapshot[],
  redoStack: [] as EditorSnapshot[],
  sourceDocs: {} as Record<string, Uint8Array>,
  editorZoom: 1,
  selectionMode: false,
  isInitialized: false,
  previewRevision: 0,
  previewSyncing: false,
}

function cloneSnapshot(state: EditorState): EditorSnapshot {
  return {
    pageOrder: state.pageOrder.map((ref) => ({ ...ref })),
    rotations: { ...state.rotations },
  }
}

function applySnapshot(snapshot: EditorSnapshot): Partial<EditorState> {
  return {
    pageOrder: snapshot.pageOrder.map((ref) => ({ ...ref })),
    rotations: { ...snapshot.rotations },
    selectedKeys: [],
    redoStack: [],
  }
}

function normalizeRotation(value: number): Rotation {
  const normalized = ((value % 360) + 360) % 360
  if (normalized === 90) {
    return 90
  }
  if (normalized === 180) {
    return 180
  }
  if (normalized === 270) {
    return 270
  }
  return 0
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  initFromDocument: (docId, pageCount, pdfBytes) => {
    const pageOrder: PageRef[] = Array.from({ length: pageCount }, (_, i) =>
      createPageRef(docId, i),
    )
    set({
      ...initialState,
      pageOrder,
      sourceDocs: { [docId]: pdfBytes },
      isInitialized: true,
    })
  },

  reset: () => set({ ...initialState }),

  getRotation: (ref) => get().rotations[pageRefKey(ref)] ?? 0,

  setRotation: (ref, rotation) => {
    const key = pageRefKey(ref)
    set((state) => ({
      rotations: { ...state.rotations, [key]: rotation },
    }))
  },

  toggleSelect: (ref) => {
    const key = pageRefKey(ref)
    set((state) => {
      const selected = new Set(state.selectedKeys)
      if (selected.has(key)) {
        selected.delete(key)
      } else {
        selected.add(key)
      }
      return { selectedKeys: [...selected] }
    })
  },

  selectOnly: (ref) => set({ selectedKeys: [pageRefKey(ref)] }),

  clearSelection: () => set({ selectedKeys: [] }),

  selectAll: () =>
    set((state) => ({
      selectedKeys: state.pageOrder.map((ref) => pageRefKey(ref)),
    })),

  isSelected: (ref) => get().selectedKeys.includes(pageRefKey(ref)),

  deleteSelected: () => {
    const state = get()
    if (state.selectedKeys.length === 0) {
      return
    }
    get().pushSnapshot()
    const selected = new Set(state.selectedKeys)
    const rotations = { ...state.rotations }
    for (const key of selected) {
      delete rotations[key]
    }
    set({
      pageOrder: state.pageOrder.filter((ref) => !selected.has(pageRefKey(ref))),
      rotations,
      selectedKeys: [],
    })
  },

  rotateSelected: (delta) => {
    const state = get()
    if (state.selectedKeys.length === 0) {
      return
    }
    get().pushSnapshot()
    const selected = new Set(state.selectedKeys)
    const rotations = { ...state.rotations }
    for (const ref of state.pageOrder) {
      const key = pageRefKey(ref)
      if (!selected.has(key)) {
        continue
      }
      const current = rotations[key] ?? 0
      rotations[key] = normalizeRotation(current + delta)
    }
    set({ rotations })
  },

  reorderPages: (fromIndex, toIndex) => {
    const state = get()
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return
    }
    if (fromIndex >= state.pageOrder.length || toIndex >= state.pageOrder.length) {
      return
    }
    const next = [...state.pageOrder]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    set({ pageOrder: next })
  },

  setPageOrder: (order) => set({ pageOrder: order }),

  addImportedDocument: (docId, pdfBytes, pageCount) => {
    get().pushSnapshot()
    const newRefs: PageRef[] = Array.from({ length: pageCount }, (_, i) =>
      createPageRef(docId, i),
    )
    set((state) => ({
      pageOrder: [...state.pageOrder, ...newRefs],
      sourceDocs: { ...state.sourceDocs, [docId]: pdfBytes },
      selectedKeys: [],
    }))
  },

  copySelected: () => {
    const state = get()
    const selected = new Set(state.selectedKeys)
    const clipboard = state.pageOrder.filter((ref) => selected.has(pageRefKey(ref)))
    set({
      clipboard: clipboard.map((ref) => ({
        docId: ref.docId,
        originalIndex: ref.originalIndex,
        instanceId: ref.instanceId,
      })),
    })
  },

  pastePages: () => {
    const state = get()
    if (state.clipboard.length === 0) {
      return
    }
    get().pushSnapshot()
    const pasted = state.clipboard.map((ref) => createPageRef(ref.docId, ref.originalIndex))
    set((state) => ({
      pageOrder: [...state.pageOrder, ...pasted],
      selectedKeys: pasted.map((ref) => pageRefKey(ref)),
    }))
  },

  undo: () => {
    const state = get()
    if (state.undoStack.length === 0) {
      return
    }
    const previous = state.undoStack[state.undoStack.length - 1]
    const current = cloneSnapshot(state)
    set({
      ...applySnapshot(previous),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
    })
  },

  redo: () => {
    const state = get()
    if (state.redoStack.length === 0) {
      return
    }
    const next = state.redoStack[state.redoStack.length - 1]
    const current = cloneSnapshot(state)
    set({
      ...applySnapshot(next),
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, current],
    })
  },

  adjustEditorZoom: (delta) => {
    const next = Math.min(2, Math.max(0.5, get().editorZoom + delta))
    set({ editorZoom: next })
  },

  setEditorZoom: (zoom) => set({ editorZoom: Math.min(2, Math.max(0.5, zoom)) }),

  toggleSelectionMode: () => set((state) => ({ selectionMode: !state.selectionMode })),

  pushSnapshot: () => {
    const snapshot = cloneSnapshot(get())
    set((state) => ({
      undoStack: [...state.undoStack, snapshot],
      redoStack: [],
    }))
  },

  setPreviewSyncing: (previewSyncing) => set({ previewSyncing }),

  bumpPreviewRevision: () =>
    set((state) => ({ previewRevision: state.previewRevision + 1 })),
}))
