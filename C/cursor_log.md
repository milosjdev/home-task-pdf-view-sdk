# PDF viewer SDK development plan
_Exported on 5/15/2026 at 13:04:45 PDT from Cursor (3.4.17)_

---

**User**

## Goal

Build a **PDF Viewer SDK** delivered as an embeddable React component + a demo host page. Inspired by tools like Apryse / PSPDFKit / Nutrient. MVP must satisfy the assessment rubric, **including WebAssembly rendering (mandatory)**.

## Tech stack (locked — do not substitute)

- **Framework:** Vite + React 18 + TypeScript
- **PDF rendering:** `@embedpdf/pdfium` — **PDFium compiled to WebAssembly** (MIT). This satisfies the mandatory WASM requirement.
- **PDF editing/export:** `pdf-lib` (delete, reorder, rotate, merge, extract, export)
- **State:** Zustand (separate `viewerStore` + `editorStore`)
- **Styling:** Tailwind CSS + lucide-react icons
- **Drag-and-drop reorder:** `@dnd-kit/sortable`
- **File upload UI:** `react-dropzone`
- **WASM in Vite:** `vite-plugin-wasm` + `vite-plugin-top-level-await`

> Do **not** add: Redux, Next.js, server-side anything, auth, a database. **This is a client-side SDK.** Sample PDFs live in `public/`; uploads use `URL.createObjectURL` on the in-browser `File` object.

## Repo layout (deliverable D)

```
pdf-viewer-sdk/
├── A/                                  # MVP code (Vite app)
│   ├── src/
│   │   ├── sdk/                        # the SDK itself
│   │   │   ├── PdfViewer.tsx           # public component: { url|file, onClose }
│   │   │   ├── ViewerToolbar.tsx
│   │   │   ├── EditorToolbar.tsx
│   │   │   ├── PageCanvas.tsx          # PDFium-WASM render target
│   │   │   ├── ThumbnailGrid.tsx       # editor 4-col grid
│   │   │   ├── workers/
│   │   │   │   └── pdfium.worker.ts    # PDFium-WASM in a Web Worker
│   │   │   ├── stores/
│   │   │   │   ├── viewerStore.ts
│   │   │   │   └── editorStore.ts
│   │   │   ├── lib/
│   │   │   │   ├── pdfiumClient.ts     # main-thread API → worker bridge
│   │   │   │   ├── pdfEditor.ts        # pdf-lib operations
│   │   │   │   └── print.ts
│   │   │   └── index.ts                # public exports
│   │   ├── demo/
│   │   │   ├── App.tsx                 # host file list (screen 1 mock)
│   │   │   ├── FileList.tsx
│   │   │   ├── UploadDropzone.tsx
│   │   │   └── main.tsx
│   │   └── styles.css
│   ├── public/
│   │   └── samples/                    # 1-2 sample PDFs (one 100+ pages)
│   ├── vite.config.ts                  # wasm + top-level-await plugins
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── README.md
├── B/
│   ├── ARCHITECTURE.md
│   └── diagram.txt                     # ASCII component diagram
├── C/
│   ├── PLAN.md                         # this file (saved from Cursor)
│   ├── cursor-transcript.md            # exported from Cursor
│   ├── ai-changes.md
│   └── validation.md
└── README.md                           # root: explains A/B/C
```

## Component diagram (deliverable B)

