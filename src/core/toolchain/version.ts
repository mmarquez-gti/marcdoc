/** Extracts the first dotted version number (e.g. `3.1.3`) that follows `marker` in `output`. */
export function parseVersion(output: string, marker: string): string | null {
  const markerIndex = output.indexOf(marker)
  if (markerIndex === -1) return null
  const match = /\d+(?:\.\d+)+/.exec(output.slice(markerIndex + marker.length))
  return match ? match[0] : null
}

/** Compares dotted numeric versions; missing components count as 0. */
export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

export function isSupportedVersion(version: string | null, minimum: string | null): boolean {
  if (version === null) return false
  return minimum === null || compareVersions(version, minimum) >= 0
}
