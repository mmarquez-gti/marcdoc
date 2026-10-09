import type { ViewMode } from '../../../shared/ipc'

const VIEW_MODES: readonly { mode: ViewMode; label: string; title: string }[] = [
  { mode: 'split', label: 'Both', title: 'Document and source (Ctrl+1)' },
  { mode: 'wysiwyg', label: 'Document', title: 'Document only (Ctrl+2)' },
  { mode: 'source', label: 'Source', title: 'Source only (Ctrl+3)' },
]

interface ToolbarProps {
  readonly viewMode: ViewMode
  readonly onViewModeChange: (mode: ViewMode) => void
  readonly fileName: string | null
  readonly isDirty: boolean
  readonly onOpen: () => void
  readonly onSave: () => void
  readonly onSaveAs: () => void
}

export function Toolbar({
  fileName,
  isDirty,
  onOpen,
  onSave,
  onSaveAs,
  viewMode,
  onViewModeChange,
}: ToolbarProps) {
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
      <div className="toolbar-group view-switch" role="radiogroup" aria-label="View">
        {VIEW_MODES.map(({ mode, label, title }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={viewMode === mode}
            title={title}
            className={viewMode === mode ? 'active' : ''}
            onClick={() => onViewModeChange(mode)}
          >
            {label}
          </button>
        ))}
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
