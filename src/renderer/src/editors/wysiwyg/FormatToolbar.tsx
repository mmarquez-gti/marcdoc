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
import type { MessageKey } from '../../../../shared/i18n'
import { useT } from '../../i18n'
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
import { isCitation } from '../../../../core/markdown/citations'
import {
  insertFootnote,
  insertValueAtom,
  selectedValueAtom,
  setValueAtom,
  type ValueAtom,
} from './insertions'
import { isTaskList, toggleTaskList } from './taskList'

const BLOCK_STYLES = [
  {
    value: 'paragraph',
    labelKey: 'format.normalText' as MessageKey,
    level: 0,
    command: setParagraph,
  },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    value: `heading${level}`,
    labelKey: 'format.heading' as MessageKey,
    level,
    command: setHeading(level),
  })),
]

interface FormatToolbarProps {
  readonly view: EditorView
  /** Passed separately so the toolbar re-renders on every editor change. */
  readonly state: EditorState
}

export function FormatToolbar({ view, state }: FormatToolbarProps) {
  const t = useT()
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const selectedAtom = selectedValueAtom(state)

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
    <div className="format-toolbar" role="toolbar" aria-label={t('format.toolbar')}>
      <select
        aria-label={t('format.blockStyle')}
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
            {t(style.labelKey, { level: style.level })}
          </option>
        ))}
      </select>
      <ToolButton
        label={t('format.bold')}
        active={isMarkActive(state, schema.marks.strong)}
        onClick={() => run(toggleStrong)}
      >
        <strong>B</strong>
      </ToolButton>
      <ToolButton
        label={t('format.italic')}
        active={isMarkActive(state, schema.marks.emphasis)}
        onClick={() => run(toggleEmphasis)}
      >
        <em>I</em>
      </ToolButton>
      <ToolButton
        label={t('format.code')}
        active={isMarkActive(state, schema.marks.code)}
        onClick={() => run(toggleCode)}
      >
        {'</>'}
      </ToolButton>
      <ToolButton
        label={t('format.strikethrough')}
        active={isMarkActive(state, schema.marks.delete)}
        onClick={() => run(toggleDelete)}
      >
        <s>S</s>
      </ToolButton>
      <ToolButton
        label={t('format.bulletList')}
        active={listKind === 'bullet'}
        onClick={() => run(toggleList(false))}
      >
        {t('format.bulletListButton')}
      </ToolButton>
      <ToolButton
        label={t('format.orderedList')}
        active={listKind === 'ordered'}
        onClick={() => run(toggleList(true))}
      >
        {t('format.orderedListButton')}
      </ToolButton>
      <ToolButton
        label={t('format.taskList')}
        active={isTaskList(state)}
        onClick={() => run(toggleTaskList)}
      >
        {t('format.taskListButton')}
      </ToolButton>
      <ToolButton
        label={t('format.quote')}
        active={isInside(state, schema.nodes.blockquote)}
        onClick={() => run(toggleBlockquote)}
      >
        {t('format.quoteButton')}
      </ToolButton>
      {linkDraft === null ? (
        <ToolButton
          label={t('format.link')}
          active={isMarkActive(state, schema.marks.link)}
          disabled={!canLink}
          onClick={() => setLinkDraft('')}
        >
          {t('format.link')}
        </ToolButton>
      ) : (
        <form className="link-form" onSubmit={applyLink}>
          <input
            autoFocus
            aria-label={t('format.linkAddress')}
            placeholder={t('format.linkPlaceholder')}
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setLinkDraft(null)}
          />
          <button type="submit">{t('common.apply')}</button>
        </form>
      )}
      {selectedAtom === null ? (
        <>
          <ToolButton
            label={t('format.insertMath')}
            active={false}
            onClick={() => run(insertValueAtom('math_inline', 'x^2'))}
          >
            {t('format.mathButton')}
          </ToolButton>
          <ToolButton
            label={t('format.insertCitation')}
            active={false}
            onClick={() => run(insertValueAtom('citation', '[@key]'))}
          >
            {t('format.citationButton')}
          </ToolButton>
        </>
      ) : (
        <ValueForm
          key={`${selectedAtom.type}:${selectedAtom.value}`}
          {...VALUE_FORMS[selectedAtom.type]}
          value={selectedAtom.value}
          onApply={(value) => run(setValueAtom(selectedAtom.type, value))}
        />
      )}
      <ToolButton
        label={t('format.insertFootnote')}
        active={false}
        onClick={() => run(insertFootnote)}
      >
        {t('format.footnoteButton')}
      </ToolButton>
      {isInTable(state) ? (
        <TableControls state={state} run={run} />
      ) : (
        <ToolButton label={t('format.insertTable')} active={false} onClick={() => run(insertTable)}>
          {t('format.tableButton')}
        </ToolButton>
      )}
    </div>
  )
}

const VALUE_FORMS: Readonly<
  Record<ValueAtom, { label: MessageKey; validate: (value: string) => MessageKey | null }>
> = {
  math_inline: {
    label: 'format.texFormula',
    validate: (value) => (value.trim() ? null : 'format.enterFormula'),
  },
  citation: {
    label: 'format.citation',
    validate: (value) => (isCitation(value) ? null : 'format.citationHelp'),
  },
}

/**
 * Edits the value of the selected math or citation; remounted (via `key`) when the selection
 * changes so the draft starts from the node's value.
 */
function ValueForm({
  label,
  value,
  validate,
  onApply,
}: {
  label: MessageKey
  value: string
  validate: (value: string) => MessageKey | null
  onApply: (value: string) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(value)
  const problem = validate(draft)
  return (
    <form
      className="link-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!problem) onApply(draft)
      }}
    >
      <input
        aria-label={t(label)}
        aria-invalid={problem !== null}
        title={problem ? t(problem) : ''}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" disabled={problem !== null}>
        {t('common.apply')}
      </button>
    </form>
  )
}

const COLUMN_ALIGNMENTS: readonly { align: ColumnAlign; label: MessageKey; icon: string }[] = [
  { align: 'left', label: 'table.alignLeft', icon: '⇤' },
  { align: 'center', label: 'table.alignCenter', icon: '↔' },
  { align: 'right', label: 'table.alignRight', icon: '⇥' },
]

function TableControls({ state, run }: { state: EditorState; run: (command: Command) => void }) {
  const t = useT()
  const align = currentColumnAlign(state)
  return (
    <span className="table-controls" role="group" aria-label={t('table.group')}>
      <ToolButton label={t('table.addRow')} active={false} onClick={() => run(addRowAfter)}>
        {t('table.addRowButton')}
      </ToolButton>
      <ToolButton label={t('table.addColumn')} active={false} onClick={() => run(addColumnAfter)}>
        {t('table.addColumnButton')}
      </ToolButton>
      <ToolButton label={t('table.deleteRow')} active={false} onClick={() => run(deleteRow)}>
        {t('table.deleteRowButton')}
      </ToolButton>
      <ToolButton label={t('table.deleteColumn')} active={false} onClick={() => run(deleteColumn)}>
        {t('table.deleteColumnButton')}
      </ToolButton>
      {COLUMN_ALIGNMENTS.map((option) => (
        <ToolButton
          key={option.align}
          label={t(option.label)}
          active={align === option.align}
          onClick={() => run(alignColumn(align === option.align ? null : option.align))}
        >
          {option.icon}
        </ToolButton>
      ))}
      <ToolButton label={t('table.delete')} active={false} onClick={() => run(deleteTable)}>
        {t('table.deleteButton')}
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
