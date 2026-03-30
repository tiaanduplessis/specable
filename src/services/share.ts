import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'

const HASH_PREFIX = 'spec='
const MAX_URL_LENGTH = 8192

export interface ShareResult {
  type: 'url' | 'webshare' | 'download' | 'error'
  url?: string
  message: string
}

export async function shareSpec(
  content: string,
  fileName: string,
): Promise<ShareResult> {
  try {
    if (!content.trim()) {
      return { type: 'error', message: 'Nothing to share — the editor is empty.' }
    }

    const compressed = compressToEncodedURIComponent(content)
    const base = window.location.origin + window.location.pathname
    const url = `${base}#${HASH_PREFIX}${compressed}`

    if (url.length <= MAX_URL_LENGTH) {
      const copied = await copyToClipboard(url)
      return {
        type: 'url',
        url,
        message: copied
          ? 'Share URL copied to clipboard.'
          : 'Could not copy to clipboard. URL is in the address bar.',
      }
    }

    // URL too long — fall back to file-based sharing
    return await shareAsFile(content, fileName)
  } catch {
    return { type: 'error', message: 'Failed to share spec.' }
  }
}

export function loadSharedSpec(): { content: string; language: 'yaml' | 'json' } | null {
  const hash = window.location.hash.slice(1) // strip leading #
  if (!hash.startsWith(HASH_PREFIX)) return null

  const compressed = hash.slice(HASH_PREFIX.length)
  if (!compressed) return null

  const content = decompressFromEncodedURIComponent(compressed)
  if (!content) return null

  const trimmed = content.trim()
  const language: 'yaml' | 'json' =
    trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'yaml'

  return { content, language }
}

export function clearSharedHash(): void {
  history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  )
}

async function shareAsFile(
  content: string,
  fileName: string,
): Promise<ShareResult> {
  try {
    const isJson = content.trim().startsWith('{') || content.trim().startsWith('[')
    const mimeType = isJson ? 'application/json' : 'text/yaml'
    const file = new File([content], fileName, { type: mimeType })

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName })
      return {
        type: 'webshare',
        message: 'Spec too large for a share URL. Opened share dialog.',
      }
    }

    downloadFile(fileName, content)
    return {
      type: 'download',
      message: 'Spec too large for a share URL. Downloaded as a file instead.',
    }
  } catch {
    return {
      type: 'error',
      message: 'Spec too large for a share URL and file sharing failed.',
    }
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API can fail without focus or in insecure contexts.
    // Put the URL in the address bar so the user can copy it manually.
    history.replaceState(null, '', text.replace(window.location.origin, ''))
    return false
  }
}

function downloadFile(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
