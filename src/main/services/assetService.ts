import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import {
  ASSETS_DIR,
  imageMimeType,
  relativePathFromAssetUrl,
  sanitizeAssetName,
  uniqueName,
} from '../../core'
import { UserError } from '../userError'

const MAX_ASSET_BYTES = 50 * 1024 * 1024
const NOT_FOUND = 404
const FORBIDDEN = 403

/**
 * Serves and stores images that belong to the current document. Only image files inside the
 * document's directory are readable, so a compromised renderer cannot read other files.
 */
export class AssetService {
  constructor(private readonly currentDocumentPath: () => string | null) {}

  async serve(url: string): Promise<Response> {
    const documentPath = this.currentDocumentPath()
    const relativePath = relativePathFromAssetUrl(url)
    if (!documentPath || !relativePath) return new Response(null, { status: NOT_FOUND })

    const mimeType = imageMimeType(relativePath)
    if (!mimeType) return new Response(null, { status: FORBIDDEN })

    try {
      const directory = await realpath(dirname(documentPath))
      // Resolve symlinks too: a link inside the folder must not lead outside it.
      const file = await realpath(join(directory, relativePath))
      if (!file.startsWith(directory + sep)) return new Response(null, { status: FORBIDDEN })
      return new Response(await readFile(file), { headers: { 'Content-Type': mimeType } })
    } catch {
      return new Response(null, { status: NOT_FOUND })
    }
  }

  /** Copies an image into `<document dir>/assets/` and returns its path relative to the document. */
  async import(fileName: string, bytes: Uint8Array): Promise<string> {
    const documentPath = this.currentDocumentPath()
    if (!documentPath) throw new UserError('error.saveBeforeImages')
    if (!imageMimeType(fileName)) throw new Error(`"${fileName}" is not a supported image type.`)
    if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`"${fileName}" is larger than 50 MB.`)

    const directory = join(dirname(documentPath), ASSETS_DIR)
    await mkdir(directory, { recursive: true })
    const name = uniqueName(sanitizeAssetName(fileName), new Set(await readdir(directory)))
    await writeFile(join(directory, name), bytes, { flag: 'wx' })
    return `${ASSETS_DIR}/${name}`
  }
}
