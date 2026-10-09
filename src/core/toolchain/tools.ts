import type { ToolStatus } from '../../shared/ipc'
import { isSupportedVersion, parseVersion } from './version'

export interface ToolDefinition {
  readonly id: ToolStatus['id']
  readonly label: string
  readonly command: string
  readonly versionArgs: readonly string[]
  /** Text that precedes the version number in the command's output. */
  readonly versionMarker: string
  readonly minimumVersion: string | null
  readonly purpose: string
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'pandoc',
    label: 'Pandoc',
    command: 'pandoc',
    versionArgs: ['--version'],
    versionMarker: 'pandoc',
    // First version verified with the gfm reader extensions MarcDoc relies on (ADR-0002).
    minimumVersion: '3.1',
    purpose: 'Export to PDF, LaTeX and Word',
  },
  {
    id: 'lualatex',
    label: 'LuaLaTeX',
    command: 'lualatex',
    versionArgs: ['--version'],
    versionMarker: 'Version',
    minimumVersion: null,
    purpose: 'Export to PDF via LaTeX',
  },
]

/** Builds the status of a tool from the output of its version command (null if it failed). */
export function toolStatus(tool: ToolDefinition, versionOutput: string | null): ToolStatus {
  const version = versionOutput === null ? null : parseVersion(versionOutput, tool.versionMarker)
  return {
    id: tool.id,
    label: tool.label,
    found: versionOutput !== null,
    version,
    minimumVersion: tool.minimumVersion,
    supported: versionOutput !== null && isSupportedVersion(version, tool.minimumVersion),
    purpose: tool.purpose,
  }
}
