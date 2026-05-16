const CHUNK_SIZE = 256 * 1024

export interface ByteProgress {
  loaded: number
  total: number | null
  progress: number
}

export class RangePdfSource {
  private readonly url: string
  private totalSize: number | null = null
  private supportsRange = false
  private readonly isBlobUrl: boolean

  constructor(url: string) {
    this.url = url
    this.isBlobUrl = url.startsWith('blob:')
  }

  async probe(): Promise<{ total: number | null; supportsRange: boolean }> {
    if (this.isBlobUrl) {
      // Single fetch happens in readViaStream; avoid buffering the blob twice.
      this.totalSize = null
      this.supportsRange = false
      return { total: null, supportsRange: false }
    }

    const head = await fetch(this.url, { method: 'HEAD' })
    if (!head.ok) {
      throw new Error(`Failed to probe PDF (${head.status})`)
    }

    const lengthHeader = head.headers.get('content-length')
    this.totalSize = lengthHeader ? Number.parseInt(lengthHeader, 10) : null
    this.supportsRange = head.headers.get('accept-ranges') === 'bytes'

    return { total: this.totalSize, supportsRange: this.supportsRange }
  }

  async *readChunks(onChunk?: (progress: ByteProgress) => void): AsyncGenerator<Uint8Array> {
    if (this.isBlobUrl || !this.supportsRange || !this.totalSize) {
      yield* this.readViaStream(onChunk)
      return
    }

    let loaded = 0
    while (loaded < this.totalSize) {
      const end = Math.min(loaded + CHUNK_SIZE - 1, this.totalSize - 1)
      const response = await fetch(this.url, {
        headers: { Range: `bytes=${loaded}-${end}` },
      })

      if (!response.ok && response.status !== 206) {
        throw new Error(`Range request failed (${response.status})`)
      }

      const chunk = new Uint8Array(await response.arrayBuffer())
      loaded += chunk.length
      onChunk?.({
        loaded,
        total: this.totalSize,
        progress: Math.min(1, loaded / this.totalSize),
      })
      yield chunk
    }
  }

  private async *readViaStream(
    onChunk?: (progress: ByteProgress) => void,
  ): AsyncGenerator<Uint8Array> {
    const response = await fetch(this.url)
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF (${response.status})`)
    }

    const total =
      this.totalSize ??
      (response.headers.get('content-length')
        ? Number.parseInt(response.headers.get('content-length')!, 10)
        : null)

    const reader = response.body?.getReader()
    if (!reader) {
      const buffer = new Uint8Array(await response.arrayBuffer())
      onChunk?.({ loaded: buffer.length, total, progress: 1 })
      yield buffer
      return
    }

    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }
      loaded += value.length
      onChunk?.({
        loaded,
        total,
        progress: total ? Math.min(1, loaded / total) : 0,
      })
      yield value
    }
  }
}

export function concatPdfChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}
