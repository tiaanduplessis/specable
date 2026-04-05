# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Specable is a local-first OpenAPI editor for power users, built with React 19, TypeScript, Vite 7, and Tailwind CSS 4. It aims to provide responsive validation, keyboard-first workflows, and intelligent navigation for large API specifications.

## Development Commands

```bash
pnpm dev          # Start development server
pnpm build        # Type-check and build for production
pnpm lint         # Run ESLint
pnpm preview      # Preview production build
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm test:coverage # Run tests with coverage report

# Run a single test file
pnpm test src/utils/source-map.test.ts

# Run tests matching a pattern
pnpm test -t "source map"
```

## Architecture

### State Management

- **Zustand store** (`src/store/index.ts`): Single store managing file state, parsed spec, validation results, and UI state (panel visibility, editor reference)
- State is persisted to localStorage for panel preferences and current file

### Web Workers

All heavy processing is offloaded to Web Workers using Comlink for typed RPC:

- `validator.worker.ts`: YAML/JSON parsing, OpenAPI schema validation (@readme/openapi-parser)
- `linter.worker.ts`: Spectral linting for best practices
- `graph.worker.ts`: Builds schema relationship graph (nodes and edges) from parsed spec
- `diff.worker.ts`: Computes API differences with breaking change detection (uses deep-diff)

Worker API types are defined in `src/workers/types.ts`. The store (`src/store/index.ts`) re-exports these types to provide a unified import path.

Workers are created using the factory in `src/services/worker-factory.ts` which provides `createWorker()` and `createLazyWorker()` helpers.

### Validation Pipeline

- **ValidationPipeline** (`src/services/validation-pipeline.ts`): Coordinates validator and linter workers with debouncing (300ms) and cancellation
- **Singleton**: Use `getValidationPipeline()` to get the shared instance
- **Data flow**: Content change → `useValidation` hook → debounced `ValidationPipeline.validate()` → worker → store update
- **Cancellation**: Uses `AbortController` to cancel in-flight validations when content changes rapidly
- OpenAPI 3.1.x, 3.0.x, and 2.0 (Swagger) specs all receive full schema validation.

### Editor

- **CodeMirror 6** (`src/components/Editor/`):
  - `extensions.ts`: Language modes (YAML/JSON), syntax highlighting, folding, autocomplete
  - `theme.ts`: Custom dark theme
  - `ref-navigation.ts`: `$ref` click-to-navigate and F12 go-to-definition

### Layout

- **Three-panel layout** (`src/components/Layout/MainLayout.tsx`):
  - Left: OutlineView (hierarchical spec navigation)
  - Centre: CodeMirror editor
  - Right: Switchable view (preview/graph/diff/tryit/history) controlled by `rightPanelView` state
- Resizable panels with drag handles
- StatusBar shows validation status and diagnostics count

### Right Panel Views

- **DocumentationView**: Rendered API documentation preview
- **GraphView**: Interactive schema relationship graph using PixiJS and d3-force for layout
- **DiffView**: API comparison tool with breaking change detection (load a second spec to compare)
- **TryItOut**: Interactive API testing panel for executing requests against servers defined in the spec
- **HistoryView**: Version history with IndexedDB-backed snapshots (deduped by content hash)

### Command Palette

- `Ctrl+Shift+P` to open
- Fuzzy search via Fuse.js
- Commands for navigation, editing, view toggles, and file operations

### Keyboard Shortcuts

- **File**: `Ctrl+N` (new), `Ctrl+O` (open), `Ctrl+S` (save), `Ctrl+Shift+S` (save as)
- **Navigation**: `Ctrl+G` (go to line), `F12` (go to definition), `Ctrl+Click` (navigate to `$ref`), `Ctrl+Shift+P` (command palette), `F1` (keyboard shortcuts)
- **View**: `Ctrl+Shift+E` (toggle outline), `Ctrl+\` (toggle preview), `Ctrl+1`-`Ctrl+5` (switch right panel view)
- **Editor**: `Shift+Alt+F` (format), `Ctrl+K Ctrl+0` (fold all), `Ctrl+K Ctrl+J` (unfold all)

### File System

- Uses File System Access API for native file open/save (`src/services/file-system.ts`)
- `useFileSystem` hook wraps operations and updates store

### Version History

- **IndexedDB storage** (`src/services/version-history-db.ts`): Persists spec snapshots with SHA-256 deduplication
- **Singleton**: Use `getVersionHistoryDB()` to get the shared instance
- Automatically prunes old snapshots (default 50 per file)

### Custom Hooks

- `useValidation`: Triggers validation pipeline on content changes, updates store with results
- `useFileSystem`: Wraps File System Access API operations, handles open/save with store updates
- `useVersionHistory`: Manages snapshot loading/saving with IndexedDB
- `useViewport`: Tracks viewport width for responsive behaviour
- `useStorageSync`: Syncs store state across browser tabs via localStorage storage events

## Key Patterns

### Singleton Services

Several services use singleton patterns - always use the getter functions rather than instantiating directly:

- `getValidationPipeline()` - validation/linting coordinator
- `getVersionHistoryDB()` - IndexedDB version storage
- `getFileSystem()` - file system access (native or fallback)

- **React Compiler** is enabled (babel-plugin-react-compiler) for automatic memoisation
- **Source maps** track YAML/JSON positions back to original content for accurate error locations
- **Node polyfills** (vite-plugin-node-polyfills) allow @readme/openapi-parser to run in browser

## Testing

- **Vitest** with jsdom environment and React Testing Library
- Test files: `src/**/*.test.{ts,tsx}`
- Setup file (`src/test/setup.ts`) mocks `matchMedia`, `ResizeObserver`, and `scrollIntoView` for jsdom compatibility
- Worker tests may require mocking Comlink or testing worker logic in isolation
