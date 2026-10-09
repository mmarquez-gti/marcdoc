import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  findMappingProblems,
  MAPPING_KEY_INFO,
  type MappingProblem,
  MAPPING_KEYS,
  type MappingKey,
  type StyleInfo,
  type StyleMapping,
} from '../../../core/docx'
import type { MessageKey, Translate } from '../../../shared/i18n'
import type { TemplateDetails, TemplateInfo } from '../../../shared/ipc'
import { useT } from '../i18n'

/** Front matter keys offered for cover fields; others typed in the file are kept. */
const FRONT_MATTER_KEYS = ['title', 'subtitle', 'author', 'date', 'abstract'] as const

interface MappingEditorProps {
  readonly templatePath: string
  readonly onSaved: (template: TemplateInfo) => void
  readonly onClose: () => void
}

export function MappingEditor({ templatePath, onSaved, onClose }: MappingEditorProps) {
  const t = useT()
  const [details, setDetails] = useState<TemplateDetails | null>(null)
  const [draft, setDraft] = useState<StyleMapping | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.marcdoc.inspectTemplate(templatePath).then(
      (loaded) => {
        setDetails(loaded)
        setDraft(loaded.mapping)
      },
      (cause: unknown) => setError(String(cause)),
    )
  }, [templatePath])

  const problems = useMemo(
    () => (draft && details ? findMappingProblems(draft, details.styles) : []),
    [draft, details],
  )

  if (!details || !draft) {
    return <p role="status">{error ?? t('mapping.reading')}</p>
  }

  const setStyle = (key: MappingKey, id: string) => {
    const styles = { ...draft.styles }
    if (id) styles[key] = id
    else delete styles[key]
    setDraft({ ...draft, styles })
  }

  const setCover = (tag: string, key: string) => {
    const cover = { ...draft.cover }
    if (key) cover[tag] = key
    else delete cover[tag]
    setDraft({ ...draft, cover })
  }

  const save = async () => {
    try {
      setError(null)
      onSaved(await window.marcdoc.saveMapping(templatePath, draft))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(cause),
      )
    }
  }

  return (
    <div className="mapping-editor">
      <h3>{t('mapping.title', { name: details.template.name })}</h3>
      {!details.editable && <p className="notice">{t('mapping.readOnly')}</p>}
      {details.mappingError && (
        <p className="notice">{t('mapping.invalidFile', { error: details.mappingError })}</p>
      )}

      <fieldset disabled={!details.editable}>
        <legend>{t('mapping.elements')}</legend>
        <div className="mapping-grid">
          {MAPPING_KEYS.map((key) => (
            <label key={key}>
              <span>{t(`mapping.key.${key}`)}</span>
              <StyleSelect
                label={t(`mapping.key.${key}`)}
                styles={details.styles.filter(
                  (style) => style.type === MAPPING_KEY_INFO[key].styleType,
                )}
                value={draft.styles[key] ?? ''}
                onChange={(id) => setStyle(key, id)}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!details.editable}>
        <legend>{t('mapping.bodyAndCover')}</legend>
        <label className="mapping-row">
          <span>{t('mapping.bodyPlaceholder')}</span>
          <input
            aria-label={t('mapping.bodyPlaceholder')}
            value={draft.bodyPlaceholder}
            onChange={(event) => setDraft({ ...draft, bodyPlaceholder: event.target.value })}
          />
        </label>
        {details.coverTags.length === 0 ? (
          <small>{t('mapping.noCover')}</small>
        ) : (
          details.coverTags.map((tag) => (
            <label key={tag} className="mapping-row">
              <span>
                {t('mapping.coverField', { tag: '' })}
                <code>{tag}</code>
              </span>
              <select
                aria-label={t('mapping.coverField', { tag })}
                value={draft.cover[tag] ?? ''}
                onChange={(event) => setCover(tag, event.target.value)}
              >
                <option value="">{t('mapping.coverLeave')}</option>
                {[
                  ...new Set([
                    ...FRONT_MATTER_KEYS,
                    ...(draft.cover[tag] ? [draft.cover[tag]] : []),
                  ]),
                ].map((key) => (
                  <option key={key} value={key}>
                    {t('mapping.frontMatterKey', { key })}
                  </option>
                ))}
              </select>
            </label>
          ))
        )}
      </fieldset>

      {problems.length > 0 && (
        <ul className="mapping-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem.key}>{describeProblem(problem, t)}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!details.editable || problems.length > 0 || draft.bodyPlaceholder.trim() === ''}
          onClick={() => void save()}
        >
          <Check size={14} aria-hidden />
          {t('mapping.save')}
        </button>
      </div>
    </div>
  )
}

function describeProblem(problem: MappingProblem, t: Translate): string {
  const element = t(`mapping.key.${problem.key}`)
  if (problem.kind === 'missingStyle')
    return t('mapping.problem.missingStyle', { element, id: problem.id })
  return t('mapping.problem.wrongType', {
    element,
    style: problem.styleName,
    actual: t(`mapping.styleType.${problem.actual}` as MessageKey),
    expected: t(`mapping.styleType.${problem.expected}` as MessageKey),
  })
}

function StyleSelect({
  label,
  styles,
  value,
  onChange,
}: {
  label: string
  styles: readonly StyleInfo[]
  value: string
  onChange: (id: string) => void
}) {
  const t = useT()
  const known = styles.some((style) => style.id === value)
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t('mapping.pandocStyle')}</option>
      {value && !known && <option value={value}>{t('mapping.missingStyle', { id: value })}</option>}
      {styles.map((style) => (
        <option key={style.id} value={style.id}>
          {style.name === style.id ? style.name : `${style.name} (${style.id})`}
        </option>
      ))}
    </select>
  )
}
