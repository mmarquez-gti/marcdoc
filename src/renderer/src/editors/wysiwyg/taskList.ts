import { InputRule } from 'prosemirror-inputrules'
import type { Node as PMNode } from 'prosemirror-model'
import { wrapInList } from 'prosemirror-schema-list'
import type { Command, EditorState, Transaction } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { schema } from '../../../../core/markdown'

const { nodes } = schema

/** Renders task items with a real checkbox that toggles the item's `checked` attribute. */
export class ListItemView implements NodeView {
  readonly dom: HTMLLIElement
  readonly contentDOM: HTMLElement
  private readonly checkbox: HTMLInputElement

  constructor(
    private node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('li')
    this.checkbox = document.createElement('input')
    this.checkbox.type = 'checkbox'
    this.checkbox.contentEditable = 'false'
    this.checkbox.setAttribute('aria-label', 'Task done')
    this.checkbox.addEventListener('mousedown', (event) => event.preventDefault())
    this.checkbox.addEventListener('click', (event) => {
      event.preventDefault()
      const pos = getPos()
      if (pos === undefined) return
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          checked: !this.node.attrs['checked'],
        }),
      )
    })
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'list-item-content'
    this.dom.append(this.checkbox, this.contentDOM)
    this.render()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  stopEvent(event: Event): boolean {
    return event.target === this.checkbox
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection' }): boolean {
    return mutation.type !== 'selection' && mutation.target === this.checkbox
  }

  private render(): void {
    const checked = this.node.attrs['checked'] as boolean | null
    this.dom.className = checked === null ? '' : 'task-item'
    this.checkbox.hidden = checked === null
    this.checkbox.checked = checked === true
  }
}

/** Typing "[ ] " or "[x] " at the start of a list item turns it into a task. */
export const taskInputRule = new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start)
  const itemDepth = $start.depth - 1
  if (itemDepth < 1 || $start.node(itemDepth).type !== nodes.list_item) return null
  if ($start.index(itemDepth) !== 0) return null
  const itemPos = $start.before(itemDepth)
  return state.tr.delete(start, end).setNodeMarkup(itemPos, undefined, {
    ...$start.node(itemDepth).attrs,
    checked: match[1] !== ' ',
  })
})

/** Turns the items of the current list into tasks, or back into plain items. */
export const toggleTaskList: Command = (state, dispatch) => {
  const list = enclosingList(state)
  if (!list) {
    // Wrap in a bulleted list, then mark the new items as tasks in the same transaction.
    return wrapInList(nodes.list, { ordered: false })(
      state,
      dispatch &&
        ((tr) => {
          const wrapped = enclosingList(state.apply(tr))
          if (wrapped) setChecked(tr, wrapped.pos, wrapped.node, false)
          dispatch(tr)
        }),
    )
  }
  const makeTasks = itemsOf(list.node).some((item) => item.attrs['checked'] === null)
  if (dispatch) {
    const tr = state.tr
    setChecked(tr, list.pos, list.node, makeTasks ? false : null)
    dispatch(tr)
  }
  return true
}

export function isTaskList(state: EditorState): boolean {
  const list = enclosingList(state)
  return list !== null && itemsOf(list.node).every((item) => item.attrs['checked'] !== null)
}

function setChecked(tr: Transaction, listPos: number, list: PMNode, checked: boolean | null): void {
  list.forEach((item, offset) => {
    const current = item.attrs['checked'] as boolean | null
    // Keep existing done/not-done state when items are already tasks.
    const value = checked === null ? null : (current ?? checked)
    tr.setNodeMarkup(listPos + 1 + offset, undefined, { ...item.attrs, checked: value })
  })
}

function itemsOf(list: PMNode): PMNode[] {
  const items: PMNode[] = []
  list.forEach((item) => items.push(item))
  return items
}

function enclosingList(state: EditorState): { node: PMNode; pos: number } | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type === nodes.list) return { node, pos: $from.before(depth) }
  }
  return null
}
