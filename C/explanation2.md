## What you changed from AI output and why




## How you validated correctness

**WASM verification (mandatory check)**
- [ ] DevTools → Network → `pdfium.wasm` loads with `Content-Type: application/wasm`
- [ ] DevTools → Performance → rendering happens **inside the worker**, not on main thread
- [ ] Disabling WebAssembly in `chrome://flags` causes the app to fail gracefully with a clear error

**A.1 Viewing/Navigation**
- [ ] Load 100+ page sample → first page renders < 2s
- [ ] Zoom in/out, fit-to-width, fit-to-viewport all work
- [ ] Page input + Enter jumps to page
- [ ] Continuous scroll vs single-page toggle

**A.2 Editor**
- [ ] Delete a page → page count decreases, order maintained
- [ ] Rotate page left/right reflects in thumbnail
- [ ] Drag a thumbnail to new position → order updates
- [ ] Import another PDF → appended; merged page count correct
- [ ] Extract selection → downloaded file opens with only those pages
- [ ] Undo/redo works for delete, rotate, and reorder

**A.3 Print**
- [ ] Print icon opens browser print dialog with the PDF

**A.4 Export**
- [ ] Quick Download = current state (with all edits applied)
- [ ] Downloaded file opens cleanly in Chrome and Adobe Reader

**Linearization**
- [ ] Network tab shows `206 Partial Content` for Range requests during scroll
- [ ] Quick Download button is interactive before full doc loads
- [ ] First page paints before last byte arrives