```
┌──────────────────────────────────────────────────────────────────┐
│                       Demo Host App (src/demo)                   │
│   - File list (mocks screen 1, hard-coded + dropzone uploads)    │
│   - On row click → mounts <PdfViewer url={objectURL|path} />     │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                ┌────────────────▼────────────────┐
                │      PdfViewer (public SDK)     │
                │   mode: 'view' | 'edit'         │
                └────┬──────────────────┬─────────┘
                     │                  │
        ┌────────────▼─────┐   ┌────────▼─────────┐
        │  ViewerToolbar   │   │  EditorToolbar   │
        │ - page nav       │   │ - delete/rotate  │
        │ - zoom/fit       │   │ - import/extract │
        │ - rotate         │   │ - undo/redo      │
        │ - print/download │   │ - copy/paste     │
        └────────┬─────────┘   └────────┬─────────┘
                 │                      │
        ┌────────▼─────────┐   ┌────────▼─────────┐
        │   PageCanvas     │   │  ThumbnailGrid   │
        │ (paints worker   │   │ (@dnd-kit grid)  │
        │  ImageData)      │   │                  │
        └────────┬─────────┘   └────────┬─────────┘
                 │                      │
                 └──────────┬───────────┘
                            │
            ┌───────────────▼────────────────┐
            │   stores/ (Zustand)            │
            │  viewerStore | editorStore     │
            └───────────────┬────────────────┘
                            │
            ┌───────────────▼────────────────┐
            │   lib/pdfiumClient.ts          │
            │   (typed postMessage bridge)   │
            └───────────────┬────────────────┘
                            │ postMessage
            ┌───────────────▼────────────────┐
            │   Web Worker                   │
            │   pdfium.worker.ts             │
            │    - loads pdfium.wasm         │
            │    - fetch with Range          │
            │    - render → ImageData        │
            │    - text/annotations extract  │
            └────────────────────────────────┘

            ┌────────────────────────────────┐
            │   lib/pdfEditor.ts (pdf-lib)   │
            │   - apply edits, export bytes  │
            │   - print via hidden iframe    │
            └────────────────────────────────┘
```

---

## Build plan — phased, deliverable-driven

### Phase 0 — Scaffold
- `npm create vite@latest A -- --template react-ts`
- Install: `@embedpdf/pdfium pdf-lib zustand @dnd-kit/sortable @dnd-kit/core react-dropzone lucide-react tailwindcss postcss autoprefixer vite-plugin-wasm vite-plugin-top-level-await`
- Initialize Tailwind (`npx tailwindcss init -p`), wire `index.css`
- Configure `vite.config.ts`:
  ```ts
  import wasm from 'vite-plugin-wasm';
  import topLevelAwait from 'vite-plugin-top-level-await';
  export default defineConfig({
    plugins: [react(), wasm(), topLevelAwait()],
    worker: { format: 'es', plugins: () => [wasm(), topLevelAwait()] },
    optimizeDeps: { exclude: ['@embedpdf/pdfium'] },
  });
  ```
- Verify `npm run dev` boots blank app at `http://localhost:5173`. **Stop the server** before next AI turn.

### Phase 1 — PDFium-WASM Web Worker — **MANDATORY WASM CORE**
- `sdk/workers/pdfium.worker.ts`:
  - Load PDFium-WASM via `@embedpdf/pdfium` initializer
  - Message protocol:
    - `{ type: 'OPEN', url }` → returns `{ pageCount }`
    - `{ type: 'RENDER_PAGE', pageIndex, scale, rotation }` → returns `ImageData` (transferable)
    - `{ type: 'GET_TEXT', pageIndex }` → returns text runs with positions
    - `{ type: 'GET_THUMBNAIL', pageIndex }` → low-res `ImageBitmap`
  - Uses `fetch()` with implicit Range support — the browser handles Range under the hood for `ReadableStream` consumption
- `sdk/lib/pdfiumClient.ts`: typed Promise wrapper around `postMessage`, multiplexed by `requestId`
- Render page 1 with import button - import PDF from local device
- **Verify in DevTools → Network:** `pdfium.wasm` is fetched with `Content-Type: application/wasm`
- **Verify in DevTools → Performance:** rendering work lives in the worker thread, not Main

### Phase 2 — Viewer MVP (deliverable A.1)
- `sdk/PageCanvas.tsx` — receives rendered `ImageData` from the worker, paints to `<canvas>`
- `sdk/ViewerToolbar.tsx`:
  - `← Go Back` (calls `onClose` prop)
  - Document title
  - `Edit` button (mode toggle)
  - Save / Print icons
  - Page input + total (`[1] / 139`)
  - Zoom `−` / `+`, fit-to-width, fit-to-viewport
  - Scroll-mode toggle (continuous vs single-spread)
  - `⬇ Quick Download` (top-right, accent)
- `sdk/stores/viewerStore.ts`: `{ currentPage, totalPages, zoom, fitMode, scrollMode, rotation, docSource }`
- Continuous scroll: virtualized — render visible page(s) + 1 ahead/behind, evict the rest via IntersectionObserver
- Text layer: invisible positioned `<span>`s for native browser text selection

