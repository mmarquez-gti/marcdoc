import type { Command, EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { useState, type FormEvent } from 'react'
import { schema } from '../../../../core/markdown'
import {
  currentBlockStyle,
  currentListKind,
  isInside,
  isMarkActive,
  setHeading,
  setLink,
  setParagraph,
  toggleBlockquote,
  toggleCode,
  toggleEmphasis,
  toggleList,
  toggleStrong,
} from './commands'

const BLOCK_STYLES = [
  { value: 'paragraph', label: 'Normal text', command: setParagraph },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    value: `heading${level}`,
    label: `Heading ${level}`,
    command: setHeading(level),
  })),
]

interface FormatToolbarProps {
  readonly view: EditorView
  /** Passed separately so the toolbar re-renders on every editor change. */
  readonly state: EditorState
}

export function FormatToolbar({ view, state }: FormatToolbarProps) {
  const [linkDraft, setLinkDraft] = useState<string | null>(null)

  const run = (command: Command) => {
    command(view.state, view.dispatch)
    view.focus()
  }

  const blockStyle = currentBlockStyle(state)
  const listKind = currentListKind(state)
  const canLink = !state.selection.empty

  const applyLink = (event: FormEvent) => {
    event.preventDefault()
    run(setLink(linkDraft ?? ''))
    setLinkDraft(null)
  }

  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formatting">
      <select
        aria-label="Block style"
        value={BLOCK_STYLES.some((style) => style.value === blockStyle) ? blockStyle : ''}
        onChange={(event) => {
          const style = BLOCK_STYLES.find((candidate) => candidate.value === event.target.value)
          if (style) run(style.command)
        }}
      >
        <option value="" disabled>
          —
        </option>
        {BLOCK_STYLES.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>
      <ToolButton
        label="Bold (Ctrl+B)"
        active={isMarkActive(state, schema.marks.strong)}
        onClick={() => run(toggleStrong)}
      >
        <strong>B</strong>
      </ToolButton>
      <ToolButton
        label="Italic (Ctrl+I)"
        active={isMarkActive(state, schema.marks.emphasis)}
        onClick={() => run(toggleEmphasis)}
      >
        <em>I</em>
      </ToolButton>
      <ToolButton
        label="Inline code (Ctrl+`)"
        active={isMarkActive(state, schema.marks.code)}
        onClick={() => run(toggleCode)}
      >
        {'</>'}
      </ToolButton>
      <ToolButton
        label="Bulleted list (Ctrl+Shift+8)"
        active={listKind === 'bullet'}
        onClick={() => run(toggleList(false))}
      >
        • List
      </ToolButton>
      <ToolButton
        label="Numbered list (Ctrl+Shift+7)"
        active={listKind === 'ordered'}
        onClick={() => run(toggleList(true))}
      >
        1. List
      </ToolButton>
      <ToolButton
        label="Quote"
        active={isInside(state, schema.nodes.blockquote)}
        onClick={() => run(toggleBlockquote)}
      >
        ❝ Quote
      </ToolButton>
      {linkDraft === null ? (
        <ToolButton
          label="Link"
          active={isMarkActive(state, schema.marks.link)}
          disabled={!canLink}
          onClick={() => setLinkDraft('')}
        >
          Link
        </ToolButton>
      ) : (
        <form className="link-form" onSubmit={applyLink}>
          <input
            autoFocus
            aria-label="Link address"
            placeholder="https://… (empty removes the link)"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setLinkDraft(null)}
          />
          <button type="submit">Apply</button>
        </form>
      )}
    </div>
  )
}

interface ToolButtonProps {
  readonly label: string
  readonly active: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}

function ToolButton({ label, active, disabled = false, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={active ? 'tool-button active' : 'tool-button'}
      // Keep the editor selection: buttons must not take focus on mouse down.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
