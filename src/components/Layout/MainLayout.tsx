import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useEditorStore, type RightPanelView } from '../../store'
import { Editor } from '../Editor'
import { OutlineView } from '../Outline'
import { DocumentationView } from '../Preview'
import { GraphView } from '../GraphView'
import { DiffView } from '../DiffView'
import { TryItOutView } from '../TryItOut'
import { HistoryView } from '../HistoryView'
import { ToastContainer } from '../Toast'
import { StatusBar } from './StatusBar'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'
import { AboutModal } from './AboutModal'
import { AppMenu } from './AppMenu'
import { MobileLayout } from './MobileLayout'
import {
  CommandPalette,
  useCommandPalette,
  type Command,
} from '../CommandPalette'
import { useValidation } from '../../hooks/useValidation'
import { shareSpec } from '../../services/share'
import { useFileSystem } from '../../hooks/useFileSystem'
import { useVersionHistory } from '../../hooks/useVersionHistory'
import { useViewport } from '../../hooks/useViewport'
import { formatEditorContent } from '../../utils/format'
import { sortEditorContent } from '../../utils/sort'

const MIN_PANEL_WIDTH = 150
const DEFAULT_OUTLINE_WIDTH = 220
const DEFAULT_PREVIEW_WIDTH = 350
const MIN_DIAGNOSTICS_HEIGHT = 100
const MAX_DIAGNOSTICS_HEIGHT = 600
const DEFAULT_DIAGNOSTICS_HEIGHT = 300