### Phase 3 — Linearization + loading UI (screen 4)
- Mount: render `Quick Download` button **immediately** (direct `<a href={url} download>` — works before WASM loads)
- Centered `Loading` label + indigo progress bar driven by:
  - WASM module init progress
  - Then byte-fetch progress for the doc
- First page renders as soon as page 1 bytes arrive (PDFium handles linearized PDFs natively via Range requests)
- **Verify Network tab:** multiple `206 Partial Content` responses when scrolling a linearized PDF

### Phase 4 — Editor mode (deliverable A.2)
- Mode toggle in `PdfViewer` — `Edit` button → `mode='edit'`
- `sdk/ThumbnailGrid.tsx`:
  - Worker renders thumbnails at low scale, cached in `Map<pageIndex, ImageBitmap>`
  - 4-column CSS grid, drag-and-drop via `@dnd-kit/sortable`
  - Page number badge below each thumbnail
- `sdk/EditorToolbar.tsx` actions, each dispatching to `editorStore`:
  - `Scan` (stub — opens file dialog)
  - `Import` — file picker, append PDF
  - `Delete Pages` — remove selected from `pageOrder`
  - `Rotate Pages Left` / `Right` — update `rotations` map
  - `Extract Pages` — export selected as new PDF
  - `Undo` / `Redo`
  - Zoom +/− + percentage indicator
  - `Select Area` (selection mode toggle)
  - `Copy Pages` / `Paste Pages`
- `sdk/stores/editorStore.ts`: `{ pageOrder: PageRef[], rotations: Map<PageRef, 0|90|180|270>, selectedPages: Set<PageRef>, clipboard: PageRef[], undoStack, redoStack, sourceDocs: Map<docId, ArrayBuffer> }`
  - `PageRef = { docId, originalIndex }` — supports merged-from-multiple-docs
- Undo/redo snapshots only `{ pageOrder, rotations }` — never full buffers

### Phase 5 — Export + Print (deliverables A.3, A.4)
- `sdk/lib/pdfEditor.ts` (pdf-lib):
  - `applyEditsAndExport(sourceDocs, editorState) → Uint8Array`
  - `PDFDocument.copyPages` for reorder/extract/merge across multiple source docs
  - `page.setRotation(degrees(...))` for rotations
  - Skip deleted pages
  - Output → `Blob` → `URL.createObjectURL` → `<a download>` → `URL.revokeObjectURL` in `finally`
- `Quick Download` = `applyEditsAndExport` → save
- `sdk/lib/print.ts`:
  - Render current PDF blob into hidden `<iframe>`, call `iframe.contentWindow.print()` after `onload`, revoke URL after


**Cursor**

Exploring the workspace, then scaffolding and implementing the PDF Viewer SDK per your specification.


Workspace is empty — building the full PDF Viewer SDK from scratch. Researching `@embedpdf/pdfium` API, then scaffolding the project.


---

**User**

Now Phase 0

---

**Cursor**

Scaffolding Phase 0: Vite + React + TypeScript, dependencies, Tailwind, and WASM plugins.


Tailwind v4 doesn't ship the `init` CLI — installing Tailwind v3 to match the plan's `init -p` workflow, then wiring configs.


Configuring Vite (WASM plugins), Tailwind, and a minimal blank app.


Vite scaffolded React 19; pinning to React 18 per the locked stack.


**Phase 0 is complete.** Here’s what’s in place:

### Scaffold (`pdf-viewer-sdk/A/`)
- **Vite + React 18 + TypeScript** (`npm create vite@latest A -- --template react-ts`)
- **Dependencies installed:** `@embedpdf/pdfium`, `pdf-lib`, `zustand`, `@dnd-kit/*`, `react-dropzone`, `lucide-react`, `vite-plugin-wasm`, `vite-plugin-top-level-await`
- **Tailwind CSS v3** with `tailwind.config.ts`, `postcss.config.js`, and `src/styles.css` (`@tailwind` directives)
- **`vite.config.ts`** — WASM + top-level-await on main and worker bundles; `@embedpdf/pdfium` excluded from `optimizeDeps`

### Verified
- `npm run build` — succeeds
- `npm run dev` — boots at **http://localhost:5173/** (server stopped per plan)

### Layout started
```
pdf-viewer-sdk/
├── A/          # MVP app (configured, blank Tailwind page)
├── README.md   # A/B/C overview
└── A/public/samples/   # placeholder for sample PDFs
```

