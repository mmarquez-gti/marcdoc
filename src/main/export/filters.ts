import { join } from 'node:path'

/** Lua filters every export runs (before --citeproc). */
export function exportLuaFilters(resourcesDir: string): string[] {
  return [join(resourcesDir, 'pandoc/filters/citations.lua')]
}
