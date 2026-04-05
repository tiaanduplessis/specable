import { describe, it, expect, vi } from 'vitest'
import { ValidatorWorker } from './validator.worker'

vi.mock('comlink', () => ({
  expose: vi.fn(),
}))

const worker = new ValidatorWorker()

const valid30Yaml = `
openapi: "3.0.3"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`.trim()

const valid31Yaml = `
openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /health:
    get:
      summary: Health check
      responses:
        "200":
          description: OK
`.trim()

const valid20Yaml = `
swagger: "2.0"
info:
  title: Test API
  version: "1.0.0"
host: api.example.com
basePath: /v1
paths: {}
`.trim()

const valid30Json = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
})

describe('ValidatorWorker', () => {
  describe('OpenAPI 3.0.x', () => {
    it('validates a valid spec', async () => {
      const result = await worker.validate(valid30Yaml)
      expect(result.syntaxValid).toBe(true)
      expect(result.schemaValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.parsedSpec).not.toBeNull()
    })

    it('reports errors for an invalid spec', async () => {
      const invalid = `
openapi: "3.0.3"
info:
  version: "1.0.0"
paths: {}
`.trim()
      const result = await worker.validate(invalid)
      expect(result.schemaValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.parsedSpec).not.toBeNull()
    })
  })

  describe('OpenAPI 3.1.x', () => {
    it('validates a valid spec with full schema validation', async () => {
      const result = await worker.validate(valid31Yaml)
      expect(result.syntaxValid).toBe(true)
      expect(result.schemaValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.parsedSpec).not.toBeNull()
    })

    it('does not show the old "syntax validation only" warning', async () => {
      const result = await worker.validate(valid31Yaml)
      const syntaxOnlyWarning = result.warnings.find((w) =>
        w.message.includes('syntax validation only'),
      )
      expect(syntaxOnlyWarning).toBeUndefined()
    })

    it('reports errors for an invalid spec', async () => {
      const invalid = `
openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}
`.trim()
      const result = await worker.validate(invalid)
      expect(result.schemaValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.parsedSpec).not.toBeNull()
    })
  })

  describe('Swagger 2.0', () => {
    it('validates a valid spec', async () => {
      const result = await worker.validate(valid20Yaml)
      expect(result.syntaxValid).toBe(true)
      expect(result.schemaValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.parsedSpec).not.toBeNull()
    })
  })

  describe('syntax errors', () => {
    it('reports YAML syntax errors', async () => {
      const badYaml = `
openapi: "3.0.3"
  info:
title: broken
`.trim()
      const result = await worker.validate(badYaml)
      expect(result.syntaxValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('JSON format', () => {
    it('validates a valid JSON spec', async () => {
      const result = await worker.validate(valid30Json)
      expect(result.syntaxValid).toBe(true)
      expect(result.schemaValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.parsedSpec).not.toBeNull()
    })
  })
})