### Run locally
```bash
cd pdf-viewer-sdk/A
npm run dev
```

You should see a centered “PDF Viewer SDK — Phase 0 scaffold” page.

**Note:** `rollup` and `esbuild` were added as dev deps because Vite 8 + the WASM plugins didn’t resolve them automatically on this machine.

Ready for **Phase 1** (PDFium-WASM Web Worker) when you are.

---

**User**

<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: error
task_id: 111134
title: Start Vite dev server to verify boot
detail: exit_code=4294967295
output_path: C:\Users\Admin\.cursor\projects\e-My-WORK-v-2\terminals\111134.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed).</user_query>

---

**Cursor**

The background **Vite dev server** task ended with exit code `4294967295` because it was **stopped on purpose** after Phase 0 verification — not because the app failed to start.

Before that, it had started cleanly:

- **URL:** http://localhost:5173/
- **Status:** `VITE v8.0.13 ready in 519 ms`

**No follow-up needed** for Phase 0. To run it again:

```bash
cd pdf-viewer-sdk/A
npm run dev
```

Say when you want **Phase 1** (PDFium-WASM worker).

---

**User**

Now Phase 1

---

**Cursor**

Implementing Phase 1: exploring `@embedpdf/pdfium` API and the current project structure.


Implementing the PDFium worker, client bridge, and a minimal import-and-render UI.


**Phase 1 is done.** The PDFium-WASM worker stack is wired up with a minimal import-and-render UI.

### What was added

| File | Role |
|------|------|
| `src/sdk/workers/pdfiumEngine.ts` | PDFium init, `OPEN`, render, text runs, thumbnails |
| `src/sdk/workers/pdfium.worker.ts` | Web Worker message handler + transferable `ImageData` / `ImageBitmap` |
| `src/sdk/lib/pdfiumClient.ts` | Typed `postMessage` bridge with `requestId` multiplexing |
| `src/sdk/lib/pdfiumTypes.ts` | Request/response protocol types |
| `src/sdk/PageCanvas.tsx` | Paints worker `ImageData` on `<canvas>` |
| `src/sdk/index.ts` | Public SDK exports |
| `src/App.tsx` | **Import PDF** → open → render page 1 |

### Worker protocol

- `INIT` → WASM load progress → `{ ready }`
- `OPEN { url }` → `{ pageCount }`
- `RENDER_PAGE { pageIndex, scale, rotation }` → `ImageData` (transferable)
- `GET_TEXT { pageIndex }` → `{ runs: TextRun[] }` with char boxes
- `GET_THUMBNAIL { pageIndex, scale? }` → `ImageBitmap` (transferable)

WASM is loaded from `@embedpdf/pdfium/pdfium.wasm?url` (bundled locally, not CDN).

### Try it

```bash
cd pdf-viewer-sdk/A
npm run dev
```

Open http://localhost:5173 → **Import PDF** → page 1 should render.

### Verify (rubric)

1. **Network:** `pdfium.wasm` with `application/wasm`
2. **Performance:** rendering on the **worker** thread
3. **WASM disabled:** clear error message in the UI

`npm run build` passes. `vite.config.ts` uses `build.target: 'esnext'` so the WASM/top-level-await worker bundle builds cleanly.

Ready for **Phase 2** (full viewer toolbar, stores, scroll modes) when you are.

---

**User**

Now Phase 2

---

**Cursor**

Implementing Phase 2 (Viewer MVP): exploring the codebase, then building stores, toolbar, PdfViewer, virtualization, and text layer.


**Phase 2 (Viewer MVP) is complete.** Here’s what was added:

### New / updated components

| File | Purpose |
|------|---------|
| `sdk/PdfViewer.tsx` | Public viewer: `{ url \| file, title?, onClose? }` |
| `sdk/ViewerToolbar.tsx` | Go Back, title, Edit, Save/Print, page input, zoom, fit, scroll toggle, Quick Download |
| `sdk/stores/viewerStore.ts` | Zustand: page, zoom, fit, scroll, rotation, doc source, dimensions |
| `sdk/DocumentScroller.tsx` | Continuous scroll + `IntersectionObserver` virtualization (±1 page buffer) |
| `sdk/SinglePageView.tsx` | Single-page mode |
| `sdk/PageView.tsx` | Canvas + text layer per page |
| `sdk/TextLayer.tsx` | Invisible `<span>`s for native text selection |
| `sdk/hooks/usePageRenderCache.ts` | Page render cache with eviction |
| `sdk/lib/viewerUtils.ts` | Scale / cache-key helpers |

