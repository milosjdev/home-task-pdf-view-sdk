# Architecture — PDF Viewer SDK (MVP)

This document describes how the embeddable viewer/editor is structured, why those choices were made, and the main tradeoffs. It accompanies the ASCII diagram in [`diagram.txt`](./diagram.txt).

---

## Component diagram (ASCII)

See [`diagram.txt`](./diagram.txt) for the full diagram. At a high level:

- **Host app** (`src/App.tsx` today) mounts `<PdfViewer url={…} />` and owns file lifecycle (`URL.createObjectURL` / revoke).
- **`PdfViewer`** toggles **view** vs **edit**, wires loading/export/print, and hosts **`ViewerToolbar`** plus either **`DocumentScroller`** / **`SinglePageView`** or **`EditorView`**.
- **Rendering** flows from React → **`PdfiumClient`** (main thread) → **`postMessage`** → **`pdfium.worker.ts`** → **`pdfiumEngine.ts`** (PDFium WASM + **`RangePdfSource`** for HTTP Range / streaming).
- **Editing** mutates **`editorStore`**; **`pdf-lib`** (`lib/pdfEditor.ts`) merges/rotates/reorders pages from **`sourceDocs`**; **`useEditorPreview`** rebuilds a merged PDF and syncs the worker via **`OPEN_BYTES`** when needed.
- **State** lives in two Zustand stores: **`viewerStore`** (navigation, zoom, load phases) and **`editorStore`** (page order, rotations, undo/redo, clipboard).

---

## State: two Zustand stores

### `viewerStore`

Holds everything needed to **navigate and present** a document: current page, total pages, zoom, fit mode, scroll mode, rotation, view/edit mode, document URL/title, loading phases (WASM vs bytes), byte progress, and per-page dimensions used for layout/scaling.

The viewer side is intentionally **oriented around read-mostly UI state** and coarse-grained updates from the worker (page count, progress callbacks).

### `editorStore`

Holds **editable structure**: `pageOrder` as `PageRef[]` (`docId`, `originalIndex`, `instanceId`), `rotations`, selection, clipboard, undo/redo stacks, and `sourceDocs` (per-document `Uint8Array`). Undo/redo snapshots capture **`{ pageOrder, rotations }` only**, not full PDF buffers—keeping memory bounded and operations cheap.

### Why split?

- **Different lifecycles**: Viewer state resets per open document; editor state is initialized from that document but evolves independently (reorder, delete, multi-doc import).
- **Different consumers**: Continuous scroll and thumbnails rarely need the full editor graph; the toolbar and export path need editor state without dragging viewer subscriptions through Context.
- **Clear boundaries**: Export (`applyEditsAndExport`) takes `sourceDocs` + editor snapshot; the viewer can stay agnostic beyond “document ready” and preview revision bumps.

### Why Zustand instead of React Context?

- **Fine-grained subscriptions**: Components select slices (`useViewerStore(s => s.zoom)`) without re-rendering the whole tree.
- **Minimal boilerplate** for an MVP SDK: no provider nesting for every host app.
- **Store-as-module pattern**: `PdfiumClient` singleton and hooks coexist cleanly; effects can read `getState()` when avoiding stale closures.

### Why undo snapshots are scoped

Full PDF buffers are large. Storing **only page order + rotation maps** keeps undo/redo **O(pages)** in memory while **`sourceDocs`** retain the immutable inputs needed to materialize any snapshot at export time.

---

## Client-side only

- **SDK boundary**: The host passes a **`url`** or **`File`**; persistence, auth, and indexing stay outside the component.
- **Deployment**: Static hosting + `Accept-Ranges` / `206 Partial Content` is enough for linearized PDFs; no server-side PDF parsing is required for the MVP assessment rubric.
- **Privacy**: Bytes stay in-browser unless the host uploads them elsewhere.

---

## Tradeoffs

| Topic | Choice | Notes |
|--------|--------|--------|
| **PDFium WASM vs MuPDF WASM** | PDFium (`@embedpdf/pdfium`, MIT-friendly packaging for this stack) | MuPDF’s licensing is often AGPL for the full toolkit—problematic for many proprietary hosts. |
| **PDFium WASM vs PDF.js** | PDFium WASM | Rubric requires **WebAssembly** rendering; PDF.js is JS canvas-based and would not satisfy that constraint as-is. |
| **Worker vs main-thread WASM** | Dedicated worker | Keeps decoding/rasterization off the UI thread; avoids jank during zoom/scroll. Cost: structured cloning / transfer discipline for `ImageData` and buffers. |
| **pdf-lib vs PDFium for export** | **pdf-lib** for merge/rotate/reorder | Pure JS, **`copyPages`** preserves vectors where possible; re-encoding everything through PDFium would be heavier and risk fidelity/regression for this MVP. |
| **Virtualized scroll vs render-all** | Visible window + neighbor prefetch (`DocumentScroller` + `IntersectionObserver`) | Bounds memory for 100+ page files; tradeoff is careful coordination with cache eviction (`evictExcept`) and reload tokens after cache invalidation. |

---

## Loading & linearization (Phase 3 summary)

- **`RangePdfSource`** probes `HEAD`, uses **`Range`** reads when supported, otherwise falls back to a single `fetch` stream (blob URLs avoid double-buffering in `probe`).
- **`pdfiumEngine.openDocument`** bumps a WASM buffer until **`MIN_BYTES_BEFORE_OPEN`** (128 KB), then tries **`FPDF_LoadMemDocument`** so linearized PDFs can show page 1 early.
- **Progress UI**: `viewerStore` maps WASM progress into ~0–35% of the bar and byte fetch into ~35–100%; toolbar **Quick Download** can remain a raw `<a download>` until the editor has full bytes, then switch to **`applyEditsAndExport`**.

---

## If I had one more day

1. **ResizeObserver** on the scroll container so fit-to-width/trackpad zoom reflows without relying on incidental parent re-renders.
2. **Automated tests** (Vitest + Playwright): open sample PDF, assert first canvas pixel / network WASM MIME / worker thread in performance trace hooks where feasible.
3. **Annotation MVP** (sticky note / highlight using PDFium annotation APIs) behind a feature flag.
4. **Full Phase 6 demo** (`src/demo/` screen with file table + dropzone + seeded `public/samples/`).
5. **Thumbnail disk cache** (`idb-keyval` or similar) for huge documents to speed second opens.
6. **Accessibility**: keyboard page navigation, focus trap in viewer, live region for loading/errors.
7. **Structured logging** for worker failures (last PDFium error codes surfaced to `viewerStore.error`).
8. **Bundle split**: lazy-load editor chunk so view-only embeds stay smaller.

---

## Key files (reference)

| Area | Location |
|------|-----------|
| Public API | `src/sdk/index.ts` |
| Shell component | `src/sdk/PdfViewer.tsx` |
| Worker entry | `src/sdk/workers/pdfium.worker.ts` |
| PDFium + streaming | `src/sdk/workers/pdfiumEngine.ts`, `rangePdfSource.ts` |
| Main-thread bridge | `src/sdk/lib/pdfiumClient.ts` |
| Export / download | `src/sdk/lib/pdfEditor.ts`, `print.ts` |
| Stores | `src/sdk/stores/viewerStore.ts`, `editorStore.ts` |
| Preview sync | `src/sdk/hooks/useEditorPreview.ts` |
