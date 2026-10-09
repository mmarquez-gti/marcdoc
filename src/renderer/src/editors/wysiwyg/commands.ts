import { setBlockType, toggleMark, wrapIn, lift } from 'prosemirror-commands'
import type { MarkType, NodeType } from 'prosemirror-model'
import { liftListItem, wrapInList } from 'prosemirror-schema-list'
import type { Command, EditorState } from 'prosemirror-state'
import { schema } from '../../../../core/markdown'

const { nodes, marks } = schema

export const toggleStrong = toggleMark(marks.strong)
export const toggleEmphasis = toggleMark(marks.emphasis)
export const toggleCode = toggleMark(marks.code)
export const toggleDelete = toggleMark(marks.delete)

export const setParagraph = setBlockType(nodes.paragraph)

export function setHeading(level: number): Command {
  return setBlockType(nodes.heading, { level })
}

/** Wraps the selection in a blockquote, or lifts it out if it is already quoted. */
export const toggleBlockquote: Command = (state, dispatch) =>
  isInside(state, nodes.blockquote)
    ? lift(state, dispatch)
    : wrapIn(nodes.blockquote)(state, dispatch)

/**
 * Turns the selection into a list of the given kind. Inside a list of the same kind it lifts the
 * items out; inside a list of the other kind it switches the list type, as word processors do.
 */
export function toggleList(ordered: boolean): Command {
  return (state, dispatch) => {
    const list = findAncestor(state, nodes.list)
    if (!list) return wrapInList(nodes.list, { ordered })(state, dispatch)
    if (list.node.attrs['ordered'] === ordered)
      return liftListItem(nodes.list_item)(state, dispatch)
    dispatch?.(
      state.tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, ordered, start: null }),
    )
    return true
  }
}

/** Sets a link on the selection, or removes it when `href` is empty. */
export function setLink(href: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    const tr = state.tr.removeMark(from, to, marks.link)
    if (href.trim() !== '') tr.addMark(from, to, marks.link.create({ href: href.trim() }))
    dispatch?.(tr)
    return true
  }
}

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined
  return state.doc.rangeHasMark(from, to, type)
}

/** Name of the current text block style, e.g. `paragraph` or `heading2`. */
export function currentBlockStyle(state: EditorState): string {
  const parent = state.selection.$from.parent
  if (parent.type === nodes.heading) return `heading${parent.attrs['level']}`
  return parent.type.name
}

export function currentListKind(state: EditorState): 'bullet' | 'ordered' | null {
  const list = findAncestor(state, nodes.list)
  if (!list) return null
  return list.node.attrs['ordered'] ? 'ordered' : 'bullet'
}

export function isInside(state: EditorState, type: NodeType): boolean {
  return findAncestor(state, type) !== null
}

function findAncestor(state: EditorState, type: NodeType) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type === type) return { node, pos: $from.before(depth) }
  }
  return null
}
