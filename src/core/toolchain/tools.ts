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
  /** TeX files (found with kpsewhich) that must exist for the tool to work, e.g. `soul.sty`. */
  readonly requiredTeXFiles?: readonly string[]
  /** What to install when required files are missing. */
  readonly installHint?: string
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
    // Packages Pandoc's LaTeX template needs with LuaLaTeX. luaotfload ships separately from
    // the lualatex binary on Debian/Ubuntu, so a present binary is not enough.
    requiredTeXFiles: [
      'luaotfload.sty',
      'fontspec.sty',
      'unicode-math.sty',
      'soul.sty',
      'framed.sty',
    ],
    installHint: 'sudo apt install texlive-luatex texlive-latex-extra',
  },
]

/**
 * Builds the status of a tool from the output of its version command (null if it failed) and
 * the paths kpsewhich printed for its required TeX files.
 */
export function toolStatus(
  tool: ToolDefinition,
  versionOutput: string | null,
  foundTeXPaths: readonly string[] = [],
): ToolStatus {
  const version = versionOutput === null ? null : parseVersion(versionOutput, tool.versionMarker)
  const foundNames = new Set(foundTeXPaths.map((path) => path.slice(path.lastIndexOf('/') + 1)))
  const missingFiles = (tool.requiredTeXFiles ?? []).filter((file) => !foundNames.has(file))
  return {
    id: tool.id,
    label: tool.label,
    found: versionOutput !== null,
    version,
    minimumVersion: tool.minimumVersion,
    missingFiles,
    installHint: tool.installHint ?? null,
    supported:
      versionOutput !== null &&
      isSupportedVersion(version, tool.minimumVersion) &&
      missingFiles.length === 0,
    purpose: tool.purpose,
  }
}
