import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Bumped if the record format changes; records with another version are ignored. */
const RECORD_VERSION = 1

interface ReviewRecord {
  readonly version: typeof RECORD_VERSION
  readonly path: string
  readonly baseline: string
  readonly savedAt: string
}

/**
 * Remembers, for each document, the version the user last reviewed, so changes other programs
 * make while MarcDoc is closed can be reviewed the next time it opens. Records live in the
 * app's own folder, one file per document, never next to the user's files (ADR-0008).
 */
export class ReviewStore {
  constructor(private readonly dir: string) {}

  /** The reviewed version of `path`, or null if none was recorded or the record is unusable. */
  async load(path: string): Promise<string | null> {
    let text: string
    try {
      text = await readFile(this.recordPath(path), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    try {
      const record = JSON.parse(text) as Partial<ReviewRecord> | null
      const valid =
        record?.version === RECORD_VERSION &&
        record.path === path &&
        typeof record.baseline === 'string'
      return valid ? record.baseline! : null
    } catch {
      // A damaged record only means the next review compares with the file as it is now.
      return null
    }
  }

  async save(path: string, baseline: string): Promise<void> {
    const record: ReviewRecord = {
      version: RECORD_VERSION,
      path,
      baseline,
      savedAt: new Date().toISOString(),
    }
    await mkdir(this.dir, { recursive: true })
    // Written aside and renamed, so a crash never leaves a half-written record.
    const target = this.recordPath(path)
    const temporary = `${target}.tmp`
    await writeFile(temporary, JSON.stringify(record), 'utf8')
    await rename(temporary, target)
  }

  private recordPath(path: string): string {
    return join(this.dir, `${createHash('sha256').update(path).digest('hex')}.json`)
  }
}
