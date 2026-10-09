import { fileNameOf } from '../../core'
import { ToolchainBanner } from './components/ToolchainBanner'
import { Toolbar } from './components/Toolbar'
import { useDocument } from './hooks/useDocument'

export function App() {
  const document = useDocument()

  return (
    <div className="app">
      <Toolbar
        fileName={fileNameOf(document.state.path)}
        isDirty={document.isDirty}
        onOpen={() => void document.open()}
        onSave={() => void document.save()}
        onSaveAs={() => void document.saveAs()}
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
      <main className="editor-area">
        <textarea
          className="source-editor"
          aria-label="Markdown source"
          spellCheck={false}
          value={document.state.content}
          onChange={(event) => document.edit(event.target.value)}
        />
      </main>
    </div>
  )
}
