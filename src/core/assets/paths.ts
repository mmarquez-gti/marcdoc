// Path rules for images referenced from a document. Pure: works on POSIX path strings.

export const ASSET_PROTOCOL = 'marcdoc-asset'
export const ASSETS_DIR = 'assets'

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export function imageMimeType(fileName: string): string | null {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return IMAGE_TYPES[extension] ?? null
}

/** True for `src` values that point at local files rather than URLs. */
export function isRelativeImageSource(src: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('/') && !src.startsWith('//')
}

/** URL the renderer uses to display a relative image of the current document. */
export function assetUrl(relativePath: string): string {
  return `${ASSET_PROTOCOL}://document/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Resolves the relative path inside an asset URL. Returns null for anything that escapes the
 * document directory (`..`) or is not a plain relative path.
 */
export function relativePathFromAssetUrl(url: string): string | null {
  const prefix = `${ASSET_PROTOCOL}://document/`
  if (!url.startsWith(prefix)) return null
  const segments = url
    .slice(prefix.length)
    .split(/[?#]/)[0]!
    .split('/')
    .map((segment) => decodeURIComponent(segment))
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  if (segments.some((segment) => segment.includes('/') || segment.includes('\\'))) return null
  return segments.join('/')
}

const MAX_BASE_NAME_LENGTH = 60

/** Turns a pasted file name into a safe asset file name, e.g. "My Photo (1).PNG" -> "my-photo-1.png". */
export function sanitizeAssetName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_NAME_LENGTH)
  return `${base || 'image'}${extension ? `.${extension}` : ''}`
}

/** Returns `name`, or `name-2`, `name-3`… so it does not collide with `existing`. */
export function uniqueName(name: string, existing: ReadonlySet<string>): string {
  if (!existing.has(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let index = 2; ; index++) {
    const candidate = `${base}-${index}${extension}`
    if (!existing.has(candidate)) return candidate
  }
}
