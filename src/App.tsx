import { useEffect, useRef } from 'react'
import { MainLayout } from './components/Layout'
import { FullscreenPreview } from './components/Preview/FullscreenPreview'
import { useEditorStore } from './store'
import { loadSharedSpec, clearSharedHash } from './services/share'

function App() {
  const params = new URLSearchParams(window.location.search)
  const isPreviewMode = params.get('view') === 'preview'
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const shared = loadSharedSpec()
    if (shared) {
      useEditorStore.getState().setFile({
        id: crypto.randomUUID(),
        name: `shared-spec.${shared.language === 'json' ? 'json' : 'yaml'}`,
        content: shared.content,
        isDirty: false,
        language: shared.language,
      })
      clearSharedHash()
    }
  }, [])

  if (isPreviewMode) {
    return <FullscreenPreview />
  }

  return <MainLayout />
}

export default App
