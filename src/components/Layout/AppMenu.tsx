import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Menu, Check } from 'lucide-react'
import { useEditorStore, type RightPanelView } from '../../store'
import { useClickOutside } from '../../hooks/useClickOutside'

type MenuItemType = 'action' | 'toggle' | 'radio'

interface MenuItemDef {
  id: string
  label: string
  shortcut?: string
  type: MenuItemType
  isActive?: boolean
  action: () => void
}

interface MenuSectionDef {
  title: string
  groups: MenuItemDef[][]
}

interface AppMenuProps {
  onNewFile: () => void
  onOpenFile: () => void
  onImportFile: () => void
  onImportUrl: () => void
  onSave: () => void
  onSaveAs: () => void
  onShare: () => void
  onExportJson: () => void
  onExportYaml: () => void
  onFormatDocument: () => void
  onSortContent: () => void
  onCreateSnapshot: () => void
  onToggleOutline: () => void
  onTogglePreview: () => void
  onShowKeyboardShortcuts: () => void
  onOpenCommandPalette: () => void
  onSetRightPanelView: (view: RightPanelView) => void
}

export function AppMenu({
  onNewFile,
  onOpenFile,
  onImportFile,
  onImportUrl,
  onSave,
  onSaveAs,
  onShare,
  onExportJson,
  onExportYaml,
  onFormatDocument,
  onSortContent,
  onCreateSnapshot,
  onToggleOutline,
  onTogglePreview,
  onShowKeyboardShortcuts,
  onOpenCommandPalette,
  onSetRightPanelView,
}: AppMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const showOutline = useEditorStore((state) => state.showOutline)
  const showPreview = useEditorStore((state) => state.showPreview)
  const showMinimap = useEditorStore((state) => state.showMinimap)
  const toggleMinimap = useEditorStore((state) => state.toggleMinimap)
  const rightPanelView = useEditorStore((state) => state.rightPanelView)
  const editorView = useEditorStore((state) => state.editorView)

  const setViewAndOpen = useCallback(
    (view: RightPanelView) => {
      onSetRightPanelView(view)
      if (!showPreview) onTogglePreview()
    },
    [onSetRightPanelView, showPreview, onTogglePreview],
  )

  const dispatchEditorCommand = useCallback(
    (
      importFn: () => Promise<{ default?: unknown; [key: string]: unknown }>,
      commandName: string,
    ) => {
      if (!editorView) return
      importFn().then((mod) => {
        const command = mod[commandName] as
          | ((view: typeof editorView) => boolean)
          | undefined
        if (command) command(editorView)
      })
    },
    [editorView],
  )

  const sections: MenuSectionDef[] = useMemo(
    () => [
      {
        title: 'File',
        groups: [
          [
            {
              id: 'file.new',
              label: 'New File',
              shortcut: 'Ctrl+N',
              type: 'action' as const,
              action: onNewFile,
            },
            {
              id: 'file.open',
              label: 'Open File...',
              shortcut: 'Ctrl+O',
              type: 'action' as const,
              action: onOpenFile,
            },
            {
              id: 'file.importFile',
              label: 'Import from File...',
              type: 'action' as const,
              action: onImportFile,
            },
            {
              id: 'file.importUrl',
              label: 'Import from URL...',
              type: 'action' as const,
              action: onImportUrl,
            },
          ],
          [
            {
              id: 'file.save',
              label: 'Save',
              shortcut: 'Ctrl+S',
              type: 'action' as const,
              action: onSave,
            },
            {
              id: 'file.saveAs',
              label: 'Save As...',
              shortcut: 'Ctrl+Shift+S',
              type: 'action' as const,
              action: onSaveAs,
            },
          ],
          [
            {
              id: 'file.share',
              label: 'Share Spec...',
              shortcut: 'Ctrl+Shift+L',
              type: 'action' as const,
              action: onShare,
            },
          ],
          [
            {
              id: 'file.exportJson',
              label: 'Export as JSON...',
              type: 'action' as const,
              action: onExportJson,
            },
            {
              id: 'file.exportYaml',
              label: 'Export as YAML...',
              type: 'action' as const,
              action: onExportYaml,
            },
          ],
        ],
      },
      {
        title: 'Edit',
        groups: [
          [
            {
              id: 'edit.undo',
              label: 'Undo',
              shortcut: 'Ctrl+Z',
              type: 'action' as const,
              action: () =>
                dispatchEditorCommand(
                  () => import('@codemirror/commands'),
                  'undo',
                ),
            },
            {
              id: 'edit.redo',
              label: 'Redo',
              shortcut: 'Ctrl+Y',
              type: 'action' as const,
              action: () =>
                dispatchEditorCommand(
                  () => import('@codemirror/commands'),
                  'redo',
                ),
            },
            {
              id: 'edit.selectAll',
              label: 'Select All',
              shortcut: 'Ctrl+A',
              type: 'action' as const,
              action: () =>
                dispatchEditorCommand(
                  () => import('@codemirror/commands'),
                  'selectAll',
                ),
            },
          ],
          [
            {
              id: 'edit.find',
              label: 'Find',
              shortcut: 'Ctrl+F',
              type: 'action' as const,
              action: () =>
                dispatchEditorCommand(
                  () => import('@codemirror/search'),
                  'openSearchPanel',
                ),
            },
            {
              id: 'edit.findReplace',
              label: 'Find and Replace',
              shortcut: 'Ctrl+H',
              type: 'action' as const,
              action: () => {
                if (!editorView) return
                import('@codemirror/search').then(({ openSearchPanel }) => {
                  openSearchPanel(editorView)
                })
              },
            },
          ],
          [
            {
              id: 'edit.format',
              label: 'Format Document',
              shortcut: 'Shift+Alt+F',
              type: 'action' as const,
              action: onFormatDocument,
            },
            {
              id: 'edit.sort',
              label: 'Sort Paths and Schemas',
              type: 'action' as const,
              action: onSortContent,
            },
            {
              id: 'edit.snapshot',
              label: 'Create Snapshot',
              type: 'action' as const,
              action: onCreateSnapshot,
            },
          ],
          [
            {
              id: 'edit.foldAll',
              label: 'Fold All',
              shortcut: 'Ctrl+K Ctrl+0',
              type: 'action' as const,
              action: () =>
                dispatchEditorCommand(
                  () => import('@codemirror/language'),
                  'foldAll',
                ),
            },
            {
              id: 'edit.unfoldAll',
              label: 'Unfold All',
              shortcut: 'Ctrl+K Ctrl+J',
              type: 'action' as const,
              action: () =>
                dispatchEditorCommand(
                  () => import('@codemirror/language'),
                  'unfoldAll',
                ),
            },
          ],
        ],
      },
      {
        title: 'View',
        groups: [
          [
            {
              id: 'view.outline',
              label: 'Outline Panel',
              shortcut: 'Ctrl+Shift+E',
              type: 'toggle' as const,
              isActive: showOutline,
              action: onToggleOutline,
            },
            {
              id: 'view.preview',
              label: 'Preview Panel',
              shortcut: 'Ctrl+\\',
              type: 'toggle' as const,
              isActive: showPreview,
              action: onTogglePreview,
            },
            {
              id: 'view.minimap',
              label: 'Minimap',
              type: 'toggle' as const,
              isActive: showMinimap,
              action: toggleMinimap,
            },
          ],
          [
            {
              id: 'view.docs',
              label: 'Docs',
              shortcut: 'Ctrl+1',
              type: 'radio' as const,
              isActive: showPreview && rightPanelView === 'preview',
              action: () => setViewAndOpen('preview'),
            },
            {
              id: 'view.graph',
              label: 'Graph',
              shortcut: 'Ctrl+2',
              type: 'radio' as const,
              isActive: showPreview && rightPanelView === 'graph',
              action: () => setViewAndOpen('graph'),
            },
            {
              id: 'view.diff',
              label: 'Diff',
              shortcut: 'Ctrl+3',
              type: 'radio' as const,
              isActive: showPreview && rightPanelView === 'diff',
              action: () => setViewAndOpen('diff'),
            },
            {
              id: 'view.tryit',
              label: 'Try It',
              shortcut: 'Ctrl+4',
              type: 'radio' as const,
              isActive: showPreview && rightPanelView === 'tryit',
              action: () => setViewAndOpen('tryit'),
            },
            {
              id: 'view.history',
              label: 'History',
              shortcut: 'Ctrl+5',
              type: 'radio' as const,
              isActive: showPreview && rightPanelView === 'history',
              action: () => setViewAndOpen('history'),
            },
          ],
        ],
      },
      {
        title: 'Help',
        groups: [
          [
            {
              id: 'help.commandPalette',
              label: 'Command Palette',
              shortcut: 'Ctrl+Shift+P',
              type: 'action' as const,
              action: onOpenCommandPalette,
            },
            {
              id: 'help.shortcuts',
              label: 'Keyboard Shortcuts',
              shortcut: 'F1',
              type: 'action' as const,
              action: onShowKeyboardShortcuts,
            },
          ],
        ],
      },
    ],
    [
      onNewFile,
      onOpenFile,
      onImportFile,
      onImportUrl,
      onSave,
      onSaveAs,
      onShare,
      onExportJson,
      onExportYaml,
      dispatchEditorCommand,
      editorView,
      onFormatDocument,
      onSortContent,
      onCreateSnapshot,
      showOutline,
      onToggleOutline,
      showPreview,
      onTogglePreview,
      showMinimap,
      toggleMinimap,
      rightPanelView,
      setViewAndOpen,
      onOpenCommandPalette,
      onShowKeyboardShortcuts,
    ],
  )

  const flatItems = useMemo(
    () =>
      sections.flatMap((section) => section.groups.flatMap((group) => group)),
    [sections],
  )

  const itemIndexById = useMemo(() => {
    const map = new Map<string, number>()
    flatItems.forEach((item, index) => map.set(item.id, index))
    return map
  }, [flatItems])

  const close = useCallback(() => {
    setIsOpen(false)
    setSelectedIndex(0)
    requestAnimationFrame(() => {
      triggerRef.current?.focus()
    })
  }, [])

  const handleItemClick = useCallback(
    (item: MenuItemDef) => {
      item.action()
      close()
    },
    [close],
  )

  useClickOutside(menuRef, close, isOpen)

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          close()
          break
        case 'ArrowDown':
          event.preventDefault()
          setSelectedIndex((prev) =>
            prev < flatItems.length - 1 ? prev + 1 : 0,
          )
          break
        case 'ArrowUp':
          event.preventDefault()
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatItems.length - 1,
          )
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (flatItems[selectedIndex]) {
            handleItemClick(flatItems[selectedIndex])
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, flatItems, close, handleItemClick])

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={() => {
          if (isOpen) {
            close()
          } else {
            setIsOpen(true)
            setSelectedIndex(0)
          }
        }}
        className={`p-3 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${
          isOpen
            ? 'bg-purple-500/20 text-purple-400'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
        }`}
        aria-label="Application menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'app-menu-dropdown' : undefined}
      >
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id="app-menu-dropdown"
          className="absolute right-0 top-full mt-1 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-y-auto max-h-[calc(100vh-64px)]"
          role="menu"
          aria-label="Application menu"
        >
          {sections.map((section, sectionIdx) => (
            <div key={section.title}>
              {sectionIdx > 0 && <div className="border-t border-zinc-800" />}
              <div className="px-3 pt-3 pb-1.5">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  {section.title}
                </span>
              </div>
              {section.groups.map((group, groupIdx) => (
                <div key={groupIdx}>
                  {groupIdx > 0 && (
                    <div className="mx-3 my-1 border-t border-zinc-800/50" />
                  )}
                  {group.map((item) => {
                    const currentIndex = itemIndexById.get(item.id) ?? 0
                    const isSelected = currentIndex === selectedIndex
                    const hasCheck = item.type !== 'action' && item.isActive

                    return (
                      <button
                        key={item.id}
                        role={
                          item.type === 'toggle'
                            ? 'menuitemcheckbox'
                            : item.type === 'radio'
                              ? 'menuitemradio'
                              : 'menuitem'
                        }
                        aria-checked={
                          item.type !== 'action' ? item.isActive : undefined
                        }
                        className={`mx-1 w-[calc(100%-8px)] px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-purple-500/20 text-zinc-100'
                            : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                        onClick={() => handleItemClick(item)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                      >
                        <span className="w-4 flex-shrink-0 flex items-center justify-center">
                          {hasCheck && (
                            <Check className="w-3.5 h-3.5 text-purple-400" />
                          )}
                        </span>
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 text-xs rounded font-mono bg-zinc-800 text-zinc-500 flex-shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="h-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
