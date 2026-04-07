import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OpenAPIV3 } from 'openapi-types'
import type { EditorView } from '@codemirror/view'
import type { VersionSnapshot } from '../services/version-history-db'
import { DEFAULT_SPEC } from '../constants/default-spec'
import { detectLanguage } from '../utils/content'

// Re-export types from workers/types.ts to avoid duplication
export type {
  ValidationError,
  SourcePosition,
  SourceMap,
  GraphEdgeType,
  SchemaProperty,
  GraphNode,
  GraphEdge,
  GraphData,
  DiffChangeType,
  DiffChange,
  DiffSummary,
  DiffResult,
} from '../workers/types'

export type { VersionSnapshot } from '../services/version-history-db'

import type {
  ValidationError,
  SourceMap,
  GraphData,
  DiffResult,
} from '../workers/types'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  duration: number
}

export interface EditorFile {
  id: string
  name: string
  content: string
  path?: string
  isDirty: boolean
  language: 'yaml' | 'json'
}

export type RightPanelView = 'preview' | 'graph' | 'diff' | 'tryit' | 'history'
export type GraphFilter = 'all' | 'referenced' | 'orphaned'
export type DiffFilter = 'all' | 'breaking' | 'non-breaking'

export interface ComparisonSpec {
  content: string
  parsed: OpenAPIV3.Document
  sourceMap: SourceMap
  name: string
}

export type AuthType = 'none' | 'bearer' | 'apiKey' | 'basic'

export interface AuthConfig {
  type: AuthType
  bearerToken: string
  apiKeyName: string
  apiKeyValue: string
  apiKeyLocation: 'header' | 'query'
  username: string
  password: string
}

export interface TryItResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  responseTimeMs: number
  error?: string
  isCorsError?: boolean
}

export interface TryItState {
  selectedOperationId: string | null
  selectedServer: string | null
  customServerUrl: string
  authConfig: AuthConfig
  parameterValues: Record<string, string>
  requestBody: string
  requestContentType: string
  isExecuting: boolean
  lastResponse: TryItResponse | null
}

interface EditorState {
  file: EditorFile | null
  parsedSpec: OpenAPIV3.Document | null
  sourceMap: SourceMap
  isValidating: boolean
  syntaxValid: boolean
  schemaValid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  showPreview: boolean
  showOutline: boolean
  showMinimap: boolean
  rightPanelView: RightPanelView
  graphData: GraphData | null
  graphFilter: GraphFilter
  isGraphLoading: boolean
  comparisonSpec: ComparisonSpec | null
  diffResult: DiffResult | null
  diffFilter: DiffFilter
  isDiffLoading: boolean
  tryIt: TryItState
  versionHistory: VersionSnapshot[]
  selectedSnapshotId: string | null
  isHistoryLoading: boolean
  toasts: Toast[]
  editorView: EditorView | null
  cursorLine: number
  cursorColumn: number
  currentPath: string | null
}

interface EditorActions {
  setFile: (file: EditorFile | null) => void
  syncFileFromTab: (file: EditorFile) => void
  updateContent: (content: string) => void
  markClean: () => void
  updateFileIdentity: (file: EditorFile) => void
  setParsedSpec: (spec: OpenAPIV3.Document | null, sourceMap: SourceMap) => void
  setValidating: (isValidating: boolean) => void
  setValidationResult: (result: {
    syntaxValid: boolean
    schemaValid: boolean
    errors: ValidationError[]
    warnings: ValidationError[]
  }) => void
  clearValidation: () => void
  togglePreview: () => void
  toggleOutline: () => void
  toggleMinimap: () => void
  setRightPanelView: (view: RightPanelView) => void
  setGraphData: (data: GraphData | null) => void
  setGraphFilter: (filter: GraphFilter) => void
  setGraphLoading: (loading: boolean) => void
  setComparisonSpec: (spec: ComparisonSpec | null) => void
  setDiffResult: (result: DiffResult | null) => void
  setDiffFilter: (filter: DiffFilter) => void
  setDiffLoading: (loading: boolean) => void
  clearComparison: () => void
  setTryItOperation: (operationId: string | null) => void
  setTryItServer: (server: string | null) => void
  setTryItCustomServer: (url: string) => void
  setTryItAuth: (config: Partial<AuthConfig>) => void
  setTryItParameter: (key: string, value: string) => void
  setTryItRequestBody: (body: string) => void
  setTryItContentType: (contentType: string) => void
  setTryItExecuting: (executing: boolean) => void
  setTryItResponse: (response: TryItResponse | null) => void
  resetTryItParameters: () => void
  setVersionHistory: (history: VersionSnapshot[]) => void
  addSnapshot: (snapshot: VersionSnapshot) => void
  removeSnapshot: (id: string) => void
  setSelectedSnapshot: (id: string | null) => void
  setHistoryLoading: (loading: boolean) => void
  showToast: (type: Toast['type'], message: string, duration?: number) => void
  dismissToast: (id: string) => void
  setEditorView: (view: EditorView | null) => void
  goToLine: (line: number, column?: number) => void
  goToPosition: (pos: number) => void
  setCursorPosition: (line: number, column: number) => void
  setCurrentPath: (path: string | null) => void
}

