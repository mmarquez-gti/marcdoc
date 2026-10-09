import type { Command, EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
} from 'prosemirror-tables'
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
  toggleDelete,
  toggleEmphasis,
  toggleList,
  toggleStrong,
} from './commands'
import { alignColumn, currentColumnAlign, insertTable, type ColumnAlign } from './tables'
import { isTaskList, toggleTaskList } from './taskList'

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
        label="Strikethrough (Ctrl+Shift+X)"
        active={isMarkActive(state, schema.marks.delete)}
        onClick={() => run(toggleDelete)}
      >
        <s>S</s>
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
      <ToolButton label="Task list" active={isTaskList(state)} onClick={() => run(toggleTaskList)}>
        ☑ Tasks
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
      {isInTable(state) ? (
        <TableControls state={state} run={run} />
      ) : (
        <ToolButton label="Insert table" active={false} onClick={() => run(insertTable)}>
          ▦ Table
        </ToolButton>
      )}
    </div>
  )
}

const COLUMN_ALIGNMENTS: readonly { align: ColumnAlign; label: string; icon: string }[] = [
  { align: 'left', label: 'Align column left', icon: '⇤' },
  { align: 'center', label: 'Center column', icon: '↔' },
  { align: 'right', label: 'Align column right', icon: '⇥' },
]

function TableControls({ state, run }: { state: EditorState; run: (command: Command) => void }) {
  const align = currentColumnAlign(state)
  return (
    <span className="table-controls" role="group" aria-label="Table">
      <ToolButton label="Add row below" active={false} onClick={() => run(addRowAfter)}>
        +Row
      </ToolButton>
      <ToolButton label="Add column right" active={false} onClick={() => run(addColumnAfter)}>
        +Col
      </ToolButton>
      <ToolButton label="Delete row" active={false} onClick={() => run(deleteRow)}>
        −Row
      </ToolButton>
      <ToolButton label="Delete column" active={false} onClick={() => run(deleteColumn)}>
        −Col
      </ToolButton>
      {COLUMN_ALIGNMENTS.map((option) => (
        <ToolButton
          key={option.align}
          label={option.label}
          active={align === option.align}
          onClick={() => run(alignColumn(align === option.align ? null : option.align))}
        >
          {option.icon}
        </ToolButton>
      ))}
      <ToolButton label="Delete table" active={false} onClick={() => run(deleteTable)}>
        ✕ Table
      </ToolButton>
    </span>
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
