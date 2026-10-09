import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history } from 'prosemirror-history'
import { Slice, type Node as PMNode } from 'prosemirror-model'
import { EditorState, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { BlockSources, createIncrementalSerializer, markdownToDoc } from '../../../../core/markdown'
import { diffTopLevelBlocks } from '../../../../core/sync/blockDiff'
import { createPortal } from 'react-dom'
import { FormatToolbar } from './FormatToolbar'
import { buildInputRules } from './inputRules'
import { buildKeymaps } from './keymap'
import { buildTablePlugins } from './tables'
import { imageFiles, insertImages } from './insertions'
import { ImageView, MathBlockView, MathInlineView } from './nodeViews'
import { ListItemView } from './taskList'
import type { Translate } from '../../../../shared/i18n'
import { useT } from '../../i18n'

/** Marks transactions that load content from outside the editor; they are not reported back. */
const EXTERNAL_UPDATE = 'marcdoc-external-update'

/** Source edits are applied after a short pause in typing, not on every keystroke. */
const SOURCE_SYNC_DELAY_MS = 150

/**
 * Applies new Markdown from the source view by replacing only the top-level blocks that changed,
 * so the other blocks keep their DOM, rendering and any selection inside them.
 */
function applyExternalMarkdown(view: EditorView, markdown: string, sources: BlockSources): void {
  const parsed = markdownToDoc(markdown, sources)
  const change = diffTopLevelBlocks(view.state.doc, parsed)
  if (change) {
    view.dispatch(
      view.state.tr
        .replace(change.from, change.to, new Slice(change.content, 0, 0))
        .setMeta(EXTERNAL_UPDATE, true)
        .setMeta('addToHistory', false),
    )
  }
  // Blocks the diff kept may have been reformatted in the source (e.g. `*a*` to `_a_`).
  sources.adopt(parsed, view.state.doc)
}

/** Editor props that contain interface texts. */
function localizedProps(t: Translate) {
  return {
    attributes: {
      'aria-label': t('editor.document'),
      class: 'wysiwyg-content',
      spellcheck: 'true',
    },
    nodeViews: {
      list_item: (node: PMNode, nodeView: EditorView, getPos: () => number | undefined) =>
        new ListItemView(node, nodeView, getPos, t('format.taskDone')),
      image: (node: PMNode) => new ImageView(node),
      math_inline: (node: PMNode) => new MathInlineView(node),
      math_block: (node: PMNode) => new MathBlockView(node),
    },
  }
}

/** Position at the top of the visible area: a Markdown block index plus how far into it (0..1). */
export interface BlockPosition {
  readonly index: number
  readonly fraction: number
}

export interface WysiwygViewHandle {
  readonly scroller: HTMLElement | null
  topBlock(): BlockPosition | null
  scrollToBlock(position: BlockPosition): void
}

interface WysiwygViewProps {
  readonly ref?: Ref<WysiwygViewHandle>
  /** Changes when a different document is loaded; resets undo history. */
  readonly documentKey: string
  readonly value: string
  readonly onChange: (value: string) => void
  /** Reports problems the user must see, e.g. an image pasted into an unsaved document. */
  readonly onError: (message: string) => void
  /** Where the formatting toolbar is shown: a full-width strip under the top bar. */
  readonly toolbarSlot: HTMLElement | null
}

function createState(markdown: string, sources: BlockSources): EditorState {
  return EditorState.create({
    doc: markdownToDoc(markdown, sources),
    plugins: [
      buildInputRules(),
      // Table keys (Tab, Enter) take precedence over list and base keys inside tables.
      ...buildTablePlugins(),
      ...buildKeymaps(),
      history(),
      dropCursor(),
      gapCursor(),
    ],
  })
}

export function WysiwygView({
  documentKey,
  value,
  onChange,
  onError,
  toolbarSlot,
  ref,
}: WysiwygViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onErrorRef = useRef(onError)
  // Markdown this view last produced or loaded; equal incoming values need no reload.
  const lastMarkdownRef = useRef(value)
  // Source edit waiting for the debounce; flushed before the user interacts with this view.
  const pendingRef = useRef<string | null>(null)
  const sourcesRef = useRef(new BlockSources())
  const t = useT()
  // The view is created once per document; texts in it follow the language through setProps.
  const tRef = useRef(t)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  // Kept in state as well, because the toolbar renders from it.
  const [toolbarView, setToolbarView] = useState<EditorView | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
    onErrorRef.current = onError
  }, [onChange, onError])

  function cancelPending(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = null
  }

  function flushPending(): false {
    const markdown = pendingRef.current
    const view = viewRef.current
    cancelPending()
    if (markdown !== null && view) applyExternalMarkdown(view, markdown, sourcesRef.current)
    // Never consume the event: ProseMirror must still handle it.
    return false
  }

  useEffect(() => {
    // Original text of each block, so unedited blocks keep their formatting (PLAN.md H4.1).
    const sources = new BlockSources()
    sourcesRef.current = sources
    // Re-serializes only the blocks that changed since the previous keystroke.
    const serialize = createIncrementalSerializer(sources)
    const view = new EditorView(hostRef.current!, {
      state: createState(value, sources),
      ...localizedProps(tRef.current),
      handleDOMEvents: {
        // A pending source edit must land before any edit here is built on the old document.
        focus: () => flushPending(),
        mousedown: () => flushPending(),
        keydown: () => flushPending(),
      },
      handlePaste(pasteView, event) {
        const files = imageFiles(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        void insertImages(pasteView, files, pasteView.state.selection.from, (message) =>
          onErrorRef.current(message),
        )
        return true
      },
      handleDrop(dropView, event) {
        const files = imageFiles(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        const target = dropView.posAtCoords({ left: event.clientX, top: event.clientY })
        void insertImages(
          dropView,
          files,
          target?.pos ?? dropView.state.selection.from,
          (message) => onErrorRef.current(message),
        )
        return true
      },
      dispatchTransaction(transaction: Transaction) {
        const next = view.state.apply(transaction)
        view.updateState(next)
        setEditorState(next)
        if (transaction.docChanged && !transaction.getMeta(EXTERNAL_UPDATE)) {
          const markdown = serialize(next.doc)
          lastMarkdownRef.current = markdown
          onChangeRef.current(markdown)
        }
      },
    })
    viewRef.current = view
    lastMarkdownRef.current = value
    setEditorState(view.state)
    setToolbarView(view)
    return () => {
      cancelPending()
      view.destroy()
      viewRef.current = null
      setToolbarView(null)
    }
    // `value` is read only at creation; later updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey])

  useEffect(() => {
    if (value === lastMarkdownRef.current) {
      cancelPending()
      return
    }
    lastMarkdownRef.current = value
    pendingRef.current = value
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flushPending, SOURCE_SYNC_DELAY_MS)
    // flushPending and cancelPending only touch refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    tRef.current = t
    viewRef.current?.setProps(localizedProps(t))
  }, [t])

  useImperativeHandle(
    ref,
    (): WysiwygViewHandle => ({
      get scroller() {
        return hostRef.current
      },
      topBlock() {
        const view = viewRef.current
        const scroller = hostRef.current
        if (!view || !scroller) return null
        const blocks = markdownBlockElements(view)
        const top = scroller.getBoundingClientRect().top
        let index = blocks.findIndex((element) => element.getBoundingClientRect().bottom > top)
        if (index === -1) index = blocks.length - 1
        const element = blocks[index]
        if (!element) return null
        const rect = element.getBoundingClientRect()
        const fraction = rect.height > 0 ? (top - rect.top) / rect.height : 0
        return { index, fraction: Math.min(1, Math.max(0, fraction)) }
      },
      scrollToBlock({ index, fraction }) {
        const view = viewRef.current
        const scroller = hostRef.current
        if (!view || !scroller) return
        const blocks = markdownBlockElements(view)
        const element = blocks[Math.min(index, blocks.length - 1)]
        if (!element) return
        const offset =
          element.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        scroller.scrollTop = offset + fraction * element.getBoundingClientRect().height
      },
    }),
    [],
  )

  return (
    <div className="wysiwyg-view">
      {editorState &&
        toolbarView &&
        toolbarSlot &&
        createPortal(<FormatToolbar view={toolbarView} state={editorState} />, toolbarSlot)}
      <div className="wysiwyg-page" ref={hostRef} />
    </div>
  )
}

/**
 * DOM elements of the top-level blocks that exist in the Markdown, in order. Empty paragraphs
 * are skipped because they are not written to Markdown (see blockLineRanges).
 */
function markdownBlockElements(view: EditorView): HTMLElement[] {
  const elements: HTMLElement[] = []
  view.state.doc.forEach((block, offset) => {
    if (block.type.name === 'paragraph' && block.childCount === 0) return
    const dom = view.nodeDOM(offset)
    if (dom instanceof HTMLElement) elements.push(dom)
  })
  return elements
}
