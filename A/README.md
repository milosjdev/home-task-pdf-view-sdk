# PDF Viewer SDK (MVP)

Client-side PDF viewer and editor delivered as an embeddable React component, with a demo host app.

## Tech stack

- Vite + React 18 + TypeScript
- `@embedpdf/pdfium` — PDFium compiled to WebAssembly (rendering)
- `pdf-lib` — edit/export operations
- Zustand — `viewerStore` + `editorStore`
- Tailwind CSS + lucide-react
- `@dnd-kit/sortable`, `react-dropzone`
- `vite-plugin-wasm` + `vite-plugin-top-level-await`

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Use **Import PDF** to load a file from your device; page 1 renders via the PDFium WebAssembly worker.