### Features (A.1 rubric)

- **Navigation:** page field + Enter, scroll sync in continuous mode, jump-to-page scroll
- **Zoom:** − / + (resets fit to manual), percentage display
- **Fit:** fit-to-width, fit-to-viewport
- **Scroll:** continuous ↔ single-page toggle
- **Text layer:** selectable text over each rendered page
- **Virtualization:** only visible pages ±1 are rendered; others evicted from cache
- **Edit:** toggles mode (banner until Phase 4 editor UI)
- **Quick Download:** direct `<a download>` (works before full WASM load)

### Try it

```bash
cd pdf-viewer-sdk/A
npm run dev
```

Import a PDF → full viewer with toolbar. Scroll in continuous mode, try zoom/fit, switch to single-page, select text on a page.

`npm run build` passes.

Ready for **Phase 3** (loading UI + linearization) when you are.

---

**User**

Now Phase 3

---

**Cursor**

Implementing Phase 3: progressive Range fetching, loading UI with WASM + byte progress, and immediate Quick Download. Exploring the current implementation.


Implementing range-based fetching with progressive open, byte-progress worker messages, and a centered loading overlay.


**Phase 3 is complete.** Linearized loading, progressive open, and the loading UI are in place.

### Range-based PDF fetch (`sdk/workers/rangePdfSource.ts`)
- **HTTP URLs:** `HEAD` probe → chunked `Range: bytes=…` requests (256 KB chunks) → **206 Partial Content** in Network tab
- **Blob / local files:** streamed fetch with byte progress (no ranges)
- Progress callbacks: `loaded`, `total`, `progress`

### Progressive open (`pdfiumEngine.ts`)
- Buffers chunks in WASM memory as they arrive
- **Early open** after **128 KB** — tries `FPDF_LoadMemDocument`; on success fires `DOCUMENT_READY` so page 1 can render before the full file arrives
- After full download, **re-opens** with the complete buffer (so later pages work on non-linearized PDFs too)

### Worker / client protocol
- `BYTE_PROGRESS` — byte download progress (keeps OPEN request pending)
- `DOCUMENT_READY` — document parsed; UI can show viewer + render page 1
- `SUCCESS` — full download + reload complete

### Loading UI (`LoadingOverlay.tsx` + `viewerStore`)
- **Centered overlay** with “Loading PDFium WASM” then “Loading document”
- **Indigo progress bar:** WASM ≈ 0–35%, bytes ≈ 35–100%
- KB counter while bytes load
- Overlay hides when first page is ready; **thin top bar** until 100% downloaded

### Quick Download
- `docSource` is set **immediately** on mount (before WASM)
- Toolbar **Quick Download** link works during loading

### Try it
```bash
cd pdf-viewer-sdk/A
npm run dev
```

For **206** responses, serve a linearized PDF from `public/samples/` via URL (Phase 6 demo) or any Range-capable static host. Local **Import PDF** uses blob URLs (progress only, no 206).

`npm run build` passes.

Ready for **Phase 4** (editor mode) when you are.

---

**User**

I have flickering loading issue on pdf viewer.
I think PDF is imported properly.

---

**Cursor**

Investigating loading-state logic that may cause the overlay to flicker.


Identifying several flicker sources: `pageCache` invalidation on every render, StrictMode cleanup calling `reset()`, document reload invalidating renders, and page re-fetch when dimensions update. Fixing these.


The flicker came from a few interacting issues, not from PDF import failing. Here’s what was going wrong and what we changed.

### Root causes

1. **Cache cleared every render** — `usePageRenderCache()` returned a new object each time, so `pageCache` in a `useEffect` dependency re-ran `invalidateAll()` on every frame → pages kept reloading and flashing spinners.

2. **Loading overlay toggling** — Overlay used `isLoading && !isDocumentReady`, but `isLoading` stayed `true` while bytes finished downloading, so state fought with `isDocumentReady`.

3. **Dimension update loop** — `setPageDimensions` after each render changed scale → new cache keys → `refreshVisiblePages` ran again → more loading spinners.

