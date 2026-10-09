import { useEffect, useMemo, useState } from 'react'
import {
  checkMappingAgainst,
  MAPPING_KEY_INFO,
  MAPPING_KEYS,
  type MappingKey,
  type StyleInfo,
  type StyleMapping,
} from '../../../core/docx'
import type { TemplateDetails, TemplateInfo } from '../../../shared/ipc'

/** Front matter keys offered for cover fields; others typed in the file are kept. */
const FRONT_MATTER_KEYS = ['title', 'subtitle', 'author', 'date', 'abstract'] as const

interface MappingEditorProps {
  readonly templatePath: string
  readonly onSaved: (template: TemplateInfo) => void
  readonly onClose: () => void
}

export function MappingEditor({ templatePath, onSaved, onClose }: MappingEditorProps) {
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
    () => (draft && details ? checkMappingAgainst(draft, details.styles) : []),
    [draft, details],
  )

  if (!details || !draft) {
    return <p role="status">{error ?? 'Reading template…'}</p>
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
      <h3>Style mapping · {details.template.name}</h3>
      {!details.editable && (
        <p className="notice">
          This template is bundled with MarcDoc and read-only. Use “Choose…” with a copy of it to
          customize the mapping.
        </p>
      )}
      {details.mappingError && (
        <p className="notice">The current mapping file is invalid: {details.mappingError}</p>
      )}

      <fieldset disabled={!details.editable}>
        <legend>Markdown element → template style</legend>
        <div className="mapping-grid">
          {MAPPING_KEYS.map((key) => (
            <label key={key}>
              <span>{MAPPING_KEY_INFO[key].label}</span>
              <StyleSelect
                label={MAPPING_KEY_INFO[key].label}
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
        <legend>Body and cover</legend>
        <label className="mapping-row">
          <span>Body placeholder</span>
          <input
            aria-label="Body placeholder"
            value={draft.bodyPlaceholder}
            onChange={(event) => setDraft({ ...draft, bodyPlaceholder: event.target.value })}
          />
        </label>
        {details.coverTags.length === 0 ? (
          <small>The template has no content controls, so there is no cover to fill.</small>
        ) : (
          details.coverTags.map((tag) => (
            <label key={tag} className="mapping-row">
              <span>
                Cover field <code>{tag}</code>
              </span>
              <select
                aria-label={`Cover field ${tag}`}
                value={draft.cover[tag] ?? ''}
                onChange={(event) => setCover(tag, event.target.value)}
              >
                <option value="">Leave as in the template</option>
                {[
                  ...new Set([
                    ...FRONT_MATTER_KEYS,
                    ...(draft.cover[tag] ? [draft.cover[tag]] : []),
                  ]),
                ].map((key) => (
                  <option key={key} value={key}>
                    Front matter “{key}”
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
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Back
        </button>
        <button
          type="button"
          className="primary"
          disabled={!details.editable || problems.length > 0 || draft.bodyPlaceholder.trim() === ''}
          onClick={() => void save()}
        >
          Save mapping
        </button>
      </div>
    </div>
  )
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
  const known = styles.some((style) => style.id === value)
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Pandoc’s style</option>
      {value && !known && <option value={value}>⚠ {value} (not in template)</option>}
      {styles.map((style) => (
        <option key={style.id} value={style.id}>
          {style.name === style.id ? style.name : `${style.name} (${style.id})`}
        </option>
      ))}
    </select>
  )
}
