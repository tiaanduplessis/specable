import { expose } from 'comlink'
import { validate as validateSpec } from '@readme/openapi-parser'
import YAML from 'yaml'
import type { OpenAPIV3 } from 'openapi-types'
import type {
  ValidationResult,
  ValidationError,
  SourceMap,
  SourcePosition,
  ValidatorWorkerApi,
} from './types'

class ValidatorWorker implements ValidatorWorkerApi {
  async validate(content: string): Promise<ValidationResult> {
    const parseStart = performance.now()
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    let parsedSpec: OpenAPIV3.Document | null = null
    let sourceMap: SourceMap = {}
    let syntaxValid = true
    let schemaValid = true

    let parsed: unknown
    try {
      if (content.trim().startsWith('{')) {
        parsed = JSON.parse(content)
        sourceMap = this.buildJsonSourceMap(content)
      } else {
        const doc = YAML.parseDocument(content, { keepSourceTokens: true })

        if (doc.errors.length > 0) {
          syntaxValid = false
          for (const err of doc.errors) {
            const pos = err.pos?.[0] ?? 0
            const position = this.offsetToPosition(content, pos)
            errors.push({
              line: position.line,
              column: position.column,
              message: err.message,
              path: '',
              severity: 'error',
              rule: 'yaml-syntax',
            })
          }
        }

        if (doc.warnings.length > 0) {
          for (const warn of doc.warnings) {
            const pos = warn.pos?.[0] ?? 0
            const position = this.offsetToPosition(content, pos)
            warnings.push({
              line: position.line,
              column: position.column,
              message: warn.message,
              path: '',
              severity: 'warning',
              rule: 'yaml-warning',
            })
          }
        }

        parsed = doc.toJS()
        sourceMap = this.buildYamlSourceMap(doc)
      }
    } catch (e) {
      syntaxValid = false
      const err = e as Error & {
        linePos?: Array<{ line: number; col: number }>
      }
      const line = err.linePos?.[0]?.line ?? 1
      const column = err.linePos?.[0]?.col ?? 1

      errors.push({
        line,
        column,
        message: err.message,
        path: '',
        severity: 'error',
        rule: 'syntax',
      })

      const parseTimeMs = performance.now() - parseStart
      return {
        valid: false,
        syntaxValid: false,
        schemaValid: false,
        errors,
        warnings,
        parsedSpec: null,
        sourceMap: {},
        parseTimeMs,
        validateTimeMs: 0,
      }
    }

    const parseTimeMs = performance.now() - parseStart

    if (!syntaxValid) {
      return {
        valid: false,
        syntaxValid: false,
        schemaValid: false,
        errors,
        warnings,
        parsedSpec: null,
        sourceMap,
        parseTimeMs,
        validateTimeMs: 0,
      }
    }

    const validateStart = performance.now()

    try {
      const result = await validateSpec(
        structuredClone(parsed) as OpenAPIV3.Document,
        { validate: { errors: { colorize: false } } },
      )

      if (result.valid) {
        schemaValid = true
      } else {
        schemaValid = false
        for (const error of result.errors) {
          const position = this.extractPositionFromError(
            error.message,
            sourceMap,
          )
          errors.push({
            line: position.line,
            column: position.column,
            message: error.message,
            path: '',
            severity: 'error',
            rule: 'openapi-schema',
          })
        }
      }

      for (const warning of result.warnings) {
        warnings.push({
          line: 1,
          column: 1,
          message: warning.message,
          path: '',
          severity: 'warning',
          rule: 'openapi-schema',
        })
      }
    } catch (e) {
      schemaValid = false
      const err = e as Error
      const position = this.extractPositionFromError(err.message, sourceMap)
      errors.push({
        line: position.line,
        column: position.column,
        message: err.message,
        path: '',
        severity: 'error',
        rule: 'openapi-schema',
      })
    }

    // Use the raw parsed object for UI display to avoid circular references
    // from $ref resolution that break worker serialization via postMessage.
    // The DocumentationView handles $ref resolution at render time.
    parsedSpec = parsed as OpenAPIV3.Document

    const validateTimeMs = performance.now() - validateStart

    return {
      valid: syntaxValid && schemaValid && errors.length === 0,
      syntaxValid,
      schemaValid,
      errors,
      warnings,
      parsedSpec,
      sourceMap,
      parseTimeMs,
      validateTimeMs,
    }
  }

  private offsetToPosition(content: string, offset: number): SourcePosition {
    const lines = content.slice(0, offset).split('\n')
    return {
      line: lines.length,
      column: (lines[lines.length - 1]?.length ?? 0) + 1,
    }
  }