type EditorStore = EditorState & EditorActions

const FILE_RESET_STATE: Pick<
  EditorState,
  | 'parsedSpec'
  | 'sourceMap'
  | 'errors'
  | 'warnings'
  | 'versionHistory'
  | 'selectedSnapshotId'
> = {
  parsedSpec: null,
  sourceMap: {},
  errors: [],
  warnings: [],
  versionHistory: [],
  selectedSnapshotId: null,
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      file: {
        id: 'default',
        name: 'openapi.yaml',
        content: DEFAULT_SPEC,
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
      showPreview: true,
      showOutline: true,
      showMinimap: true,
      rightPanelView: 'preview',
      graphData: null,
      graphFilter: 'all',
      isGraphLoading: false,
      comparisonSpec: null,
      diffResult: null,
      diffFilter: 'all',
      isDiffLoading: false,
      tryIt: {
        selectedOperationId: null,
        selectedServer: null,
        customServerUrl: '',
        authConfig: {
          type: 'none',
          bearerToken: '',
          apiKeyName: '',
          apiKeyValue: '',
          apiKeyLocation: 'header',
          username: '',
          password: '',
        },
        parameterValues: {},
        requestBody: '',
        requestContentType: 'application/json',
        isExecuting: false,
        lastResponse: null,
      },
      versionHistory: [],
      selectedSnapshotId: null,
      isHistoryLoading: false,
      toasts: [],
      editorView: null,
      cursorLine: 1,
      cursorColumn: 1,
      currentPath: null,

      setFile: (file) =>
        set({ file, ...FILE_RESET_STATE }),

      syncFileFromTab: (file) =>
        set((state) => {
          if (
            state.file?.id === file.id &&
            state.file?.content === file.content
          ) {
            return {}
          }
          const isSameFile = state.file?.id === file.id
          return {
            file,
            ...(isSameFile ? {} : FILE_RESET_STATE),
          }
        }),

      updateContent: (content) =>
        set((state) => {
          if (!state.file) return { file: null }
          const language = detectLanguage(state.file.name, content)
          return {
            file: { ...state.file, content, isDirty: true, language },
          }
        }),

      markClean: () =>
        set((state) => ({
          file: state.file ? { ...state.file, isDirty: false } : null,
        })),

      updateFileIdentity: (file) => set({ file }),
      setParsedSpec: (spec, sourceMap) => set({ parsedSpec: spec, sourceMap }),
      setValidating: (isValidating) => set({ isValidating }),

      setValidationResult: (result) =>
        set({
          syntaxValid: result.syntaxValid,
          schemaValid: result.schemaValid,
          errors: result.errors,
          warnings: result.warnings,
          isValidating: false,
        }),

      clearValidation: () =>
        set({
          errors: [],
          warnings: [],
          syntaxValid: true,
          schemaValid: true,
        }),

      togglePreview: () =>
        set((state) => ({ showPreview: !state.showPreview })),
      toggleOutline: () =>
        set((state) => ({ showOutline: !state.showOutline })),
      toggleMinimap: () =>
        set((state) => ({ showMinimap: !state.showMinimap })),
      setRightPanelView: (view) => set({ rightPanelView: view }),
      setGraphData: (data) => set({ graphData: data }),
      setGraphFilter: (filter) => set({ graphFilter: filter }),
      setGraphLoading: (loading) => set({ isGraphLoading: loading }),
      setComparisonSpec: (spec) => set({ comparisonSpec: spec }),
      setDiffResult: (result) => set({ diffResult: result }),
      setDiffFilter: (filter) => set({ diffFilter: filter }),
      setDiffLoading: (loading) => set({ isDiffLoading: loading }),
      clearComparison: () => set({ comparisonSpec: null, diffResult: null }),
      setTryItOperation: (operationId) =>
        set((state) => ({
          tryIt: {
            ...state.tryIt,
            selectedOperationId: operationId,
            parameterValues: {},
            requestBody: '',
            lastResponse: null,
          },
        })),
      setTryItServer: (server) =>
        set((state) => ({
          tryIt: { ...state.tryIt, selectedServer: server },
        })),
      setTryItCustomServer: (url) =>
        set((state) => ({
          tryIt: { ...state.tryIt, customServerUrl: url },
        })),
      setTryItAuth: (config) =>
        set((state) => ({
          tryIt: {
            ...state.tryIt,
            authConfig: { ...state.tryIt.authConfig, ...config },
          },
        })),
      setTryItParameter: (key, value) =>
        set((state) => ({
          tryIt: {
            ...state.tryIt,
            parameterValues: { ...state.tryIt.parameterValues, [key]: value },
          },
        })),
      setTryItRequestBody: (body) =>
        set((state) => ({
          tryIt: { ...state.tryIt, requestBody: body },
        })),
      setTryItContentType: (contentType) =>
        set((state) => ({
          tryIt: { ...state.tryIt, requestContentType: contentType },
        })),
      setTryItExecuting: (executing) =>
        set((state) => ({
          tryIt: { ...state.tryIt, isExecuting: executing },
        })),
      setTryItResponse: (response) =>
        set((state) => ({
          tryIt: { ...state.tryIt, lastResponse: response, isExecuting: false },
        })),
      resetTryItParameters: () =>
        set((state) => ({
          tryIt: { ...state.tryIt, parameterValues: {}, requestBody: '' },
        })),

      setVersionHistory: (history) => set({ versionHistory: history }),
      addSnapshot: (snapshot) =>
        set((state) => ({
          versionHistory: [snapshot, ...state.versionHistory],
        })),
      removeSnapshot: (id) =>
        set((state) => ({
          versionHistory: state.versionHistory.filter((s) => s.id !== id),
          selectedSnapshotId:
            state.selectedSnapshotId === id ? null : state.selectedSnapshotId,
        })),
      setSelectedSnapshot: (id) => set({ selectedSnapshotId: id }),
      setHistoryLoading: (loading) => set({ isHistoryLoading: loading }),

      showToast: (type, message, duration = 4000) =>
        set((state) => ({
          toasts: [
            ...state.toasts,
            { id: crypto.randomUUID(), type, message, duration },
          ],
        })),
      dismissToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      setEditorView: (view) => set({ editorView: view }),

      goToLine: (line, column = 1) => {
        const { editorView } = get()
        if (!editorView) return

        try {
          const lineInfo = editorView.state.doc.line(line)
          const pos = lineInfo.from + Math.max(0, column - 1)

          editorView.dispatch({
            selection: { anchor: pos },
            scrollIntoView: true,
          })
          editorView.focus()
        } catch {
          // Silently ignore invalid line numbers
        }
      },

      setCursorPosition: (line, column) =>
        set({ cursorLine: line, cursorColumn: column }),
      setCurrentPath: (path) => set({ currentPath: path }),

      goToPosition: (pos) => {
        const { editorView } = get()
        if (!editorView) return

        editorView.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
        })
        editorView.focus()
      },
    }),
    {
      name: 'specable-editor',
      partialize: (state) => ({
        showPreview: state.showPreview,
        showOutline: state.showOutline,
        showMinimap: state.showMinimap,
        rightPanelView: state.rightPanelView,
        graphFilter: state.graphFilter,
        diffFilter: state.diffFilter,
        file: state.file,
        // Persist TryIt preferences but NOT sensitive credentials
        tryIt: {
          selectedServer: state.tryIt.selectedServer,
          customServerUrl: state.tryIt.customServerUrl,
          authConfig: {
            type: state.tryIt.authConfig.type,
            apiKeyLocation: state.tryIt.authConfig.apiKeyLocation,
          },
          requestContentType: state.tryIt.requestContentType,
        },
      }),
    },
  ),
)
