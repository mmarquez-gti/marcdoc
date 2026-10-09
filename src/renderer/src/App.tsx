import { useEffect, useRef, useState } from 'react'
import { fileNameOf } from '../../core'
import type { ViewMode } from '../../shared/ipc'
import { ToolchainBanner } from './components/ToolchainBanner'
import { Toolbar } from './components/Toolbar'
import { CodeView, type CodeViewHandle } from './editors/code/CodeView'
import { WysiwygView, type WysiwygViewHandle } from './editors/wysiwyg/WysiwygView'
import { useDocument } from './hooks/useDocument'
import { useScrollSync } from './hooks/useScrollSync'

export function App() {
  const document = useDocument()
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const codeRef = useRef<CodeViewHandle>(null)
  const wysiwygRef = useRef<WysiwygViewHandle>(null)
  const documentKey = String(document.state.generation)

  useScrollSync(document.state.content, documentKey, viewMode === 'split', codeRef, wysiwygRef)

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        if (command.startsWith('view-')) setViewMode(command.slice('view-'.length) as ViewMode)
      }),
    [],
  )

  return (
    <div className="app">
      <Toolbar
        fileName={fileNameOf(document.state.path)}
        isDirty={document.isDirty}
        onOpen={() => void document.open()}
        onSave={() => void document.save()}
        onSaveAs={() => void document.saveAs()}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <ToolchainBanner />
      {document.error && (
        <div className="banner banner-error" role="alert">
          <span>{document.error}</span>
          <button type="button" onClick={document.clearError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {/* Hidden views stay mounted so both remain in sync and keep their undo history. */}
      <main className={`editor-area view-${viewMode}`}>
        <WysiwygView
          ref={wysiwygRef}
          documentKey={documentKey}
          value={document.state.content}
          onChange={document.edit}
          onError={document.reportError}
        />
        <CodeView
          ref={codeRef}
          documentKey={documentKey}
          value={document.state.content}
          onChange={document.edit}
        />
      </main>
    </div>
  )
}
