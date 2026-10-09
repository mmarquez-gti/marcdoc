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
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BookMarked,
  Check,
  Code,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  Sigma,
  Strikethrough,
  Superscript,
  Table2,
  Quote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
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
        className="block-style"
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

      <Separator />
      <ToolButton
        icon={Bold}
        label={t('format.bold')}
        active={isMarkActive(state, schema.marks.strong)}
        onClick={() => run(toggleStrong)}
      />
      <ToolButton
        icon={Italic}
        label={t('format.italic')}
        active={isMarkActive(state, schema.marks.emphasis)}
        onClick={() => run(toggleEmphasis)}
      />
      <ToolButton
        icon={Strikethrough}
        label={t('format.strikethrough')}
        active={isMarkActive(state, schema.marks.delete)}
        onClick={() => run(toggleDelete)}
      />
      <ToolButton
        icon={Code}
        label={t('format.code')}
        active={isMarkActive(state, schema.marks.code)}
        onClick={() => run(toggleCode)}
      />

      <Separator />
      <ToolButton
        icon={List}
        label={t('format.bulletList')}
        active={listKind === 'bullet' && !isTaskList(state)}
        onClick={() => run(toggleList(false))}
      />
      <ToolButton
        icon={ListOrdered}
        label={t('format.orderedList')}
        active={listKind === 'ordered'}
        onClick={() => run(toggleList(true))}
      />
      <ToolButton
        icon={ListChecks}
        label={t('format.taskList')}
        active={isTaskList(state)}
        onClick={() => run(toggleTaskList)}
      />

      <Separator />
      <ToolButton
        icon={Quote}
        label={t('format.quote')}
        active={isInside(state, schema.nodes.blockquote)}
        onClick={() => run(toggleBlockquote)}
      />
      {linkDraft === null ? (
        <ToolButton
          icon={Link}
          label={t('format.link')}
          active={isMarkActive(state, schema.marks.link)}
          disabled={!canLink}
          onClick={() => setLinkDraft('')}
        />
      ) : (
        <form className="inline-form" onSubmit={applyLink}>
          <input
            autoFocus
            aria-label={t('format.linkAddress')}
            placeholder={t('format.linkPlaceholder')}
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setLinkDraft(null)}
          />
          <button type="submit" className="btn">
            <Check size={14} aria-hidden />
            {t('common.apply')}
          </button>
        </form>
      )}

      <Separator />
      {isInTable(state) ? (
        <TableControls state={state} run={run} />
      ) : (
        <ToolButton
          icon={Table2}
          label={t('format.insertTable')}
          text={t('format.tableButton')}
          active={false}
          onClick={() => run(insertTable)}
        />
      )}
      {selectedAtom === null ? (
        <>
          <ToolButton
            icon={Sigma}
            label={t('format.insertMath')}
            text={t('format.mathButton')}
            active={false}
            onClick={() => run(insertValueAtom('math_inline', 'x^2'))}
          />
          <ToolButton
            icon={BookMarked}
            label={t('format.insertCitation')}
            text={t('format.citationButton')}
            active={false}
            onClick={() => run(insertValueAtom('citation', '[@key]'))}
          />
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
        icon={Superscript}
        label={t('format.insertFootnote')}
        text={t('format.footnoteButton')}
        active={false}
        onClick={() => run(insertFootnote)}
      />
    </div>
  )
}

function Separator() {
  return <span className="toolbar-separator" role="separator" aria-orientation="vertical" />
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
      className="inline-form"
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
      <button type="submit" className="btn" disabled={problem !== null}>
        <Check size={14} aria-hidden />
        {t('common.apply')}
      </button>
    </form>
  )
}

const COLUMN_ALIGNMENTS: readonly { align: ColumnAlign; label: MessageKey; icon: LucideIcon }[] = [
  { align: 'left', label: 'table.alignLeft', icon: AlignLeft },
  { align: 'center', label: 'table.alignCenter', icon: AlignCenter },
  { align: 'right', label: 'table.alignRight', icon: AlignRight },
]

function TableControls({ state, run }: { state: EditorState; run: (command: Command) => void }) {
  const t = useT()
  const align = currentColumnAlign(state)
  return (
    <span className="table-controls" role="group" aria-label={t('table.group')}>
      <ToolButton
        icon={Plus}
        label={t('table.addRow')}
        text={t('table.addRowButton')}
        active={false}
        onClick={() => run(addRowAfter)}
      />
      <ToolButton
        icon={Plus}
        label={t('table.addColumn')}
        text={t('table.addColumnButton')}
        active={false}
        onClick={() => run(addColumnAfter)}
      />
      <ToolButton
        icon={Minus}
        label={t('table.deleteRow')}
        text={t('table.deleteRowButton')}
        active={false}
        onClick={() => run(deleteRow)}
      />
      <ToolButton
        icon={Minus}
        label={t('table.deleteColumn')}
        text={t('table.deleteColumnButton')}
        active={false}
        onClick={() => run(deleteColumn)}
      />
      <Separator />
      {COLUMN_ALIGNMENTS.map((option) => (
        <ToolButton
          key={option.align}
          icon={option.icon}
          label={t(option.label)}
          active={align === option.align}
          onClick={() => run(alignColumn(align === option.align ? null : option.align))}
        />
      ))}
      <Separator />
      <ToolButton
        icon={Trash2}
        label={t('table.delete')}
        active={false}
        onClick={() => run(deleteTable)}
      />
    </span>
  )
}

interface ToolButtonProps {
  readonly icon: LucideIcon
  /** Accessible name and tooltip, including the keyboard shortcut. */
  readonly label: string
  /** Short visible text next to the icon, for actions an icon alone does not make obvious. */
  readonly text?: string
  readonly active: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
}

function ToolButton({
  icon: Icon,
  label,
  text,
  active,
  disabled = false,
  onClick,
}: ToolButtonProps) {
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
      <Icon size={16} strokeWidth={active ? 2.25 : 2} aria-hidden />
      {text && <span className="tool-label">{text}</span>}
    </button>
  )
}
