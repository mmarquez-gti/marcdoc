import { join } from 'node:path'
import { app } from 'electron'

/** Directory with bundled resources (print CSS, Pandoc filters, templates). */
export function resourcesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources')
}
