import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { blockIndexAtLine, blockLineRanges, type LineRange } from '../../../core/sync/blockLines'
import type { CodeViewHandle } from '../editors/code/CodeView'
import type { WysiwygViewHandle } from '../editors/wysiwyg/WysiwygView'

type Pane = 'source' | 'wysiwyg'

/**
 * Keeps both views showing the same part of the document. Only the pane the user is interacting
 * with (the leader) drives the other one, so programmatic scrolls never echo back.
 */
export function useScrollSync(
  markdown: string,
  /** Changes when the views are recreated (a new document), so listeners are re-attached. */
  viewsKey: string,
  enabled: boolean,
  source: RefObject<CodeViewHandle | null>,
  wysiwyg: RefObject<WysiwygViewHandle | null>,
): void {
  // Parsing is the expensive part; do it once per text version, and only when needed.
  const ranges = useMemo(() => lazy(() => blockLineRanges(markdown)), [markdown])
  const leaderRef = useRef<Pane>('wysiwyg')
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const sourceScroller = source.current?.scroller
    const wysiwygScroller = wysiwyg.current?.scroller
    if (!enabled || !sourceScroller || !wysiwygScroller) return

    const follow = (leader: Pane) => {
      if (leaderRef.current !== leader || frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        if (leader === 'source') syncFromSource(ranges(), source.current, wysiwyg.current)
        else syncFromWysiwyg(ranges(), wysiwyg.current, source.current)
      })
    }

    const listeners: [HTMLElement, string, EventListener][] = []
    const listen = (element: HTMLElement, type: string, listener: EventListener) => {
      element.addEventListener(type, listener, { passive: true })
      listeners.push([element, type, listener])
    }
    for (const [pane, element] of [
      ['source', sourceScroller],
      ['wysiwyg', wysiwygScroller],
    ] as const) {
      const lead = () => {
        leaderRef.current = pane
      }
      listen(element, 'pointerenter', lead)
      listen(element, 'wheel', lead)
      listen(element, 'focusin', lead)
      listen(element, 'keydown', lead)
      listen(element, 'scroll', () => follow(pane))
    }
    return () => {
      for (const [element, type, listener] of listeners) element.removeEventListener(type, listener)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [enabled, viewsKey, ranges, source, wysiwyg])
}

function syncFromSource(
  ranges: readonly LineRange[],
  source: CodeViewHandle | null,
  wysiwyg: WysiwygViewHandle | null,
): void {
  const top = source?.topLine()
  if (!top || !wysiwyg || ranges.length === 0) return
  const index = blockIndexAtLine(ranges, top.line)
  const range = ranges[index]!
  const lineCount = range.end - range.start + 1
  const offsetInBlock = Math.min(lineCount, Math.max(0, top.line - range.start + top.fraction))
  wysiwyg.scrollToBlock({ index, fraction: offsetInBlock / lineCount })
}

function syncFromWysiwyg(
  ranges: readonly LineRange[],
  wysiwyg: WysiwygViewHandle | null,
  source: CodeViewHandle | null,
): void {
  const top = wysiwyg?.topBlock()
  const range = top ? ranges[top.index] : undefined
  if (!top || !range || !source) return
  const position = (range.end - range.start + 1) * top.fraction
  const line = range.start + Math.floor(position)
  source.scrollToLine({ line, fraction: position - Math.floor(position) })
}

function lazy<T>(compute: () => T): () => T {
  let value: { readonly result: T } | null = null
  return () => {
    value ??= { result: compute() }
    return value.result
  }
}
