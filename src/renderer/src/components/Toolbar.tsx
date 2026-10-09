import type { MessageKey } from '../../../shared/i18n'
import type { ViewMode } from '../../../shared/ipc'
import { useT } from '../i18n'

const VIEW_MODES: readonly ViewMode[] = ['split', 'wysiwyg', 'source']

interface ToolbarProps {
  readonly viewMode: ViewMode
  readonly onViewModeChange: (mode: ViewMode) => void
  readonly fileName: string | null
  readonly isDirty: boolean
  readonly onOpen: () => void
  readonly onSave: () => void
  readonly onSaveAs: () => void
  readonly onExport: () => void
  /** An export is running; another one cannot start. */
  readonly exportBusy: boolean
}

export function Toolbar({
  fileName,
  isDirty,
  onOpen,
  onSave,
  onSaveAs,
  onExport,
  exportBusy,
  viewMode,
  onViewModeChange,
}: ToolbarProps) {
  const t = useT()
  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={onOpen} title={t('toolbar.openTitle')}>
          {t('toolbar.open')}
        </button>
        <button type="button" onClick={onSave} title={t('toolbar.saveTitle')}>
          {t('toolbar.save')}
        </button>
        <button type="button" onClick={onSaveAs} title={t('toolbar.saveAsTitle')}>
          {t('toolbar.saveAs')}
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exportBusy}
          title={t('toolbar.exportTitle')}
        >
          {t('toolbar.export')}
        </button>
      </div>
      <div className="toolbar-group view-switch" role="radiogroup" aria-label={t('toolbar.view')}>
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={viewMode === mode}
            title={t(`toolbar.view.${mode}Title` as MessageKey)}
            className={viewMode === mode ? 'active' : ''}
            onClick={() => onViewModeChange(mode)}
          >
            {t(`toolbar.view.${mode}` as MessageKey)}
          </button>
        ))}
      </div>
      <span className="toolbar-file" data-testid="file-name">
        {fileName ?? t('app.untitled')}
        {isDirty && (
          <span className="dirty-mark" aria-label={t('toolbar.unsaved')}>
            {' '}
            •
          </span>
        )}
      </span>
    </header>
  )
}
