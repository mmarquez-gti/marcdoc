import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history } from 'prosemirror-history'
import { EditorState, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { useEffect, useRef, useState } from 'react'
import { docToMarkdown, markdownToDoc } from '../../../../core/markdown'
import { FormatToolbar } from './FormatToolbar'
import { buildInputRules } from './inputRules'
import { buildKeymaps } from './keymap'
import { buildTablePlugins } from './tables'
import { imageFiles, insertImages } from './insertions'
import { ImageView, MathBlockView, MathInlineView } from './nodeViews'
import { ListItemView } from './taskList'

/** Marks transactions that load content from outside the editor; they are not reported back. */
const EXTERNAL_UPDATE = 'marcdoc-external-update'

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
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  // Kept in state as well, because the toolbar renders from it.
  const [toolbarView, setToolbarView] = useState<EditorView | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
    onErrorRef.current = onError
  }, [onChange, onError])

  useEffect(() => {
    const view = new EditorView(hostRef.current!, {
      state: createState(value),
      attributes: { 'aria-label': 'Document', class: 'wysiwyg-content', spellcheck: 'true' },
      nodeViews: {
        list_item: (node, nodeView, getPos) => new ListItemView(node, nodeView, getPos),
        image: (node) => new ImageView(node),
        math_inline: (node) => new MathInlineView(node),
        math_block: (node) => new MathBlockView(node),
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
          const markdown = docToMarkdown(next.doc)
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
      view.destroy()
      viewRef.current = null
      setToolbarView(null)
    }
    // `value` is read only at creation; later updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey])

  useEffect(() => {
    const view = viewRef.current
    if (!view || value === lastMarkdownRef.current) return
    lastMarkdownRef.current = value
    const doc = markdownToDoc(value)
    const transaction = view.state.tr
      .replaceWith(0, view.state.doc.content.size, doc.content)
      .setMeta(EXTERNAL_UPDATE, true)
      .setMeta('addToHistory', false)
    view.dispatch(transaction)
  }, [value])

  return (
    <div className="wysiwyg-view">
      {editorState && toolbarView && <FormatToolbar view={toolbarView} state={editorState} />}
      <div className="wysiwyg-page" ref={hostRef} />
    </div>
  )
}
