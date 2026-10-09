import { useEffect, useRef, useState } from 'react'
import { EXPORT_FORMATS, type ExportFormat } from '../../../core/export/formats'
import type { TemplateInfo, ToolStatus } from '../../../shared/ipc'

const FORMAT_ORDER: readonly ExportFormat[] = ['docx', 'pdf-latex', 'pdf-html', 'latex']

const FORMAT_HINTS: Readonly<Record<ExportFormat, string>> = {
  docx: 'Word document following the styles of a template',
  'pdf-latex': 'Best typography; requires LuaLaTeX',
  'pdf-html': 'Looks like the document view',
  latex: 'Standalone .tex source',
}

interface ExportDialogProps {
  readonly initialFormat: ExportFormat
  /** Selected Word template; null means MarcDoc's default template. */
  readonly template: TemplateInfo | null
  readonly onTemplateChange: (template: TemplateInfo | null) => void
  readonly onExport: (format: ExportFormat) => void
  readonly onClose: () => void
}

export function ExportDialog({
  initialFormat,
  template,
  onTemplateChange,
  onExport,
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>(initialFormat)
  const [tools, setTools] = useState<readonly ToolStatus[] | null>(null)
  const [bundled, setBundled] = useState<readonly TemplateInfo[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.marcdoc.getToolchainStatus().then(setTools)
    void window.marcdoc.listTemplates().then(setBundled)
    dialogRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
  }, [])

  const unavailable = (candidate: ExportFormat): string | null => {
    if (!tools) return null
    const missing = EXPORT_FORMATS[candidate].requires
      .map((id) => tools.find((tool) => tool.id === id))
      .filter((tool): tool is ToolStatus => tool !== undefined && !tool.supported)
    if (missing.length === 0) return null
    return missing
      .map((tool) =>
        tool.missingFiles.length > 0
          ? `${tool.label} is missing ${tool.missingFiles.join(', ')}`
          : `${tool.label} is not installed`,
      )
      .join('; ')
  }

  const chooseTemplate = async () => {
    const chosen = await window.marcdoc.chooseTemplate()
    if (chosen) onTemplateChange(chosen)
  }

  const templateOptions = [
    ...bundled,
    ...(template && !bundled.some((t) => t.path === template.path) ? [template] : []),
  ]
  const blocked = unavailable(format)

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <h2 id="export-dialog-title">Export</h2>
        <fieldset>
          <legend>Format</legend>
          {FORMAT_ORDER.map((candidate) => {
            const reason = unavailable(candidate)
            return (
              <label key={candidate} className={reason ? 'option disabled' : 'option'}>
                <input
                  type="radio"
                  name="format"
                  value={candidate}
                  checked={format === candidate}
                  disabled={reason !== null}
                  onChange={() => setFormat(candidate)}
                />
                <span>
                  <strong>{EXPORT_FORMATS[candidate].label}</strong>
                  <small>{reason ?? FORMAT_HINTS[candidate]}</small>
                </span>
              </label>
            )
          })}
        </fieldset>

        {format === 'docx' && (
          <fieldset>
            <legend>Word template</legend>
            <div className="template-row">
              <select
                aria-label="Word template"
                value={template?.path ?? ''}
                onChange={(event) =>
                  onTemplateChange(
                    templateOptions.find((option) => option.path === event.target.value) ?? null,
                  )
                }
              >
                <option value="">MarcDoc default</option>
                {templateOptions.map((option) => (
                  <option key={option.path} value={option.path}>
                    {option.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void chooseTemplate()}>
                Choose…
              </button>
            </div>
            {template && (
              <small className="template-note">
                {template.hasMappingFile
                  ? 'Styles follow the template’s mapping file.'
                  : 'No mapping file next to this template: Markdown elements use Word’s built-in styles of the same name.'}
              </small>
            )}
          </fieldset>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={blocked !== null}
            onClick={() => onExport(format)}
          >
            Export…
          </button>
        </div>
      </div>
    </div>
  )
}
