import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store'
import {
  getValidationPipeline,
  lintToValidationErrors,
} from '../services/validation-pipeline'
import { parseContent } from '../utils/content'
import type { OpenAPIV3 } from 'openapi-types'

/**
 * Fallback: parse content on the main thread when the worker fails
 * to return a parsedSpec (e.g. due to serialization issues with Comlink).
 */
function tryParseSpec(content: string): OpenAPIV3.Document | null {
  try {
    const parsed = parseContent(content)
    if (parsed && typeof parsed === 'object' && 'openapi' in parsed) {
      return parsed as OpenAPIV3.Document
    }
    if (parsed && typeof parsed === 'object' && 'swagger' in parsed) {
      return parsed as unknown as OpenAPIV3.Document
    }
    return null
  } catch {
    return null
  }
}

export function useValidation() {
  const file = useEditorStore((state) => state.file)
  const setValidating = useEditorStore((state) => state.setValidating)
  const setValidationResult = useEditorStore(
    (state) => state.setValidationResult,
  )
  const setParsedSpec = useEditorStore((state) => state.setParsedSpec)
  const pipelineRef = useRef(getValidationPipeline())
  const lastContentRef = useRef<string | null>(null)
  const isFirstValidation = useRef(true)

  useEffect(() => {
    if (!file) return

    const content = file.content

    // Skip if content hasn't changed
    if (content === lastContentRef.current) return

    // Skip empty content
    if (!content) return

    let active = true
    const pipeline = pipelineRef.current

    const debounceMs = isFirstValidation.current ? 0 : 300
    isFirstValidation.current = false

    pipeline
      .validateDebounced(
        content,
        (stage, result) => {
          if (!active) return
          if (stage === 'validating') {
            setValidating(true)
            if (result.validation?.parsedSpec) {
              setParsedSpec(
                result.validation.parsedSpec,
                result.validation.sourceMap,
              )
            }
          }
        },
        debounceMs,
      )
      .then((result) => {
        if (!active) return

        lastContentRef.current = content

        const { validation, lint } = result

        if (validation) {
          const lintErrors = lint ? lintToValidationErrors(lint) : []
          const allErrors = [
            ...validation.errors,
            ...lintErrors.filter((e) => e.severity === 'error'),
          ]
          const allWarnings = [
            ...validation.warnings,
            ...lintErrors.filter(
              (e) => e.severity === 'warning' || e.severity === 'info',
            ),
          ]

          setValidationResult({
            syntaxValid: validation.syntaxValid,
            schemaValid: validation.schemaValid,
            errors: allErrors,
            warnings: allWarnings,
          })

          setParsedSpec(
            validation.parsedSpec ?? tryParseSpec(content),
            validation.sourceMap,
          )
        }

        setValidating(false)
      })
      .catch((e) => {
        if (!active) return
        setValidating(false)
        setParsedSpec(tryParseSpec(content), {})
        if (e.message !== 'Validation cancelled') {
          console.error('Validation error:', e)
        }
      })

    return () => {
      active = false
      pipeline.cancel()
    }
  }, [file?.content, setValidating, setValidationResult, setParsedSpec])
}