4. **Redundant PDF reopen** — After download, the worker always closed/reopened the document even when the buffer hadn’t grown, briefly breaking active renders.

5. **StrictMode / cleanup** — `reset()` on effect cleanup could flash the UI back to “loading” between mounts.

6. **Canvas hidden while re-fetching** — `isLoading && !cached` hid the page even when an older bitmap was still valid.

### Fixes applied

| Area | Change |
|------|--------|
| `usePageRenderCache` | Memoized return value so deps stay stable |
| `PdfViewer` | Overlay only during `wasm` / `bytes` **before** first page; `setDocumentReady` clears `isLoading`; no `reset()` on load effect cleanup |
| `DocumentScroller` | Stable refs for dimensions/callbacks; generation guard on stale loads; removed dimension updates that retriggered scale |
| `PageView` | Keep previous canvas while reloading; light overlay instead of blanking |
| `pdfiumEngine` | Reopen PDF only when `finalLength > openedAtLength` |

Reload the app and import a PDF again — you should see one loading pass, then a stable viewer with a slim “Downloading remaining bytes…” bar if the file is still streaming.

If anything still flickers, say whether it’s the **full-screen Loading overlay** or **per-page spinners** while scrolling.

---

**User**

Now Phase 4

---

**Cursor**

Implementing Phase 4 (editor mode): exploring the codebase, then building editor store, toolbars, thumbnail grid, and pdf-lib integration.


Implementing the editor store, pdf-lib operations, thumbnail grid with drag-and-drop, and PdfViewer integration.


I introduced invalid `motion` tags in `PdfViewer.tsx` — fixing those and finishing Phase 4 integration.


**Phase 4 — Editor mode** is complete and the project builds successfully.

### What was finished

1. **`PdfViewer` integration**
   - Edit mode renders `<EditorView />` (thumbnail grid + editor toolbar).
   - After the document loads, PDF bytes are fetched and `initFromDocument('main', pageCount, bytes)` runs.
   - `editorStore` resets on load and unmount.
   - Page count in the viewer toolbar stays in sync with editor `pageOrder`.

2. **`ViewerToolbar`**
   - Toggle label is **View** / **Edit**.
   - Zoom, page nav, fit, scroll, save, and print controls are hidden in edit mode (editor has its own toolbar).

3. **Bug fixes**
   - Removed stray `<motion>` JSX typos.
   - Fixed `pdfEditor` `Blob` typing for TypeScript.

4. **`index.ts` exports** — editor store, `EditorView`, `EditorToolbar`, and pdf-lib helpers.

### Editor capabilities

| Feature | Implementation |
|--------|----------------|
| Thumbnail grid | 4-column, drag-and-drop reorder (`@dnd-kit`) |
| Select / multi-select | Click vs selection mode |
| Delete, rotate, undo/redo | `editorStore` + snapshots |
| Copy / paste pages | Clipboard in store |
| Import PDF | Appends pages from new `sourceDocs` entry |
| Extract / Export | `pdf-lib` via `extractPages` / `applyEditsAndExport` |
| Live preview | Debounced merge → `client.openBytes()` refreshes worker doc for thumbnails |

### How to try it

1. `npm run dev` in `pdf-viewer-sdk/A/`
2. Open a PDF → click **Edit**
3. Reorder thumbnails, select pages, rotate, import, then **Export**

`npm run build` passes.

**Next:** Phase 5 (print, save from viewer toolbar, Quick Download with edits applied). Say when you want that started.

---

**User**

After pasting the copied page, the selection tool isn't working properly—for example, selecting original page also highlights copied page.

---

**Cursor**

Selection likely keys pages only by `docId` + `originalIndex`, so pasted copies share the same key as the originals. Tracing how selection and paste are implemented.


Pasted pages reuse the same `docId:originalIndex` key as the originals, so selection and rotations collide. Adding a unique `instanceId` per page in the order.


Adding a unique `instanceId` to each page slot so selection, rotation, and delete target individual instances—not shared `docId:originalIndex` keys.


The bug came from how pages were identified in the editor.

**Cause:** Selection (and rotation/delete) used `pageRefKey` = `docId:originalIndex`. After paste, the copy pointed at the same source page as the original, so both slots shared one key—selecting either highlighted both.

