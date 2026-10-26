import type { Node as PMNode } from 'prosemirror-model'
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { BlockChangeKind, ReviewMarks } from '../../../../core/review/changes'

/** Texts the review decorations show as tooltips and accessible labels. */
export interface ReviewTexts {
  readonly inserted: string
  readonly modified: string
  readonly deleted: string
}

const reviewKey = new PluginKey<DecorationSet>('marcdoc-review')

/**
 * Highlights the blocks changed since the reviewed version and shows deleted text where it was.
 * The marks are set from outside (see `setReviewMarks`) and follow edits until they are reset.
 */
export function reviewPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: reviewKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, decorations) {
        const next = transaction.getMeta(reviewKey) as DecorationSet | undefined
        return next ?? decorations.map(transaction.mapping, transaction.doc)
      },
    },
    props: {
      decorations: (state) => reviewKey.getState(state),
    },
  })
}

/** Whether the editor shows any review marks. */
export function hasReviewMarks(state: EditorState): boolean {
  return reviewKey.getState(state) !== DecorationSet.empty
}

/**
 * Transaction that shows `marks`, located on the Markdown of the current document; null hides
 * them. Marks that do not fit the document (a different number of blocks) are not shown.
 */
export function setReviewMarks(
  state: EditorState,
  marks: ReviewMarks | null,
  texts: ReviewTexts,
): Transaction {
  const blocks = markdownBlocks(state.doc)
  const decorations =
    marks && marks.blockCount === blocks.length
      ? DecorationSet.create(state.doc, buildDecorations(state.doc, blocks, marks, texts))
      : DecorationSet.empty
  return state.tr.setMeta(reviewKey, decorations).setMeta('addToHistory', false)
}

interface BlockSpan {
  readonly from: number
  readonly to: number
}

/**
 * Spans of the top-level blocks that exist in the Markdown, in order. Empty paragraphs are
 * skipped because they are not written to Markdown (see blockLineRanges).
 */
function markdownBlocks(doc: PMNode): BlockSpan[] {
  const spans: BlockSpan[] = []
  doc.forEach((block, offset) => {
    if (block.type.name === 'paragraph' && block.childCount === 0) return
    spans.push({ from: offset, to: offset + block.nodeSize })
  })
  return spans
}

function buildDecorations(
  doc: PMNode,
  blocks: readonly BlockSpan[],
  marks: ReviewMarks,
  texts: ReviewTexts,
): Decoration[] {
  const decorations: Decoration[] = []
  marks.blocks.forEach((kind: BlockChangeKind, index) => {
    const block = blocks[index]
    if (!block) return
    decorations.push(
      Decoration.node(block.from, block.to, { class: `review-${kind}`, title: texts[kind] }),
    )
  })
  marks.deletions.forEach(({ beforeBlock, text }, index) => {
    const pos = blocks[beforeBlock]?.from ?? doc.content.size
    decorations.push(
      Decoration.widget(pos, () => deletedText(text, texts.deleted), {
        side: -1,
        key: `review-deleted-${index}-${text}`,
        ignoreSelection: true,
      }),
    )
  })
  return decorations
}

function deletedText(text: string, label: string): HTMLElement {
  const element = document.createElement('div')
  element.className = 'review-deleted'
  element.contentEditable = 'false'
  element.title = label
  element.setAttribute('aria-label', `${label}: ${text}`)
  element.textContent = text
  return element
}
