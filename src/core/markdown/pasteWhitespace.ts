// Cleans the space runs that word processors such as LibreOffice put in clipboard HTML,
// where a no-break space next to another space only pads the text and shows up as a gap.
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model'

/** Two or more spaces, normal or no-break. A lone no-break space is intentional ("10 %"). */
const SPACE_RUN = /[ \u00a0]{2,}/g

/** Replaces every run of two or more spaces, normal or no-break, with one normal space. */
export function collapsePastedSpaces(text: string): string {
  return text.replace(SPACE_RUN, ' ')
}

/** Applies `collapsePastedSpaces` to the text of a pasted slice, leaving code and math as is. */
export function normalizePastedSlice(slice: Slice): Slice {
  return new Slice(normalizeFragment(slice.content), slice.openStart, slice.openEnd)
}

function normalizeFragment(fragment: Fragment): Fragment {
  const children: PMNode[] = []
  fragment.forEach((child) => children.push(normalizeNode(child)))
  return Fragment.fromArray(children)
}

function normalizeNode(node: PMNode): PMNode {
  if (node.isText) return normalizeText(node)
  // Code, math and frontmatter blocks keep their spacing: it is part of their content.
  if (node.type.spec.code) return node
  return node.copy(normalizeFragment(node.content))
}

function normalizeText(node: PMNode): PMNode {
  const text = node.text ?? ''
  if (node.marks.some((mark) => mark.type.name === 'code')) return node
  const collapsed = collapsePastedSpaces(text)
  return collapsed === text ? node : node.type.schema.text(collapsed, node.marks)
}