**Fix:** Each slot in `pageOrder` now has a unique `instanceId`. `pageRefKey()` uses that id for selection and per-page rotation. On paste, new refs get fresh `instanceId`s while still referencing the same `docId` / `originalIndex` for export.

You can verify by copying a page, pasting it, then clicking the original and the copy—they should select independently. Rotating or deleting one should no longer affect the other unless both are selected.

---

**User**

On the edit modal, the latest changes aren’t working or showing up correctly in the UI. For example:
- When I try page ordering after rotation 
- When I return Edit modal back

---

**Cursor**

Investigating editor state sync between rotation, reorder, preview rebuild, and view/edit mode switching.


Identifying root causes: thumbnails fetch from the worker before the debounced preview rebuild finishes (wrong page order), and rotation is applied twice (pdf-lib export + PDFium render). Syncing the worker before thumbnails load and keeping view mode in sync when switching modes.


Here’s what was going wrong and what we changed.

### Root causes

1. **Thumbnails loaded before the worker caught up**  
   Reorder/rotate updated Zustand immediately, but thumbnails called `getThumbnail(displayIndex, …)` against the **old** worker document (debounced rebuild ~400ms later). After reorder, index 0 could still show the wrong page.

2. **Rotation applied twice**  
   `applyEditsAndExport` bakes rotation into the PDF, but thumbnails also passed rotation into PDFium → wrong orientation, especially after reorder + rotate.

3. **Edit ↔ View desync**  
   Preview sync only ran while `EditorView` was mounted. Leaving edit stopped updates; coming back remounted the grid against a stale worker. View mode also kept showing the original PDF, not the edited one.

### Fixes

- **`useEditorPreview`** now runs from `PdfViewer` whenever the editor is initialized, and:
  - Rebuilds the worker PDF on every order/rotation change (debounced).
  - Rebuilds **immediately** on first init, and when switching **View ↔ Edit**.
- **`previewRevision` / `previewSyncing`** in the editor store — thumbnails load only after a successful rebuild.
- **Thumbnails** use `getThumbnail(index, scale, 0)` because rotation is already in the merged PDF; cache keys use `previewRevision:instanceId`.
- **View mode** invalidates the page cache when `previewRevision` changes so the reader matches edits.

### What you should see now

1. Rotate → brief loading on thumbs → correct orientation.  
2. Reorder after rotate → order and thumbs match after sync.  
3. Edit → View → Edit → same order, rotation, and thumbs; View shows the edited layout.

If anything still looks off after a specific sequence, describe the steps and we can tighten it further.

---

**User**

Now Phase 5

---

**Cursor**

Reviewing the project plan and current implementation for Phase 5 (print, save, Quick Download).


Implementing Phase 5: export helper, print via hidden iframe, and wiring Save, Print, and Quick Download to apply edits.


**Phase 5 — Export & print** is done. Build passes.

### New / updated modules

**`src/sdk/lib/print.ts`**
- Loads exported PDF bytes in a hidden iframe
- Calls `contentWindow.print()` after load
- Revokes the blob URL and removes the iframe afterward

**`src/sdk/lib/pdfEditor.ts`**
- `exportCurrentDocument()` — uses `applyEditsAndExport` when the editor is initialized; otherwise fetches the original `docSource` URL (works before WASM finishes)
- `downloadCurrentDocument()` — export + download in one step
- `ensurePdfFilename()` — normalizes `.pdf` extension on downloads

### Wired in the UI

| Action | Behavior |
|--------|----------|
| **Quick Download** | Exports current state (including edits) via `pdf-lib`, then downloads |
| **Save** | Same export path as Quick Download |
| **Print** | Exports with edits, then opens the browser print dialog |
| **Editor → Export** | Unchanged (still uses `applyEditsAndExport`) |

Toolbar buttons show **Preparing…** and disable while export/print runs. Errors surface in the red banner at the top of the viewer.

### How to verify

1. Open a PDF → **Quick Download** (works even during loading).
2. Edit (reorder/rotate/delete) → **Quick Download** or **Save** → open the file; edits should be applied.
3. **Print** → browser print dialog with the edited PDF.

Exports are public from `src/sdk/index.ts` (`printPdfBytes`, `exportCurrentDocument`, `downloadCurrentDocument`).


