import { useCallback, useState, useMemo, useRef } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react'
import { useEditorStore } from '../../store'
import type { OpenAPIV3 } from 'openapi-types'
import {
  CollapsibleSection,
  ParameterRow,
  RequestBodySection,
  ResponseSection,
  SecuritySection,
  SchemaDisplay,
  CopyAsTypeScript,
  ExtensionBadges,
} from './components'
import { Markdown } from './Markdown'
import { CopySnippetButton } from '../ui/CopySnippetButton'
import { buildSnippetFromOperation } from '../../services/code-snippet-generator'
import { getComposition, resolveRef, type SchemaObject } from './schema-utils'
import { METHOD_STYLES } from '../ui/style-constants'
import { extractExtensions } from './extension-utils'
import { useClickOutside } from '../../hooks/useClickOutside'

interface SearchFilters {
  path: boolean
  description: boolean
  operationId: boolean
  parameterName: boolean
  schemaField: boolean
  bodyField: boolean
  header: boolean
}

const DEFAULT_FILTERS: SearchFilters = {
  path: true,
  description: true,
  operationId: true,
  parameterName: false,
  schemaField: false,
  bodyField: false,
  header: false,
}

export function DocumentationView() {
  const parsedSpec = useEditorStore((state) => state.parsedSpec)
  const isValidating = useEditorStore((state) => state.isValidating)
  const sourceMap = useEditorStore((state) => state.sourceMap)
  const goToLine = useEditorStore((state) => state.goToLine)
  const [filter, setFilter] = useState('')
  const [headerExpanded, setHeaderExpanded] = useState(true)
  const [searchFilters, setSearchFilters] =
    useState<SearchFilters>(DEFAULT_FILTERS)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  useClickOutside(
    [filterMenuRef, filterButtonRef],
    useCallback(() => setShowFilterMenu(false), []),
  )

  const toggleFilter = useCallback((key: keyof SearchFilters) => {
    setSearchFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }, [])

  const clearTags = useCallback(() => {
    setSelectedTags(new Set())
  }, [])

  const activeFilterCount = Object.values(searchFilters).filter(Boolean).length

  const searchPlaceholder = useMemo(() => {
    if (activeFilterCount === 0) return 'No filters active'
    const labels: string[] = []
    if (searchFilters.path) labels.push('path')
    if (searchFilters.description) labels.push('description')
    if (searchFilters.operationId) labels.push('operation ID')
    if (searchFilters.parameterName) labels.push('parameters')
    if (searchFilters.schemaField) labels.push('schema fields')
    if (searchFilters.bodyField) labels.push('body fields')
    return `Filter by ${labels.join(', ')}...`
  }, [searchFilters, activeFilterCount])

  const HTTP_METHODS = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
  ] as const

  const sortedTags = useMemo(() => {
    const counts = new Map<string, number>()

    if (parsedSpec?.tags) {
      for (const tag of parsedSpec.tags) {
        counts.set(tag.name, 0)
      }
    }

    if (parsedSpec?.paths) {
      for (const pathItem of Object.values(parsedSpec.paths)) {
        if (!pathItem) continue
        for (const method of HTTP_METHODS) {
          const operation = (pathItem as Record<string, unknown>)[method] as
            | OpenAPIV3.OperationObject
            | undefined
          if (operation?.tags) {
            for (const tag of operation.tags) {
              counts.set(tag, (counts.get(tag) ?? 0) + 1)
            }
          }
        }
      }
    }

    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [parsedSpec])

  const navigateToPath = useCallback(
    (path: string) => {
      const position = sourceMap[path]
      if (position) {
        goToLine(position.line, position.column)
      }
    },
    [sourceMap, goToLine],
  )

  const filteredPaths = useMemo(() => {
    if (!parsedSpec?.paths) return []
    const entries = Object.entries(parsedSpec.paths)
    const hasTagFilter = selectedTags.size > 0
    const hasTextFilter = !!filter
    const lowerFilter = filter ? filter.toLowerCase() : ''

    const searchSchemaFields = (
      schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
    ): boolean => {
      if (!schema) return false
      if ('$ref' in schema) {
        const refName = schema.$ref.split('/').pop()
        return refName?.toLowerCase().includes(lowerFilter) ?? false
      }
      if (schema.properties) {
        for (const propName of Object.keys(schema.properties)) {
          if (propName.toLowerCase().includes(lowerFilter)) return true
        }
      }
      if (schema.type === 'array' && schema.items) {
        return searchSchemaFields(schema.items)
      }
      return false
    }

    const matchesTextFilter = (
      path: string,
      operation: OpenAPIV3.OperationObject,
    ): boolean => {
      if (!hasTextFilter) return true
      if (searchFilters.path && path.toLowerCase().includes(lowerFilter))
        return true
      if (
        searchFilters.path &&
        operation.summary?.toLowerCase().includes(lowerFilter)
      )
        return true
      if (
        searchFilters.description &&
        operation.description?.toLowerCase().includes(lowerFilter)
      )
        return true
      if (
        searchFilters.operationId &&
        operation.operationId?.toLowerCase().includes(lowerFilter)
      )
        return true
      if (searchFilters.parameterName && operation.parameters) {
        for (const param of operation.parameters) {
          if (
            !('$ref' in param) &&
            param.name?.toLowerCase().includes(lowerFilter)
          )
            return true
        }
      }
      if (
        searchFilters.bodyField &&
        operation.requestBody &&
        !('$ref' in operation.requestBody)
      ) {
        const content = operation.requestBody.content
        for (const mediaType of Object.values(content ?? {})) {
          if (searchSchemaFields(mediaType.schema)) return true
        }
      }
      if (searchFilters.bodyField && operation.responses) {
        for (const response of Object.values(operation.responses)) {
          if (response && !('$ref' in response) && response.content) {
            for (const mediaType of Object.values(response.content)) {
              if (searchSchemaFields(mediaType.schema)) return true
            }
          }
        }
      }
      if (searchFilters.header) {
        if (operation.parameters) {
          for (const param of operation.parameters) {
            if (
              !('$ref' in param) &&
              param.in === 'header' &&
              param.name?.toLowerCase().includes(lowerFilter)
            )
              return true
          }
        }
        if (operation.responses) {
          for (const response of Object.values(operation.responses)) {
            if (response && !('$ref' in response) && response.headers) {
              for (const headerName of Object.keys(response.headers)) {
                if (headerName.toLowerCase().includes(lowerFilter)) return true
              }
            }
          }
        }
      }
      return false
    }

    const isFiltering = hasTagFilter || hasTextFilter
    const results: [string, OpenAPIV3.PathItemObject, string[] | null][] = []

    for (const [path, pathItem] of entries) {
      const item = pathItem as OpenAPIV3.PathItemObject
      if (!isFiltering) {
        results.push([path, item, null])
        continue
      }

      const visibleMethods: string[] = []
      for (const method of HTTP_METHODS) {
        const operation = (item as Record<string, unknown>)[method] as
          | OpenAPIV3.OperationObject
          | undefined
        if (!operation) continue

        if (hasTagFilter) {
          const hasMathingTag = operation.tags?.some((t) =>
            selectedTags.has(t),
          )
          if (!hasMathingTag) continue
        }

        if (!matchesTextFilter(path, operation)) continue
        visibleMethods.push(method)
      }

      if (visibleMethods.length > 0) {
        results.push([path, item, visibleMethods])
      }
    }

    return results
  }, [parsedSpec, filter, searchFilters, selectedTags])

  const filteredSchemas = useMemo(() => {
    if (!parsedSpec?.components?.schemas) return []
    const entries = Object.entries(parsedSpec.components.schemas)
    if (!filter) return entries

    const lowerFilter = filter.toLowerCase()
    return entries.filter(([name, schema]) => {
      if (searchFilters.path && name.toLowerCase().includes(lowerFilter))
        return true
      const schemaObj = schema as OpenAPIV3.SchemaObject
      if (
        searchFilters.description &&
        schemaObj.description?.toLowerCase().includes(lowerFilter)
      )
        return true
      if (searchFilters.schemaField && schemaObj.properties) {
        for (const propName of Object.keys(schemaObj.properties)) {
          if (propName.toLowerCase().includes(lowerFilter)) return true
        }
      }
      return false
    })
  }, [parsedSpec, filter, searchFilters])

  if (!parsedSpec) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950 text-zinc-500">
        {isValidating ? 'Loading...' : 'No valid specification to preview'}
      </div>
    )
  }

  const hasResults = filteredPaths.length > 0 || filteredSchemas.length > 0

  const hasHeaderContent =
    parsedSpec.info.description || parsedSpec.servers?.[0]

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <header className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-medium text-zinc-100 tracking-tight">
              {parsedSpec.info.title}
            </h1>
            {new URLSearchParams(window.location.search).get('view') !==
              'preview' && (
              <button
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.set('view', 'preview')
                  window.open(url.toString(), '_blank')
                }}
                className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                aria-label="Open in new tab"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
          {hasHeaderContent && (
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors shrink-0"
              aria-label={headerExpanded ? 'Collapse header' : 'Expand header'}
              aria-expanded={headerExpanded}
            >
              {headerExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {headerExpanded && (
          <>
            {parsedSpec.info.description && (
              <div className="mt-2 text-sm text-zinc-400 leading-relaxed">
                <Markdown>{parsedSpec.info.description}</Markdown>
              </div>
            )}
            <div className="flex gap-4 mt-3 text-xs">
              <span className="text-purple-400">
                v{parsedSpec.info.version}
              </span>
              {parsedSpec.servers?.[0] && (
                <span className="text-zinc-500 font-mono">
                  {parsedSpec.servers[0].url}
                </span>
              )}
            </div>
          </>
        )}

        {!headerExpanded && (
          <span className="text-xs text-purple-400 mt-1 block">
            v{parsedSpec.info.version}
          </span>
        )}

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500"
            aria-label="Filter preview"
          />
          <div className="relative">
            <button
              ref={filterButtonRef}
              type="button"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`p-2 rounded-md border transition-colors ${
                showFilterMenu ||
                activeFilterCount !== Object.keys(DEFAULT_FILTERS).length
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
              aria-label="Search filters"
              aria-expanded={showFilterMenu}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            {showFilterMenu && (
              <div
                ref={filterMenuRef}
                className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-20"
              >
                <div className="p-2 border-b border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400">
                    Search in
                  </span>
                </div>
                <div className="p-1">
                  <FilterCheckbox
                    label="Path / Name"
                    checked={searchFilters.path}
                    onChange={() => toggleFilter('path')}
                  />
                  <FilterCheckbox
                    label="Description"
                    checked={searchFilters.description}
                    onChange={() => toggleFilter('description')}
                  />
                  <FilterCheckbox
                    label="Operation ID"
                    checked={searchFilters.operationId}
                    onChange={() => toggleFilter('operationId')}
                  />
                  <FilterCheckbox
                    label="Parameter names"
                    checked={searchFilters.parameterName}
                    onChange={() => toggleFilter('parameterName')}
                  />
                  <FilterCheckbox
                    label="Schema fields"
                    checked={searchFilters.schemaField}
                    onChange={() => toggleFilter('schemaField')}
                  />
                  <FilterCheckbox
                    label="Request/response fields"
                    checked={searchFilters.bodyField}
                    onChange={() => toggleFilter('bodyField')}
                  />
                  <FilterCheckbox
                    label="Headers"
                    checked={searchFilters.header}
                    onChange={() => toggleFilter('header')}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {sortedTags.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={clearTags}
              className={`px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedTags.size === 0
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              All
            </button>
            {sortedTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  selectedTags.has(tag)
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {tag}
                <span
                  className={`px-1 text-[10px] font-medium rounded ${
                    selectedTags.has(tag)
                      ? 'bg-purple-500/30 text-purple-100'
                      : 'bg-zinc-700 text-zinc-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {!hasResults && (filter || selectedTags.size > 0) && (
          <div className="text-center text-zinc-600 py-8">
            No matches found
            {filter ? ` for "${filter}"` : ''}
            {selectedTags.size > 0 ? ' with selected tags' : ''}
          </div>
        )}

        {/* Endpoints */}
        {filteredPaths.map(([path, pathItem, visibleMethods]) => (
          <PathSection
            key={path}
            path={path}
            pathItem={pathItem as OpenAPIV3.PathItemObject}
            spec={parsedSpec}
            onNavigate={navigateToPath}
            visibleMethods={visibleMethods}
          />
        ))}

        {/* Schemas */}
        {filteredSchemas.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base font-medium text-zinc-200 mb-4 pb-2 border-b border-zinc-800">
              Schemas ({filteredSchemas.length})
            </h2>
            <div className="space-y-3">
              {filteredSchemas.map(([name, schema]) => (
                <SchemaCard
                  key={name}
                  name={name}
                  schema={schema as OpenAPIV3.SchemaObject}
                  spec={parsedSpec}
                  onNavigate={() =>
                    navigateToPath(`components.schemas.${name}`)
                  }
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function PathSection({
  path,
  pathItem,
  spec,
  onNavigate,
  visibleMethods,
}: {
  path: string
  pathItem: OpenAPIV3.PathItemObject
  spec: OpenAPIV3.Document
  onNavigate: (path: string) => void
  visibleMethods: string[] | null
}) {
  const methods = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
  ] as const

  const operations = methods
    .filter((method) => {
      if (!(pathItem as Record<string, unknown>)[method]) return false
      if (visibleMethods !== null && !visibleMethods.includes(method))
        return false
      return true
    })
    .map((method) => ({
      method,
      operation: (pathItem as Record<string, unknown>)[
        method
      ] as OpenAPIV3.OperationObject,
    }))

  if (operations.length === 0) return null

  return (
    <div className="rounded border border-zinc-700 overflow-hidden">
      {operations.map(({ method, operation }) => (
        <OperationCard
          key={method}
          method={method}
          path={path}
          operation={operation}
          spec={spec}
          onNavigate={() => onNavigate(`paths.${path}.${method}`)}
        />
      ))}
    </div>
  )
}

function OperationCard({
  method,
  path,
  operation,
  spec,
  onNavigate,
}: {
  method: string
  path: string
  operation: OpenAPIV3.OperationObject
  spec: OpenAPIV3.Document
  onNavigate: () => void
}) {
  const style = METHOD_STYLES[method] ?? METHOD_STYLES.get
  const [copied, setCopied] = useState(false)

  const copyPath = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    },
    [path],
  )

  const extensions = useMemo(
    () => extractExtensions(operation as unknown as Record<string, unknown>),
    [operation],
  )

  // Resolve parameter $refs
  const parameters = useMemo(() => {
    if (!operation.parameters) return []
    return operation.parameters
      .map((param) => {
        if ('$ref' in param) {
          const resolved = resolveRef(param as SchemaObject, spec)
          return resolved?.schema as OpenAPIV3.ParameterObject | undefined
        }
        return param as OpenAPIV3.ParameterObject
      })
      .filter((p): p is OpenAPIV3.ParameterObject => p !== undefined)
  }, [operation.parameters, spec])

  const hasParameters = parameters.length > 0

  return (
    <div
      className={`p-3 border-b border-zinc-800 last:border-b-0 ${
        operation.deprecated ? 'opacity-60' : ''
      }`}
    >
      <div
        className="cursor-pointer hover:bg-zinc-800/50 -m-3 p-3 transition-colors"
        onClick={onNavigate}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onNavigate()
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${style.bg} ${style.text}`}
          >
            {method}
          </span>
          <code className="text-sm text-zinc-200 font-mono">{path}</code>
          <button
            type="button"
            onClick={copyPath}
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
            aria-label="Copy path"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <CopySnippetButton
            buildRequest={() =>
              buildSnippetFromOperation(method, path, operation, spec)
            }
          />
          {operation.deprecated && (
            <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 text-xs rounded">
              Deprecated
            </span>
          )}
          <ExtensionBadges extensions={extensions} />
        </div>

        {operation.summary && (
          <p className="mt-2 text-sm text-zinc-200">{operation.summary}</p>
        )}

        {operation.description && (
          <div className="mt-1 text-xs text-zinc-400">
            <Markdown>{operation.description}</Markdown>
          </div>
        )}
      </div>

      {/* Parameters */}
      {hasParameters && (
        <CollapsibleSection
          title="Parameters"
          defaultExpanded={parameters.length <= 3}
          badge={
            <span className="ml-2 px-1.5 py-0.5 bg-zinc-700 text-zinc-400 text-xs rounded">
              {parameters.length}
            </span>
          }
        >
          <div className="bg-zinc-800/50 rounded p-2">
            {parameters.map((param) => (
              <ParameterRow
                key={`${param.in}-${param.name}`}
                param={param}
                spec={spec}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Request Body */}
      {operation.requestBody && (
        <RequestBodySection
          requestBody={operation.requestBody as OpenAPIV3.RequestBodyObject}
          spec={spec}
        />
      )}

      {/* Responses */}
      {operation.responses && (
        <ResponseSection responses={operation.responses} spec={spec} />
      )}

      {/* Security */}
      {operation.security && operation.security.length > 0 && (
        <SecuritySection
          security={operation.security}
          securitySchemes={spec.components?.securitySchemes}
          spec={spec}
        />
      )}
    </div>
  )
}

function SchemaCard({
  name,
  schema,
  spec,
  onNavigate,
}: {
  name: string
  schema: OpenAPIV3.SchemaObject
  spec: OpenAPIV3.Document
  onNavigate: () => void
}) {
  const properties = schema.properties ? Object.entries(schema.properties) : []
  const required = schema.required ?? []
  const composition = getComposition(schema)
  const schemaType = composition ? composition.type : (schema.type ?? 'object')

  return (
    <div className="rounded border border-zinc-700 overflow-hidden">
      <div
        className="p-3 cursor-pointer hover:bg-zinc-800 transition-colors"
        onClick={onNavigate}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onNavigate()
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-200">{name}</span>
          <span className="text-xs text-zinc-500">{schemaType}</span>
          <CopyAsTypeScript
            schema={schema as SchemaObject}
            spec={spec}
            name={name}
          />
        </div>

        {schema.description && (
          <div className="mt-1 text-xs text-zinc-400">
            <Markdown>{schema.description}</Markdown>
          </div>
        )}
      </div>

      {(properties.length > 0 || composition) && (
        <div className="border-t border-zinc-700 p-3 bg-zinc-800/30">
          {composition && (
            <SchemaDisplay
              schema={schema as SchemaObject}
              spec={spec}
              depth={0}
              maxDepth={3}
            />
          )}
          {properties.length > 0 && !composition && (
            <>
              <div className="text-xs text-zinc-500 mb-2">
                Properties ({properties.length})
              </div>
              <div className="space-y-2">
                {properties.map(([propName, propSchema]) => {
                  const propObj = propSchema as OpenAPIV3.SchemaObject
                  const isRequired = required.includes(propName)
                  const type = getPropertyType(propObj, spec)

                  return (
                    <div key={propName} className="flex items-start gap-2">
                      <span className="font-mono text-xs text-zinc-300 shrink-0">
                        {propName}
                        {isRequired && <span className="text-red-500">*</span>}
                      </span>
                      <span className="text-xs text-zinc-500">{type}</span>
                      {propObj.description && (
                        <span className="text-xs text-zinc-400 flex-1">
                          {propObj.description}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function getPropertyType(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  spec: OpenAPIV3.Document,
): string {
  if ('$ref' in schema) {
    const refPath = schema.$ref
    const parts = refPath.split('/')
    return parts[parts.length - 1]
  }

  if (schema.type === 'array' && schema.items) {
    const itemType = getPropertyType(
      schema.items as OpenAPIV3.SchemaObject,
      spec,
    )
    return `array<${itemType}>`
  }

  if (schema.allOf) {
    const types = schema.allOf.map((s) =>
      getPropertyType(s as OpenAPIV3.SchemaObject, spec),
    )
    return types.join(' & ')
  }

  if (schema.oneOf) {
    const types = schema.oneOf.map((s) =>
      getPropertyType(s as OpenAPIV3.SchemaObject, spec),
    )
    return types.join(' | ')
  }

  if (schema.anyOf) {
    const types = schema.anyOf.map((s) =>
      getPropertyType(s as OpenAPIV3.SchemaObject, spec),
    )
    return types.join(' | ')
  }

  const baseType = schema.type ?? 'object'
  if (schema.format) {
    return `${baseType} (${schema.format})`
  }

  return baseType as string
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
      />
      <span className="text-sm text-zinc-300">{label}</span>
    </label>
  )
}
