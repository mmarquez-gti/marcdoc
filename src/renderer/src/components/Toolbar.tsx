interface ToolbarProps {
  readonly fileName: string | null
  readonly isDirty: boolean
  readonly onOpen: () => void
  readonly onSave: () => void
  readonly onSaveAs: () => void
}

export function Toolbar({ fileName, isDirty, onOpen, onSave, onSaveAs }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={onOpen} title="Open (Ctrl+O)">
          Open
        </button>
        <button type="button" onClick={onSave} title="Save (Ctrl+S)">
          Save
        </button>
        <button type="button" onClick={onSaveAs} title="Save As (Ctrl+Shift+S)">
          Save As
        </button>
      </div>
      <span className="toolbar-file" data-testid="file-name">
        {fileName ?? 'Untitled'}
        {isDirty && (
          <span className="dirty-mark" aria-label="Unsaved changes">
            {' '}
            •
          </span>
        )}
      </span>
    </header>
  )
}
