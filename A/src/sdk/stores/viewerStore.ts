import { create } from 'zustand'
import type { Rotation } from '../lib/pdfiumTypes'

export type FitMode = 'none' | 'width' | 'viewport'
export type ScrollMode = 'continuous' | 'single'
export type ViewerMode = 'view' | 'edit'
export type LoadPhase = 'idle' | 'wasm' | 'bytes' | 'ready'

export interface DocSource {
  url: string
  title: string
}

export interface PageDimensions {
  width: number
  height: number
}

interface ViewerState {
  currentPage: number
  totalPages: number
  zoom: number
  fitMode: FitMode
  scrollMode: ScrollMode
  rotation: Rotation
  mode: ViewerMode
  docSource: DocSource | null
  pageDimensions: Record<number, PageDimensions>
  isDocumentReady: boolean
  isLoading: boolean
  loadProgress: number
  loadPhase: LoadPhase
  wasmProgress: number
  byteProgress: number
  bytesLoaded: number
  bytesTotal: number | null
  isFullyDownloaded: boolean
  error: string | null

  setCurrentPage: (page: number) => void
  setTotalPages: (total: number) => void
  setZoom: (zoom: number) => void
  adjustZoom: (delta: number) => void
  setFitMode: (fitMode: FitMode) => void
  setScrollMode: (scrollMode: ScrollMode) => void
  toggleScrollMode: () => void
  setRotation: (rotation: Rotation) => void
  setMode: (mode: ViewerMode) => void
  toggleMode: () => void
  setDocSource: (doc: DocSource | null) => void
  setPageDimensions: (pageIndex: number, dimensions: PageDimensions) => void
  setLoading: (isLoading: boolean, progress?: number) => void
  setLoadPhase: (phase: LoadPhase) => void
  setWasmProgress: (progress: number) => void
  setByteProgress: (progress: number, loaded: number, total: number | null) => void
  setFullyDownloaded: (downloaded: boolean) => void
  setError: (error: string | null) => void
  setDocumentReady: (ready: boolean) => void
  reset: () => void
}

const DEFAULT_PAGE: PageDimensions = { width: 612, height: 792 }

const initialState = {
  currentPage: 1,
  totalPages: 0,
  zoom: 1,
  fitMode: 'width' as FitMode,
  scrollMode: 'continuous' as ScrollMode,
  rotation: 0 as Rotation,
  mode: 'view' as ViewerMode,
  docSource: null,
  pageDimensions: {} as Record<number, PageDimensions>,
  isDocumentReady: false,
  isLoading: false,
  loadProgress: 0,
  loadPhase: 'idle' as LoadPhase,
  wasmProgress: 0,
  byteProgress: 0,
  bytesLoaded: 0,
  bytesTotal: null as number | null,
  isFullyDownloaded: false,
  error: null,
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...initialState,

  setCurrentPage: (page) => {
    const total = get().totalPages
    const clamped = total > 0 ? Math.min(Math.max(1, page), total) : Math.max(1, page)
    set({ currentPage: clamped })
  },

  setTotalPages: (total) => set({ totalPages: total }),

  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)), fitMode: 'none' }),

  adjustZoom: (delta) => {
    const next = Math.min(4, Math.max(0.25, get().zoom + delta))
    set({ zoom: next, fitMode: 'none' })
  },

  setFitMode: (fitMode) => set({ fitMode }),

  setScrollMode: (scrollMode) => set({ scrollMode }),

  toggleScrollMode: () =>
    set((state) => ({
      scrollMode: state.scrollMode === 'continuous' ? 'single' : 'continuous',
    })),

  setRotation: (rotation) => set({ rotation }),

  setMode: (mode) => set({ mode }),

  toggleMode: () =>
    set((state) => ({ mode: state.mode === 'view' ? 'edit' : 'view' })),

  setDocSource: (doc) => set({ docSource: doc }),

  setPageDimensions: (pageIndex, dimensions) =>
    set((state) => ({
      pageDimensions: { ...state.pageDimensions, [pageIndex]: dimensions },
    })),

  setLoading: (isLoading, progress = 0) =>
    set({ isLoading, loadProgress: progress, ...(isLoading ? { error: null } : {}) }),

  setLoadPhase: (loadPhase) => set({ loadPhase }),

  setWasmProgress: (wasmProgress) =>
    set({
      wasmProgress,
      loadPhase: 'wasm',
      loadProgress: wasmProgress * 0.35,
    }),

  setByteProgress: (byteProgress, bytesLoaded, bytesTotal) =>
    set({
      byteProgress,
      bytesLoaded,
      bytesTotal,
      loadPhase: 'bytes',
      loadProgress: 0.35 + byteProgress * 0.65,
    }),

  setFullyDownloaded: (isFullyDownloaded) =>
    set({
      isFullyDownloaded,
      loadPhase: isFullyDownloaded ? 'ready' : get().loadPhase,
      loadProgress: isFullyDownloaded ? 1 : get().loadProgress,
      isLoading: isFullyDownloaded ? false : get().isLoading,
    }),

  setError: (error) => set({ error, isLoading: false, loadPhase: 'idle' }),

  setDocumentReady: (ready) =>
    set({
      isDocumentReady: ready,
      ...(ready ? { isLoading: false } : {}),
    }),

  reset: () => set({ ...initialState }),
}))

export function getPageDimensions(
  pageDimensions: Record<number, PageDimensions>,
  pageIndex: number,
  rotation: Rotation,
): PageDimensions {
  const base = pageDimensions[pageIndex] ?? DEFAULT_PAGE
  if (rotation === 90 || rotation === 270) {
    return { width: base.height, height: base.width }
  }
  return base
}
