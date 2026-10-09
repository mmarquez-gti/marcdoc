import { useEffect, useRef, useState } from 'react'
import { fileNameOf } from '../../core'
import type { ViewMode } from '../../shared/ipc'
import { Banner } from './components/Banner'
import { ExportDialog } from './components/ExportDialog'
import { ExportStatusBanner } from './components/ExportStatusBanner'
import { ToolchainBanner } from './components/ToolchainBanner'
import { Toolbar } from './components/Toolbar'
import { CodeView, type CodeViewHandle } from './editors/code/CodeView'
import { WysiwygView, type WysiwygViewHandle } from './editors/wysiwyg/WysiwygView'
import { useDocument } from './hooks/useDocument'
import { useExport } from './hooks/useExport'
import { useScrollSync } from './hooks/useScrollSync'

export function App() {
  const document = useDocument()
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const codeRef = useRef<CodeViewHandle>(null)
  const wysiwygRef = useRef<WysiwygViewHandle>(null)
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null)
  const documentKey = String(document.state.generation)
  const exporter = useExport(document.state)

  useScrollSync(document.state.content, documentKey, viewMode === 'split', codeRef, wysiwygRef)

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        if (command.startsWith('view-')) setViewMode(command.slice('view-'.length) as ViewMode)
      }),
    [],
  )

  return (
    <div className={`app view-${viewMode}`}>
      <Toolbar
        fileName={fileNameOf(document.state.path)}
        isDirty={document.isDirty}
        onOpen={() => void document.open()}
        onSave={() => void document.save()}
        onSaveAs={() => void document.saveAs()}
        onExport={exporter.openDialog}
        exportBusy={exporter.status.kind === 'running'}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {/* The document view renders its formatting toolbar here (hidden in source-only view). */}
      <div className="format-slot" ref={setToolbarSlot} />
      <ToolchainBanner />
      <ExportStatusBanner status={exporter.status} onDismiss={exporter.dismiss} />
      {exporter.dialogOpen && (
        <ExportDialog
          initialFormat={exporter.lastFormat}
          template={exporter.template}
          onTemplateChange={exporter.setTemplate}
          latexTemplate={exporter.latexTemplate}
          onLatexTemplateChange={exporter.setLatexTemplate}
          onExport={(format) => void exporter.run(format)}
          onClose={exporter.closeDialog}
        />
      )}
      {document.error && (
        <Banner kind="error" onDismiss={document.clearError}>
          {document.error}
        </Banner>
      )}
      {/* Hidden views stay mounted so both remain in sync and keep their undo history. */}
      <main className={`editor-area view-${viewMode}`}>
        <WysiwygView
          ref={wysiwygRef}
          toolbarSlot={toolbarSlot}
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
