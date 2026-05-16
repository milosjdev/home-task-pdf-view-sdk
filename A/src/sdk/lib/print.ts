/**
 * Opens the system print dialog for a PDF using a hidden iframe (client-side only).
 */
export function printPdfBytes(bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden',
  )
  iframe.src = url
  document.body.appendChild(iframe)

  let finished = false

  const cleanup = (): void => {
    if (finished) {
      return
    }
    finished = true
    URL.revokeObjectURL(url)
    iframe.remove()
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) {
      cleanup()
      return
    }
    const onAfterPrint = (): void => {
      win.removeEventListener('afterprint', onAfterPrint)
      cleanup()
    }
    win.addEventListener('afterprint', onAfterPrint)
    win.focus()
    win.print()
    window.setTimeout(cleanup, 90_000)
  }
}
