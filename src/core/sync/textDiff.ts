/** A single replacement that turns one text into another. */
export interface TextChange {
  readonly from: number
  readonly to: number
  readonly insert: string
}

/**
 * Finds the smallest single replacement between `previous` and `next` by trimming their common
 * prefix and suffix. Applying one minimal change keeps cursors and undo history meaningful.
 * Returns null when both texts are equal.
 */
export function minimalTextChange(previous: string, next: string): TextChange | null {
  if (previous === next) return null
  const maxPrefix = Math.min(previous.length, next.length)
  let prefix = 0
  while (prefix < maxPrefix && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++

  // The suffix must not overlap the prefix in either text.
  const maxSuffix = maxPrefix - prefix
  let suffix = 0
  while (
    suffix < maxSuffix &&
    previous.charCodeAt(previous.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) {
    suffix++
  }

  return {
    from: prefix,
    to: previous.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  }
}

export function applyTextChange(text: string, change: TextChange): string {
  return text.slice(0, change.from) + change.insert + text.slice(change.to)
}
