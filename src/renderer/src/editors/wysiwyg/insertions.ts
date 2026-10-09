import type { Node as PMNode } from 'prosemirror-model'
import { NodeSelection, TextSelection, type Command, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { imageMimeType } from '../../../../core/assets/paths'
import { schema } from '../../../../core/markdown'

const { nodes } = schema

/** Inline atoms whose whole content is a text value edited from the toolbar. */
export type ValueAtom = 'math_inline' | 'citation'

/** Inserts an inline atom and selects it so its value can be edited right away. */
export function insertValueAtom(type: ValueAtom, value: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(nodes[type].create({ value }))
      const pos = tr.selection.from - 1
      dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)))
    }
    return true
  }
}

export function setValueAtom(type: ValueAtom, value: string): Command {
  return (state, dispatch) => {
    const selection = state.selection
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodes[type]) return false
    dispatch?.(state.tr.setNodeMarkup(selection.from, undefined, { value }))
    return true
  }
}

/** The selected inline atom of a value type, if the selection is one. */
export function selectedValueAtom(state: EditorState): { type: ValueAtom; value: string } | null {
  const selection = state.selection
  if (!(selection instanceof NodeSelection)) return null
  const name = selection.node.type.name
  return name === 'math_inline' || name === 'citation'
    ? { type: name, value: selection.node.attrs['value'] as string }
    : null
}

/**
 * Inserts a footnote reference with the next free number and adds its definition at the end of
 * the document, moving the cursor there so the note can be typed.
 */
export const insertFootnote: Command = (state, dispatch) => {
  if (dispatch) {
    const identifier = String(nextFootnoteNumber(state.doc))
    const tr = state.tr.replaceSelectionWith(nodes.footnote_reference.create({ identifier }))
    const definition = nodes.footnote_definition.create({ identifier }, nodes.paragraph.create())
    const end = tr.doc.content.size
    tr.insert(end, definition)
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(end + 2))).scrollIntoView())
  }
  return true
}

function nextFootnoteNumber(doc: PMNode): number {
  let highest = 0
  doc.descendants((node) => {
    if (node.type === nodes.footnote_reference || node.type === nodes.footnote_definition) {
      const number = Number(node.attrs['identifier'])
      if (Number.isInteger(number)) highest = Math.max(highest, number)
    }
  })
  return highest + 1
}

/** Image files carried by a paste or drop event. */
export function imageFiles(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((file) => imageMimeType(file.name) !== null)
}

/**
 * Copies the images into the document's assets folder (via the main process) and inserts
 * them at `pos`. Errors (e.g. unsaved document) are reported through `onError`.
 */
export async function insertImages(
  view: EditorView,
  files: readonly File[],
  pos: number,
  onError: (message: string) => void,
): Promise<void> {
  try {
    let insertAt = pos
    for (const file of files) {
      const src = await window.marcdoc.importAsset(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      )
      const alt = file.name.replace(/\.[^.]+$/, '')
      const image = nodes.image.create({ src, alt })
      const tr = view.state.tr.insert(insertAt, image)
      insertAt += image.nodeSize
      view.dispatch(tr)
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error))
  }
}