export function MainLayout() {
  const { isMobile } = useViewport()
  const showOutline = useEditorStore((state) => state.showOutline)
  const showPreview = useEditorStore((state) => state.showPreview)
  const toggleOutline = useEditorStore((state) => state.toggleOutline)
  const togglePreview = useEditorStore((state) => state.togglePreview)
  const rightPanelView = useEditorStore((state) => state.rightPanelView)
  const setRightPanelView = useEditorStore((state) => state.setRightPanelView)

  const [outlineWidth, setOutlineWidth] = useState(DEFAULT_OUTLINE_WIDTH)
  const [previewWidth, setPreviewWidth] = useState(DEFAULT_PREVIEW_WIDTH)
  const [diagnosticsHeight, setDiagnosticsHeight] = useState(
    DEFAULT_DIAGNOSTICS_HEIGHT,
  )
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingOutline = useRef(false)
  const isDraggingPreview = useRef(false)
  const isDraggingDiagnostics = useRef(false)
  const diagnosticsStartY = useRef(0)
  const diagnosticsStartHeight = useRef(0)

  const {
    openFile,
    importFromFile,
    importFromUrl,
    saveFile,
    saveFileAs,
    newFile,
    exportAsJson,
    exportAsYaml,
  } = useFileSystem()

  const { createSnapshot } = useVersionHistory()

  const file = useEditorStore((state) => state.file)
  const showToast = useEditorStore((state) => state.showToast)

  const handleShare = useCallback(async () => {
    if (!file) {
      showToast('error', 'Nothing to share — no file is open.')
      return
    }
    const result = await shareSpec(file.content, file.name)
    switch (result.type) {
      case 'url':
        showToast('success', result.message)
        break
      case 'webshare':
      case 'download':
        showToast('info', result.message)
        break
      case 'error':
        showToast('error', result.message)
        break
    }
  }, [file, showToast])

  const fileCommands: Command[] = useMemo(
    () => [
      {
        id: 'file.new',
        label: 'New File',
        shortcut: 'Ctrl+N',
        category: 'file',
        action: newFile,
      },
      {
        id: 'file.open',
        label: 'Open File...',
        shortcut: 'Ctrl+O',
        category: 'file',
        action: openFile,
      },
      {
        id: 'file.importFile',
        label: 'Import from File...',
        category: 'file',
        action: () => {
          importFromFile()
        },
      },
      {
        id: 'file.importUrl',
        label: 'Import from URL...',
        category: 'file',
        action: () => {
          importFromUrl()
        },
      },
      {
        id: 'file.save',
        label: 'Save',
        shortcut: 'Ctrl+S',
        category: 'file',
        action: saveFile,
      },
      {
        id: 'file.saveAs',
        label: 'Save As...',
        shortcut: 'Ctrl+Shift+S',
        category: 'file',
        action: saveFileAs,
      },
      {
        id: 'file.exportJson',
        label: 'Export as JSON...',
        category: 'file',
        action: exportAsJson,
      },
      {
        id: 'file.exportYaml',
        label: 'Export as YAML...',
        category: 'file',
        action: exportAsYaml,
      },
      {
        id: 'file.share',
        label: 'Share Spec...',
        shortcut: 'Ctrl+Shift+L',
        category: 'file',
        action: handleShare,
      },
      {
        id: 'history.show',
        label: 'Show Version History',
        shortcut: 'Ctrl+5',
        category: 'view',
        action: () => {
          setRightPanelView('history')
          if (!showPreview) togglePreview()
        },
      },
      {
        id: 'history.createSnapshot',
        label: 'Create Snapshot',
        category: 'edit',
        action: () => {
          createSnapshot('Manual snapshot')
        },
      },
    ],
    [
      newFile,
      openFile,
      importFromFile,
      importFromUrl,
      saveFile,
      saveFileAs,
      exportAsJson,
      exportAsYaml,
      handleShare,
      setRightPanelView,
      showPreview,
      togglePreview,
      createSnapshot,
    ],
  )

  const {
    isOpen: isCommandPaletteOpen,
    open: openCommandPalette,
    close: closeCommandPalette,
    commands,
  } = useCommandPalette(fileCommands)

  useValidation()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        toggleOutline()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        togglePreview()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        newFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        openFile()
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        saveFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        saveFileAs()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        handleShare()
      }
      if (e.key === 'F1') {
        e.preventDefault()
        setShowKeyboardShortcuts((prev) => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        setRightPanelView('preview')
        if (!showPreview) togglePreview()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault()
        setRightPanelView('graph')
        if (!showPreview) togglePreview()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault()
        setRightPanelView('diff')
        if (!showPreview) togglePreview()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '4') {
        e.preventDefault()
        setRightPanelView('tryit')
        if (!showPreview) togglePreview()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '5') {
        e.preventDefault()
        setRightPanelView('history')
        if (!showPreview) togglePreview()
      }
      if (e.shiftKey && e.altKey && e.key === 'F') {
        e.preventDefault()
        formatEditorContent()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    toggleOutline,
    togglePreview,
    newFile,
    openFile,
    saveFile,
    saveFileAs,
    handleShare,
    setRightPanelView,
    showPreview,
  ])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()

    if (isDraggingOutline.current) {
      const newWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(e.clientX - rect.left, rect.width / 3),
      )
      setOutlineWidth(newWidth)
    }

    if (isDraggingPreview.current) {
      const newWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(rect.right - e.clientX, rect.width / 2),
      )
      setPreviewWidth(newWidth)
    }

    if (isDraggingDiagnostics.current) {
      const deltaY = diagnosticsStartY.current - e.clientY
      const newHeight = Math.max(
        MIN_DIAGNOSTICS_HEIGHT,
        Math.min(
          diagnosticsStartHeight.current + deltaY,
          MAX_DIAGNOSTICS_HEIGHT,
        ),
      )
      setDiagnosticsHeight(newHeight)
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    isDraggingOutline.current = false
    isDraggingPreview.current = false
    isDraggingDiagnostics.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const startDraggingOutline = useCallback(() => {
    isDraggingOutline.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startDraggingPreview = useCallback(() => {
    isDraggingPreview.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startDraggingDiagnostics = useCallback(
    (e: React.MouseEvent) => {
      isDraggingDiagnostics.current = true
      diagnosticsStartY.current = e.clientY
      diagnosticsStartHeight.current = diagnosticsHeight
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [diagnosticsHeight],
  )

  if (isMobile) {
    return (
      <>
        <MobileLayout onShowAbout={() => setShowAbout(true)} />
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={closeCommandPalette}
          commands={commands}
        />
        <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
        <ToastContainer />
      </>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 relative">
      <header className="h-12 flex items-center justify-between px-4 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAbout(true)}
            type="button"
            aria-label="About Specable"
            className="text-zinc-100 tracking-tight font-mono font-bold text-xl hover:text-purple-400 transition-colors"
          >
            SPECABLE
          </button>
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded">
            BETA
          </span>
        </div>
        <AppMenu
          onNewFile={newFile}
          onOpenFile={openFile}
          onImportFile={() => importFromFile()}
          onImportUrl={() => importFromUrl()}
          onSave={saveFile}
          onSaveAs={saveFileAs}
          onShare={handleShare}
          onExportJson={exportAsJson}
          onExportYaml={exportAsYaml}
          onFormatDocument={formatEditorContent}
          onSortContent={sortEditorContent}
          onCreateSnapshot={() => createSnapshot('Manual snapshot')}
          onToggleOutline={toggleOutline}
          onTogglePreview={togglePreview}
          onShowKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
          onOpenCommandPalette={openCommandPalette}
          onSetRightPanelView={setRightPanelView}
        />
      </header>

      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {showOutline && (
          <>
            <aside
              style={{ width: outlineWidth }}
              className="shrink-0"
              aria-label="Outline"
            >
              <OutlineView />
            </aside>
            <div
              className="w-3 flex items-center justify-center cursor-col-resize group touch-none"
              onPointerDown={startDraggingOutline}
            >
              <div className="w-px h-full bg-zinc-800 group-hover:bg-purple-500 group-active:bg-purple-500 transition-colors" />
            </div>
          </>
        )}

        <main className="flex-1 min-w-0" aria-label="Editor">
          <Editor />
        </main>

        {showPreview && (
          <>
            <div
              className="w-3 flex items-center justify-center cursor-col-resize group touch-none"
              onPointerDown={startDraggingPreview}
            >
              <div className="w-px h-full bg-zinc-800 group-hover:bg-purple-500 group-active:bg-purple-500 transition-colors" />
            </div>
            <aside
              style={{ width: previewWidth }}
              className="shrink-0 flex flex-col"
              aria-label="Right Panel"
            >
              <RightPanelTabs
                activeView={rightPanelView}
                onViewChange={setRightPanelView}
              />
              <div className="flex-1 min-h-0">
                {rightPanelView === 'preview' && <DocumentationView />}
                {rightPanelView === 'graph' && <GraphView />}
                {rightPanelView === 'diff' && <DiffView />}
                {rightPanelView === 'tryit' && <TryItOutView />}
                {rightPanelView === 'history' && <HistoryView />}
              </div>
            </aside>
          </>
        )}
      </div>

      <DiagnosticsPanel
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        height={diagnosticsHeight}
        onResizeStart={startDraggingDiagnostics}
      />

      <StatusBar
        onDiagnosticsClick={() => setShowDiagnostics((prev) => !prev)}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commands={commands}
      />

      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />

      <ToastContainer />
    </div>
  )
}

interface RightPanelTabsProps {
  activeView: RightPanelView
  onViewChange: (view: RightPanelView) => void
}

const VIEW_TABS: { id: RightPanelView; label: string; shortcut: string }[] = [
  { id: 'preview', label: 'Docs', shortcut: 'Ctrl+1' },
  { id: 'graph', label: 'Graph', shortcut: 'Ctrl+2' },
  { id: 'diff', label: 'Diff', shortcut: 'Ctrl+3' },
  { id: 'tryit', label: 'Try It', shortcut: 'Ctrl+4' },
  { id: 'history', label: 'History', shortcut: 'Ctrl+5' },
]

function RightPanelTabs({ activeView, onViewChange }: RightPanelTabsProps) {
  return (
    <div className="flex border-b border-zinc-800 bg-zinc-900/50">
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onViewChange(tab.id)}
          className={`px-3 py-2 text-xs font-medium transition-colors ${
            activeView === tab.id
              ? 'text-purple-400 border-b-2 border-purple-400 -mb-px'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title={tab.shortcut}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
