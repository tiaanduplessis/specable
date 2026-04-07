import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorStore } from '../store'
import type { PipelineResult } from '../services/validation-pipeline'
import type { ValidationResult, LintResult } from '../workers/types'

const mockValidateDebounced = vi.fn()
const mockCancel = vi.fn()

vi.mock('../services/validation-pipeline', () => ({
  getValidationPipeline: () => ({
    validateDebounced: mockValidateDebounced,
    cancel: mockCancel,
  }),
  lintToValidationErrors: (lint: LintResult) =>
    lint.diagnostics.map((d) => ({
      line: d.line,
      column: d.column,
      endLine: d.endLine,
      endColumn: d.endColumn,
      message: d.message,
      path: d.path.join('.'),
      severity: d.severity === 'hint' ? 'info' : d.severity,
      rule: d.code,
    })),
}))

function createValidationResult(
  overrides: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    valid: true,
    syntaxValid: true,
    schemaValid: true,
    errors: [],
    warnings: [],
    parsedSpec: {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    } as ValidationResult['parsedSpec'],
    sourceMap: {},
    parseTimeMs: 5,
    validateTimeMs: 10,
    ...overrides,
  }
}

function createPipelineResult(
  overrides: Partial<PipelineResult> = {},
): PipelineResult {
  return {
    validation: createValidationResult(),
    lint: { diagnostics: [], lintTimeMs: 3 },
    totalTimeMs: 15,
    ...overrides,
  }
}

