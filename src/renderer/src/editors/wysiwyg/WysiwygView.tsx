import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history } from 'prosemirror-history'
import { Slice } from 'prosemirror-model'
import { EditorState, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { useEffect, useRef, useState } from 'react'
import { createIncrementalSerializer, markdownToDoc } from '../../../../core/markdown'
import { diffTopLevelBlocks } from '../../../../core/sync/blockDiff'
import { FormatToolbar } from './FormatToolbar'
import { buildInputRules } from './inputRules'
import { buildKeymaps } from './keymap'
import { buildTablePlugins } from './tables'
import { imageFiles, insertImages } from './insertions'
import { ImageView, MathBlockView, MathInlineView } from './nodeViews'
import { ListItemView } from './taskList'

/** Marks transactions that load content from outside the editor; they are not reported back. */
const EXTERNAL_UPDATE = 'marcdoc-external-update'

/** Source edits are applied after a short pause in typing, not on every keystroke. */
const SOURCE_SYNC_DELAY_MS = 150

/**
 * Applies new Markdown from the source view by replacing only the top-level blocks that changed,
 * so the other blocks keep their DOM, rendering and any selection inside them.
 */
function applyExternalMarkdown(view: EditorView, markdown: string): void {
  const change = diffTopLevelBlocks(view.state.doc, markdownToDoc(markdown))
  if (!change) return
  view.dispatch(
    view.state.tr
      .replace(change.from, change.to, new Slice(change.content, 0, 0))
      .setMeta(EXTERNAL_UPDATE, true)
      .setMeta('addToHistory', false),
  )
}

interface WysiwygViewProps {
  /** Changes when a different document is loaded; resets undo history. */
  readonly documentKey: string
  readonly value: string
  readonly onChange: (value: string) => void
  /** Reports problems the user must see, e.g. an image pasted into an unsaved document. */
  readonly onError: (message: string) => void
}

function createState(markdown: string): EditorState {
  return EditorState.create({
    doc: markdownToDoc(markdown),
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

export function WysiwygView({ documentKey, value, onChange, onError }: WysiwygViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onErrorRef = useRef(onError)
  // Markdown this view last produced or loaded; equal incoming values need no reload.
  const lastMarkdownRef = useRef(value)
  // Source edit waiting for the debounce; flushed before the user interacts with this view.
  const pendingRef = useRef<string | null>(null)
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
    if (markdown !== null && view) applyExternalMarkdown(view, markdown)
    // Never consume the event: ProseMirror must still handle it.
    return false
  }

  useEffect(() => {
    // Re-serializes only the blocks that changed since the previous keystroke.
    const serialize = createIncrementalSerializer()
    const view = new EditorView(hostRef.current!, {
      state: createState(value),
      attributes: { 'aria-label': 'Document', class: 'wysiwyg-content', spellcheck: 'true' },
      nodeViews: {
        list_item: (node, nodeView, getPos) => new ListItemView(node, nodeView, getPos),
        image: (node) => new ImageView(node),
        math_inline: (node) => new MathInlineView(node),
        math_block: (node) => new MathBlockView(node),
      },
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

  return (
    <div className="wysiwyg-view">
      {editorState && toolbarView && <FormatToolbar view={toolbarView} state={editorState} />}
      <div className="wysiwyg-page" ref={hostRef} />
    </div>
  )
}
