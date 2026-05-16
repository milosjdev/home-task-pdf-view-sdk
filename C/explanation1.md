What you changed from AI output and why?

### Issues I found from AI output

Sometimes after I import or edit PDFs, the page shows up empty until I scroll to the next page.

### Root causes

1. **`invalidateAll()` ran on every PdfViewer mount** via  
   `useEffect(..., [zoom, fitMode, rotation, mode, invalidateAll])`.  
   Effects run **after** paint **parents → children**, so `DocumentScroller` could **finish loading page 1**, then this parent effect ran and **wiped the cache**.  
   `visiblePages` didn’t change, so **no second refresh** ran until something else happened (e.g. scrolling → intersection updates → reload).

2. **Preview rebuild** (`previewRevision` from `useEditorPreview`): after `initEditor`, the preview pipeline runs `openBytes` and **`bumpPreviewRevision()`**. The PdfViewer effect called **`invalidateAll()`** again but **nothing bumped “reload visibility”**, so the same **stuck-until-scroll** behavior appeared.

3. **IntersectionObserver** could briefly produce **no intersecting pages** before layout settles; without a fallback, **`visiblePages`** could become **`{}`** and **`refreshVisiblePages` never ran**.

### Fixes

| Change | Purpose |
|--------|--------|
| **`invalidateAll()` when starting a new load** (after `resetViewer`) | Drop bitmaps from the previous PDF. |
| **Invalidate cache only when zoom / fit / rotation actually change** (tracked with `prevViewLayoutRef`) | Avoid wiping right after the first successful paint on open or reopen. |
| **`viewReloadToken` + `reloadToken` on `DocumentScroller` / `SinglePageView`** | After `invalidateAll()` when **`previewRevision`** updates, force **`refreshVisiblePages`** / **`loadPage`** again without relying on scroll. |
| **`DocumentScroller` IO fallback**: if `visiblePages` would become empty while `totalPages > 0`, **`next.add(0)`** | So initial loads never sit with zero visible pages. |