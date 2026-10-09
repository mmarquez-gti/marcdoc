import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { TOOLS, toolStatus } from '../../core'
import type { ToolStatus } from '../../shared/ipc'

const execFileAsync = promisify(execFile)
const VERSION_TIMEOUT_MS = 5000

/** Detects external tools by running their version command (no shell involved). */
export async function detectToolchain(): Promise<ToolStatus[]> {
  return Promise.all(
    TOOLS.map(async (tool) => {
      try {
        const { stdout } = await execFileAsync(tool.command, [...tool.versionArgs], {
          timeout: VERSION_TIMEOUT_MS,
        })
        return toolStatus(tool, stdout)
      } catch {
        // Not installed or not runnable: reported to the user as missing, not as an error.
        return toolStatus(tool, null)
      }
    }),
  )
}