describe('useValidation', () => {
  let useValidation: typeof import('../hooks/useValidation').useValidation

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset store to known state
    useEditorStore.setState({
      file: {
        id: 'test',
        name: 'test.yaml',
        content: 'openapi: 3.0.3',
        isDirty: false,
        language: 'yaml',
      },
      parsedSpec: null,
      sourceMap: {},
      isValidating: false,
      syntaxValid: true,
      schemaValid: true,
      errors: [],
      warnings: [],
    })

    // Dynamic import to pick up the mocked pipeline
    const mod = await import('../hooks/useValidation')
    useValidation = mod.useValidation
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial debounce', () => {
    it('uses debounceMs=0 on first validation', () => {
      mockValidateDebounced.mockReturnValue(new Promise(() => {}))

      renderHook(() => useValidation())

      expect(mockValidateDebounced).toHaveBeenCalledWith(
        'openapi: 3.0.3',
        expect.any(Function),
        0,
      )
    })

    it('uses debounceMs=300 on subsequent validations', async () => {
      const result = createPipelineResult()
      mockValidateDebounced.mockResolvedValueOnce(result)

      const { rerender } = renderHook(() => useValidation())

      // Wait for first validation to complete
      await act(async () => {})

      // Update content to trigger second validation
      mockValidateDebounced.mockReturnValue(new Promise(() => {}))
      act(() => {
        useEditorStore.setState({
          file: {
            id: 'test',
            name: 'test.yaml',
            content: 'openapi: 3.0.4',
            isDirty: true,
            language: 'yaml',
          },
        })
      })
      rerender()

      const secondCall = mockValidateDebounced.mock.calls[1]
      expect(secondCall[0]).toBe('openapi: 3.0.4')
      expect(secondCall[2]).toBe(300)
    })
  })

  describe('stale effect guard', () => {
    it('ignores .then() after cleanup', async () => {
      let resolveValidation!: (value: PipelineResult) => void
      mockValidateDebounced.mockReturnValue(
        new Promise<PipelineResult>((resolve) => {
          resolveValidation = resolve
        }),
      )

      const { unmount } = renderHook(() => useValidation())

      // isValidating is false -- setValidating(true) only fires inside onProgress after debounce
      expect(useEditorStore.getState().isValidating).toBe(false)

      // Unmount triggers cleanup (sets active=false)
      unmount()
      expect(mockCancel).toHaveBeenCalled()

      // Now resolve the promise -- handler should be ignored
      await act(async () => {
        resolveValidation(createPipelineResult())
      })

      // isValidating stays false (was never set to true, stale .then() was ignored)
      expect(useEditorStore.getState().isValidating).toBe(false)
      expect(useEditorStore.getState().parsedSpec).toBeNull()
    })

    it('ignores .catch() after cleanup', async () => {
      let rejectValidation!: (reason: Error) => void
      mockValidateDebounced.mockReturnValue(
        new Promise<PipelineResult>((_, reject) => {
          rejectValidation = reject
        }),
      )

      const { unmount } = renderHook(() => useValidation())

      expect(useEditorStore.getState().isValidating).toBe(false)

      unmount()

      // Reject the promise -- handler should be ignored
      await act(async () => {
        rejectValidation(new Error('Worker failed'))
      })

      // isValidating stays false (was never set to true, stale .catch() was ignored)
      expect(useEditorStore.getState().isValidating).toBe(false)
    })

    it('ignores onProgress after cleanup', async () => {
      let capturedOnProgress!: (
        stage: string,
        result: Partial<PipelineResult>,
      ) => void
      mockValidateDebounced.mockImplementation((_content, onProgress) => {
        capturedOnProgress = onProgress
        return new Promise(() => {})
      })

      const { unmount } = renderHook(() => useValidation())

      unmount()

      // Call onProgress with a parsedSpec -- should be ignored
      act(() => {
        capturedOnProgress('validating', {
          validation: createValidationResult(),
        })
      })

      expect(useEditorStore.getState().parsedSpec).toBeNull()
    })
  })

  describe('content change detection', () => {
    it('does not validate when file is null', () => {
      useEditorStore.setState({ file: null })

      renderHook(() => useValidation())

      expect(mockValidateDebounced).not.toHaveBeenCalled()
    })

    it('does not validate when content is empty', () => {
      useEditorStore.setState({
        file: {
          id: 'test',
          name: 'test.yaml',
          content: '',
          isDirty: false,
          language: 'yaml',
        },
      })

      renderHook(() => useValidation())

      expect(mockValidateDebounced).not.toHaveBeenCalled()
    })

    it('validates when content changes', async () => {
      const result = createPipelineResult()
      mockValidateDebounced.mockResolvedValue(result)

      const { rerender } = renderHook(() => useValidation())
      await act(async () => {})

      mockValidateDebounced.mockReturnValue(new Promise(() => {}))
      act(() => {
        useEditorStore.setState({
          file: {
            id: 'test',
            name: 'test.yaml',
            content: 'openapi: 3.1.0',
            isDirty: true,
            language: 'yaml',
          },
        })
      })
      rerender()

      expect(mockValidateDebounced).toHaveBeenCalledTimes(2)
      expect(mockValidateDebounced.mock.calls[1][0]).toBe('openapi: 3.1.0')
    })
  })

  describe('store updates on success', () => {
    it('sets parsedSpec and validation results', async () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'API', version: '1.0.0' },
        paths: {},
      } as ValidationResult['parsedSpec']
      const result = createPipelineResult({
        validation: createValidationResult({ parsedSpec: spec }),
      })
      mockValidateDebounced.mockResolvedValue(result)

      renderHook(() => useValidation())
      await act(async () => {})

      const state = useEditorStore.getState()
      expect(state.parsedSpec).toEqual(spec)
      expect(state.isValidating).toBe(false)
      expect(state.syntaxValid).toBe(true)
      expect(state.schemaValid).toBe(true)
    })
  })

  describe('stale parsedSpec clearing', () => {
    it('falls back to main-thread parsing when worker returns null parsedSpec', async () => {
      const oldSpec = {
        openapi: '3.0.3',
        info: { title: 'Old', version: '1.0.0' },
        paths: {},
      } as ValidationResult['parsedSpec']
      useEditorStore.setState({ parsedSpec: oldSpec })

      const result = createPipelineResult({
        validation: createValidationResult({ parsedSpec: null }),
      })
      mockValidateDebounced.mockResolvedValue(result)

      renderHook(() => useValidation())
      await act(async () => {})

      // Fallback parses content on main thread
      const state = useEditorStore.getState()
      expect(state.parsedSpec).not.toEqual(oldSpec)
      expect(state.parsedSpec).toHaveProperty('openapi')
    })

    it('falls back to main-thread parsing on validation error', async () => {
      const oldSpec = {
        openapi: '3.0.3',
        info: { title: 'Old', version: '1.0.0' },
        paths: {},
      } as ValidationResult['parsedSpec']
      useEditorStore.setState({ parsedSpec: oldSpec })

      mockValidateDebounced.mockRejectedValue(new Error('Worker crashed'))

      renderHook(() => useValidation())
      await act(async () => {})

      // Fallback parses content on main thread
      const state = useEditorStore.getState()
      expect(state.parsedSpec).not.toEqual(oldSpec)
      expect(state.parsedSpec).toHaveProperty('openapi')
    })

    it('clears parsedSpec when content is not a valid spec', async () => {
      useEditorStore.setState({
        file: {
          id: 'test',
          name: 'test.txt',
          content: 'not a valid spec',
          isDirty: false,
          language: 'yaml',
        },
        parsedSpec: {
          openapi: '3.0.3',
          info: { title: 'Old', version: '1.0.0' },
          paths: {},
        } as ValidationResult['parsedSpec'],
      })

      mockValidateDebounced.mockRejectedValue(new Error('Worker crashed'))

      renderHook(() => useValidation())
      await act(async () => {})

      expect(useEditorStore.getState().parsedSpec).toBeNull()
    })
  })

  describe('cleanup', () => {
    it('calls pipeline.cancel() on unmount', () => {
      mockValidateDebounced.mockReturnValue(new Promise(() => {}))

      const { unmount } = renderHook(() => useValidation())
      unmount()

      expect(mockCancel).toHaveBeenCalled()
    })
  })
})
