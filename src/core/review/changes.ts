import { Chunk } from '@codemirror/merge'
import { Text } from '@codemirror/state'

/**
 * Number of separate changes between the reviewed version and the current content, counted as
 * the source view shows them: runs of changed lines, each accepted or rejected as a whole.
 */
export function countChanges(baseline: string, content: string): number {
  if (baseline === content) return 0
  return Chunk.build(toText(baseline), toText(content)).length
}

function toText(markdown: string): Text {
  return Text.of(markdown.split('\n'))
}