  private buildLineIndex(content: string): number[] {
    // Pre-compute line start offsets for O(1) position lookups
    const lineStarts: number[] = [0]
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        lineStarts.push(i + 1)
      }
    }
    return lineStarts
  }

  private offsetToPositionFast(
    offset: number,
    lineStarts: number[],
  ): SourcePosition {
    // Binary search for the line
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (lineStarts[mid] <= offset) {
        low = mid
      } else {
        high = mid - 1
      }
    }
    return {
      line: low + 1,
      column: offset - lineStarts[low] + 1,
    }
  }

  private buildYamlSourceMap(doc: YAML.Document): SourceMap {
    const sourceMap: SourceMap = {}
    const content = doc.toString()
    const lineStarts = this.buildLineIndex(content)

    // Only map top-level and important paths for performance
    const maxDepth = 4 // Limit depth to avoid exponential growth

    const visit = (node: unknown, path: string[], depth: number) => {
      if (!node || typeof node !== 'object' || depth > maxDepth) return

      const yamlNode = node as
        | YAML.YAMLMap
        | YAML.YAMLSeq
        | YAML.Scalar
        | YAML.Pair

      if ('range' in yamlNode && yamlNode.range) {
        const [start] = yamlNode.range
        const pos = this.offsetToPositionFast(start, lineStarts)
        sourceMap[path.join('.')] = pos
      }

      if (
        yamlNode instanceof YAML.YAMLMap ||
        (yamlNode && 'items' in yamlNode && Array.isArray(yamlNode.items))
      ) {
        const items = 'items' in yamlNode ? yamlNode.items : []
        for (const item of items) {
          if (
            item &&
            typeof item === 'object' &&
            'key' in item &&
            'value' in item
          ) {
            const pair = item as YAML.Pair
            const keyValue = pair.key
            const key =
              keyValue && typeof keyValue === 'object' && 'value' in keyValue
                ? String(keyValue.value)
                : String(keyValue)
            visit(pair.value, [...path, key], depth + 1)
          }
        }
      }

      if (
        yamlNode instanceof YAML.YAMLSeq ||
        (yamlNode &&
          'items' in yamlNode &&
          Array.isArray(yamlNode.items) &&
          !('key' in yamlNode))
      ) {
        const items = 'items' in yamlNode ? yamlNode.items : []
        // For arrays, only map first few items to avoid huge source maps
        const limit = Math.min(items.length, 100)
        for (let i = 0; i < limit; i++) {
          visit(items[i], [...path, String(i)], depth + 1)
        }
      }
    }

    visit(doc.contents, [], 0)
    return sourceMap
  }

  private buildJsonSourceMap(content: string): SourceMap {
    // Simple JSON source map - just track line numbers for top-level keys
    const sourceMap: SourceMap = {}
    const lines = content.split('\n')

    const currentPath: string[] = []
    let inString = false
    let keyBuffer = ''
    let collectingKey = false

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]
      for (let col = 0; col < line.length; col++) {
        const char = line[col]

        if (char === '"' && (col === 0 || line[col - 1] !== '\\')) {
          if (!inString) {
            inString = true
            collectingKey = true
            keyBuffer = ''
          } else {
            inString = false
            if (collectingKey && keyBuffer) {
              currentPath.push(keyBuffer)
              sourceMap[currentPath.join('.')] = {
                line: lineNum + 1,
                column: col + 1,
              }
            }
            collectingKey = false
          }
        } else if (inString && collectingKey) {
          keyBuffer += char
        } else if (char === ':' && !inString) {
          collectingKey = false
        } else if (char === ',' && !inString) {
          if (currentPath.length > 0) currentPath.pop()
        } else if ((char === '}' || char === ']') && !inString) {
          if (currentPath.length > 0) currentPath.pop()
        }
      }
    }

    return sourceMap
  }

  private extractPositionFromError(
    message: string,
    sourceMap: SourceMap,
  ): SourcePosition {
    // Try to extract path from error message patterns like "at #/paths/~1users/get"
    const pathMatch = message.match(/at #\/([^\s]+)/)
    if (pathMatch) {
      const path = pathMatch[1]
        .replace(/~1/g, '/')
        .replace(/~0/g, '~')
        .replace(/\//g, '.')

      if (sourceMap[path]) {
        return sourceMap[path]
      }

      // Try parent paths
      const parts = path.split('.')
      while (parts.length > 0) {
        parts.pop()
        const parentPath = parts.join('.')
        if (sourceMap[parentPath]) {
          return sourceMap[parentPath]
        }
      }
    }

    return { line: 1, column: 1 }
  }
}

export { ValidatorWorker }
expose(new ValidatorWorker())
