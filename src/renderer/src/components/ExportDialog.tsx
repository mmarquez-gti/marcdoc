import { useEffect, useRef, useState } from 'react'
import { EXPORT_FORMATS, type ExportFormat } from '../../../core/export/formats'
import type { LatexTemplateInfo, TemplateInfo, ToolStatus } from '../../../shared/ipc'
import { MappingEditor } from './MappingEditor'
import { useT } from '../i18n'

const FORMAT_ORDER: readonly ExportFormat[] = ['docx', 'pdf-latex', 'pdf-html', 'latex']

interface ExportDialogProps {
  readonly initialFormat: ExportFormat
  /** Selected Word template; null means MarcDoc's default template. */
  readonly template: TemplateInfo | null
  readonly onTemplateChange: (template: TemplateInfo | null) => void
  /** Pandoc LaTeX template; null means Pandoc's default template. */
  readonly latexTemplate: LatexTemplateInfo | null
  readonly onLatexTemplateChange: (template: LatexTemplateInfo | null) => void
  readonly onExport: (format: ExportFormat) => void
  readonly onClose: () => void
}

export function ExportDialog({
  initialFormat,
  template,
  onTemplateChange,
  latexTemplate,
  onLatexTemplateChange,
  onExport,
  onClose,
}: ExportDialogProps) {
  const t = useT()
  const [format, setFormat] = useState<ExportFormat>(initialFormat)
  const [tools, setTools] = useState<readonly ToolStatus[] | null>(null)
  const [bundled, setBundled] = useState<readonly TemplateInfo[]>([])
  const [bundledLatex, setBundledLatex] = useState<readonly LatexTemplateInfo[]>([])
  const [editingMapping, setEditingMapping] = useState(false)
  const [chooseError, setChooseError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.marcdoc.getToolchainStatus().then(setTools)
    void window.marcdoc.listTemplates().then(setBundled)
    void window.marcdoc.listLatexTemplates().then(setBundledLatex)
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
          ? t('tools.missingShort', { tool: tool.label, files: tool.missingFiles.join(', ') })
          : t('tools.notInstalled', { tool: tool.label }),
      )
      .join('; ')
  }

  /** Runs a template picker; the main process explains files it rejects. */
  const pick = async <T,>(choose: () => Promise<T | null>, apply: (chosen: T) => void) => {
    try {
      setChooseError(null)
      const chosen = await choose()
      if (chosen) apply(chosen)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setChooseError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  const chooseTemplate = () => pick(() => window.marcdoc.chooseTemplate(), onTemplateChange)

  const chooseLatexTemplate = () =>
    pick(() => window.marcdoc.chooseLatexTemplate(), onLatexTemplateChange)

  const latexOptions = [
    ...bundledLatex,
    ...(latexTemplate && !bundledLatex.some((t) => t.path === latexTemplate.path)
      ? [latexTemplate]
      : []),
  ]

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
        <h2 id="export-dialog-title">{t('export.title')}</h2>
        {editingMapping && template ? (
          <MappingEditor
            templatePath={template.path}
            onSaved={(saved) => {
              onTemplateChange(saved)
              setEditingMapping(false)
            }}
            onClose={() => setEditingMapping(false)}
          />
        ) : (
          <>
            <fieldset>
              <legend>{t('export.format')}</legend>
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
                      <strong>{t(`export.format.${candidate}`)}</strong>
                      <small>{reason ?? t(`export.hint.${candidate}`)}</small>
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {format === 'docx' && (
              <fieldset>
                <legend>{t('export.wordTemplate')}</legend>
                <div className="template-row">
                  <select
                    aria-label={t('export.wordTemplate')}
                    value={template?.path ?? ''}
                    onChange={(event) =>
                      onTemplateChange(
                        templateOptions.find((option) => option.path === event.target.value) ??
                          null,
                      )
                    }
                  >
                    <option value="">{t('export.defaultTemplate')}</option>
                    {templateOptions.map((option) => (
                      <option key={option.path} value={option.path}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void chooseTemplate()}>
                    {t('export.choose')}
                  </button>
                  {template && (
                    <button type="button" onClick={() => setEditingMapping(true)}>
                      {t('export.styleMapping')}
                    </button>
                  )}
                </div>
                {template && (
                  <small className="template-note">
                    {template.hasMappingFile ? t('export.mappingFile') : t('export.noMappingFile')}
                  </small>
                )}
              </fieldset>
            )}

            {(format === 'pdf-latex' || format === 'latex') && (
              <fieldset>
                <legend>{t('export.latexTemplate')}</legend>
                <div className="template-row">
                  <select
                    aria-label={t('export.latexTemplate')}
                    value={latexTemplate?.path ?? ''}
                    onChange={(event) =>
                      onLatexTemplateChange(
                        latexOptions.find((option) => option.path === event.target.value) ?? null,
                      )
                    }
                  >
                    <option value="">{t('export.pandocDefault')}</option>
                    {latexOptions.map((option) => (
                      <option key={option.path} value={option.path}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void chooseLatexTemplate()}>
                    {t('export.choose')}
                  </button>
                </div>
                <small className="template-note">{t('export.latexTemplateNote')}</small>
              </fieldset>
            )}

            {chooseError && (
              <p className="notice" role="alert">
                {chooseError}
              </p>
            )}

            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={blocked !== null}
                onClick={() => onExport(format)}
              >
                {t('export.export')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
