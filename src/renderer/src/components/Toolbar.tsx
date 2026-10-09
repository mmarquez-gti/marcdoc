import {
  Code,
  Columns2,
  FilePen,
  FileText,
  FolderOpen,
  Save,
  Share,
  type LucideIcon,
} from 'lucide-react'
import type { MessageKey } from '../../../shared/i18n'
import type { ViewMode } from '../../../shared/ipc'
import { useT } from '../i18n'

const ICON_SIZE = 16
const VIEW_MODES: readonly { mode: ViewMode; icon: LucideIcon }[] = [
  { mode: 'split', icon: Columns2 },
  { mode: 'wysiwyg', icon: FileText },
  { mode: 'source', icon: Code },
]

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

/** Top bar: file actions, document name, view switch and the main action, Export. */
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
    <header className="topbar">
      <div className="topbar-group">
        <button type="button" className="btn" onClick={onOpen} title={t('toolbar.openTitle')}>
          <FolderOpen size={ICON_SIZE} aria-hidden />
          {t('toolbar.open')}
        </button>
        <button type="button" className="btn" onClick={onSave} title={t('toolbar.saveTitle')}>
          <Save size={ICON_SIZE} aria-hidden />
          {t('toolbar.save')}
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={onSaveAs}
          title={t('toolbar.saveAsTitle')}
          aria-label={t('toolbar.saveAs')}
        >
          <FilePen size={ICON_SIZE} aria-hidden />
        </button>
      </div>

      <div className="document-name" data-testid="file-name">
        <strong>{fileName ?? t('app.untitled')}</strong>
        {isDirty && <span className="dirty-mark" role="img" aria-label={t('toolbar.unsaved')} />}
      </div>

      <div className="segmented" role="radiogroup" aria-label={t('toolbar.view')}>
        {VIEW_MODES.map(({ mode, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={viewMode === mode}
            title={t(`toolbar.view.${mode}Title` as MessageKey)}
            onClick={() => onViewModeChange(mode)}
          >
            <Icon size={14} aria-hidden />
            {t(`toolbar.view.${mode}` as MessageKey)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={onExport}
        disabled={exportBusy}
        title={t('toolbar.exportTitle')}
      >
        <Share size={ICON_SIZE} aria-hidden />
        {t('toolbar.export')}
      </button>
    </header>
  )
}
