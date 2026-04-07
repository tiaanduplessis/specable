import { expose } from 'comlink'
import { Spectral, Document, Ruleset } from '@stoplight/spectral-core'
import { oas } from '@stoplight/spectral-rulesets'
import { Yaml, Json } from '@stoplight/spectral-parsers'
import type { LintResult, LintDiagnostic, LinterWorkerApi } from './types'

class LinterWorker implements LinterWorkerApi {
  private spectral: Spectral
  private initialised = false

  constructor() {
    this.spectral = new Spectral()
  }

  private async ensureInitialised() {
    if (!this.initialised) {
      // Create a ruleset that extends the OAS ruleset
      const ruleset = new Ruleset({
        extends: [[oas, 'recommended']],
        rules: {},
      })
      this.spectral.setRuleset(ruleset)
      this.initialised = true
    }
  }

  async lint(content: string): Promise<LintResult> {
    await this.ensureInitialised()

    const start = performance.now()
    const diagnostics: LintDiagnostic[] = []

    try {
      const isJson = content.trim().startsWith('{')
      const doc = isJson
        ? new Document(content, Json, 'openapi.json')
        : new Document(content, Yaml, 'openapi.yaml')
      const results = await this.spectral.run(doc)

      for (const result of results) {
        diagnostics.push({
          line: result.range.start.line + 1,
          column: result.range.start.character + 1,
          endLine: result.range.end.line + 1,
          endColumn: result.range.end.character + 1,
          message: result.message,
          severity: this.mapSeverity(result.severity),
          code: String(result.code),
          path: result.path.map(String),
        })
      }
    } catch (e) {
      // If Spectral fails to run, return empty diagnostics
      console.error('Spectral lint error:', e)
    }

    return {
      diagnostics,
      lintTimeMs: performance.now() - start,
    }
  }

  private mapSeverity(severity: number): LintDiagnostic['severity'] {
    switch (severity) {
      case 0:
        return 'error'
      case 1:
        return 'warning'
      case 2:
        return 'info'
      default:
        return 'hint'
    }
  }
}

expose(new LinterWorker())
