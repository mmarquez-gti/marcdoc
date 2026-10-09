// Line endings: documents are edited with \n; files written with CRLF (common on Windows) are
// saved back with CRLF so editing does not change every line.

export type LineEnding = '\n' | '\r\n'

/** CRLF if most line breaks in `text` are CRLF; LF otherwise (including no line breaks). */
export function detectLineEnding(text: string): LineEnding {
  const crlf = text.match(/\r\n/g)?.length ?? 0
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf
  return crlf > lf ? '\r\n' : '\n'
}

export function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export function withLineEnding(text: string, ending: LineEnding): string {
  const lf = toLf(text)
  return ending === '\n' ? lf : lf.replace(/\n/g, '\r\n')
}
