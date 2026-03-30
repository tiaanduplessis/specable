import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
import { shareSpec, loadSharedSpec, clearSharedHash } from './share'

function setHash(hash: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hash },
    writable: true,
    configurable: true,
  })
}

describe('shareSpec', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://specable.dev',
        pathname: '/',
        search: '',
        hash: '',
      },
      writable: true,
      configurable: true,
    })
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      share: undefined,
      canShare: undefined,
    })
  })

  it('returns error for empty content', async () => {
    const result = await shareSpec('   ', 'test.yaml')
    expect(result.type).toBe('error')
    expect(result.message).toContain('empty')
  })

  it('creates a URL and copies to clipboard for small specs', async () => {
    const content = 'openapi: 3.0.3\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}'
    const result = await shareSpec(content, 'test.yaml')

    expect(result.type).toBe('url')
    expect(result.url).toContain('#spec=')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(result.url)
  })

  it('falls back to download for large specs', async () => {
    // Random bytes don't compress well, ensuring URL exceeds 8192 chars
    const bytes = new Uint8Array(6000)
    crypto.getRandomValues(bytes)
    const content = Array.from(bytes, (b) => String.fromCharCode(33 + (b % 94))).join('')
    const result = await shareSpec(content, 'large.yaml')

    expect(result.type).toBe('download')
    expect(result.message).toContain('too large')
  })
})

describe('loadSharedSpec', () => {
  it('returns null when no hash is present', () => {
    setHash('')
    expect(loadSharedSpec()).toBeNull()
  })

  it('returns null for non-spec hash', () => {
    setHash('#something-else')
    expect(loadSharedSpec()).toBeNull()
  })

  it('returns null for empty compressed data', () => {
    setHash('#spec=')
    expect(loadSharedSpec()).toBeNull()
  })

  it('decompresses a valid YAML spec', () => {
    const content = 'openapi: 3.0.3\ninfo:\n  title: Test\n  version: 1.0.0'
    const compressed = compressToEncodedURIComponent(content)
    setHash(`#spec=${compressed}`)

    const result = loadSharedSpec()
    expect(result).not.toBeNull()
    expect(result!.content).toBe(content)
    expect(result!.language).toBe('yaml')
  })

  it('detects JSON language', () => {
    const content = '{"openapi":"3.0.3","info":{"title":"Test","version":"1.0.0"}}'
    const compressed = compressToEncodedURIComponent(content)
    setHash(`#spec=${compressed}`)

    const result = loadSharedSpec()
    expect(result).not.toBeNull()
    expect(result!.content).toBe(content)
    expect(result!.language).toBe('json')
  })

  it('returns null for corrupt compressed data', () => {
    setHash('#spec=not-valid-compressed-data!!!')
    expect(loadSharedSpec()).toBeNull()
  })
})

describe('clearSharedHash', () => {
  it('removes hash from URL', () => {
    const replaceState = vi.spyOn(history, 'replaceState')
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '', hash: '#spec=abc' },
      writable: true,
      configurable: true,
    })

    clearSharedHash()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/')
    replaceState.mockRestore()
  })

  it('preserves search params when clearing hash', () => {
    const replaceState = vi.spyOn(history, 'replaceState')
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '?view=preview', hash: '#spec=abc' },
      writable: true,
      configurable: true,
    })

    clearSharedHash()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?view=preview')
    replaceState.mockRestore()
  })
})

describe('round-trip', () => {
  it('compresses and decompresses to the same content', async () => {
    const content = 'openapi: 3.0.3\ninfo:\n  title: Round Trip Test\n  version: 1.0.0\npaths:\n  /test:\n    get:\n      summary: Test endpoint'

    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://specable.dev',
        pathname: '/',
        search: '',
        hash: '',
      },
      writable: true,
      configurable: true,
    })
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    const shareResult = await shareSpec(content, 'test.yaml')
    expect(shareResult.type).toBe('url')

    // Extract hash from the generated URL and set it
    const hash = '#' + shareResult.url!.split('#')[1]
    setHash(hash)

    const loaded = loadSharedSpec()
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe(content)
  })
})
