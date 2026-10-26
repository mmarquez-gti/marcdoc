import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'

/** Quiet time after the last event before reporting; a write often fires several events. */
export const FILE_WATCH_DEBOUNCE_MS = 150

/**
 * Watches one file at a time and reports when something touched it. The directory is watched,
 * not the file: many programs save by writing a temporary file and renaming it over the
 * original, which ends a watch on the file itself.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null

  /** @param onTouched Called with the watched path; it may have changed, appeared or vanished. */
  constructor(
    private readonly onTouched: (path: string) => void,
    private readonly debounceMs = FILE_WATCH_DEBOUNCE_MS,
  ) {}

  /** Watches `path` instead of the previous file. */
  watch(path: string): void {
    this.stop()
    const name = basename(path)
    const watcher = watch(dirname(path), { persistent: false }, (_event, fileName) => {
      // Some platforms do not report the name; check the file anyway.
      if (fileName === null || fileName === name) this.schedule(path)
    })
    // The directory itself was removed or became unreadable: report it once, then give up.
    watcher.on('error', () => {
      watcher.close()
      if (this.watcher === watcher) this.watcher = null
      this.schedule(path)
    })
    this.watcher = watcher
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(path: string): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.onTouched(path)
    }, this.debounceMs)
  }
}
