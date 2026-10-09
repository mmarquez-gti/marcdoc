import type { Node as PMNode } from 'prosemirror-model'
import { Plugin, PluginKey, TextSelection, type Command, type EditorState } from 'prosemirror-state'
import { goToNextCell, isInTable, selectedRect, tableEditing } from 'prosemirror-tables'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { schema } from '../../../../core/markdown'

export type ColumnAlign = 'left' | 'center' | 'right' | null

const NEW_TABLE_COLUMNS = 3
const NEW_TABLE_BODY_ROWS = 2

/** Inserts an empty table (header row plus body rows) after the current block. */
export const insertTable: Command = (state, dispatch) => {
  if (isInTable(state)) return false
  const { nodes } = schema
  const row = () =>
    nodes.table_row.create(
      null,
      Array.from({ length: NEW_TABLE_COLUMNS }, () => nodes.table_cell.create()),
    )
  const table = nodes.table.create(null, Array.from({ length: NEW_TABLE_BODY_ROWS + 1 }, row))
  if (dispatch) {
    const tr = state.tr.replaceSelectionWith(table)
    // Place the cursor in the first cell: table start + row start + cell start.
    const tablePos = tr.mapping.map(state.selection.from) - table.nodeSize
    tr.setSelection(TextSelection.near(tr.doc.resolve(tablePos + 3)))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/** Sets the alignment of the column that contains the selection. */
export function alignColumn(align: ColumnAlign): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const tablePos = rect.tableStart - 1
    const current = rect.table.attrs['align'] as readonly ColumnAlign[]
    const next = Array.from({ length: rect.map.width }, (_, index) =>
      index >= rect.left && index < rect.right ? align : (current[index] ?? null),
    )
    dispatch?.(state.tr.setNodeMarkup(tablePos, undefined, { ...rect.table.attrs, align: next }))
    return true
  }
}

export function currentColumnAlign(state: EditorState): ColumnAlign | undefined {
  if (!isInTable(state)) return undefined
  const rect = selectedRect(state)
  return (rect.table.attrs['align'] as readonly ColumnAlign[])[rect.left] ?? null
}

// GFM cells hold a single line: Enter and Shift-Enter would break the table structure.
const blockLineBreaksInTable: Command = (state) => isInTable(state)

export function buildTablePlugins(): Plugin[] {
  return [
    tableEditing(),
    keymap({
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
      Enter: blockLineBreaksInTable,
      'Shift-Enter': blockLineBreaksInTable,
    }),
    tableDecorations,
  ]
}

const tableDecorationsKey = new PluginKey<DecorationSet>('table-decorations')

/** Shows column alignment and styles the first row as the header, as GFM defines it. */
const tableDecorations = new Plugin<DecorationSet>({
  key: tableDecorationsKey,
  state: {
    init: (_config, state) => decorateTables(state.doc),
    apply: (transaction, previous) =>
      transaction.docChanged ? decorateTables(transaction.doc) : previous,
  },
  props: {
    decorations: (state) => tableDecorationsKey.getState(state),
  },
})

function decorateTables(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.table) return true
    const align = node.attrs['align'] as readonly ColumnAlign[]
    let rowPos = pos + 1
    node.forEach((row, _offset, rowIndex) => {
      let cellPos = rowPos + 1
      let column = 0
      row.forEach((cell) => {
        const columnAlign = align[column] ?? null
        const attrs: Record<string, string> = {}
        if (columnAlign) attrs['style'] = `text-align: ${columnAlign}`
        if (rowIndex === 0) attrs['class'] = 'table-header-cell'
        if (Object.keys(attrs).length > 0) {
          decorations.push(Decoration.node(cellPos, cellPos + cell.nodeSize, attrs))
        }
        column += Number(cell.attrs['colspan'] ?? 1)
        cellPos += cell.nodeSize
      })
      rowPos += row.nodeSize
    })
    return false
  })
  return DecorationSet.create(doc, decorations)
}
