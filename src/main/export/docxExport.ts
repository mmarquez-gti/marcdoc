import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_REFERENCE_DOCX_ARGS,
  docxArgs,
  metadataArgs,
  type PandocInvocation,
} from '../../core'
import {
  adaptToTemplate,
  defaultMapping,
  hasCover,
  lintDocx,
  loadTemplate,
  mappingPathFor,
  Package,
  parseMapping,
  templateStyles,
  type StyleMapping,
} from '../../core/docx'
import { runPandoc } from './pandocRunner'

export const DEFAULT_TEMPLATE = 'templates/docx/marcdoc-default.docx'

export interface DocxExportInput {
  readonly markdown: string
  readonly invocation: PandocInvocation
  /** User template (.docx/.dotx), or null for MarcDoc's default template. */
  readonly templatePath: string | null
  readonly resourcesDir: string
  readonly workDir: string
}

/** Pandoc's built-in reference.docx never changes for a given Pandoc; read it once. */
let pandocDefaultsCache: Promise<Uint8Array> | null = null

function pandocDefaults(): Promise<Uint8Array> {
  pandocDefaultsCache ??= runPandoc(DEFAULT_REFERENCE_DOCX_ARGS, '').then((result) => result.stdout)
  // A failure must not be cached: the next export retries.
  pandocDefaultsCache.catch(() => (pandocDefaultsCache = null))
  return pandocDefaultsCache
}

export async function exportDocx(input: DocxExportInput): Promise<string[]> {
  const { markdown, invocation, workDir } = input
  const templatePath = input.templatePath ?? join(input.resourcesDir, DEFAULT_TEMPLATE)
  const template = await loadTemplate(await readFile(templatePath))
  const mapping = await loadMapping(templatePath, template)

  const referencePath = join(workDir, 'reference.docx')
  await writeFile(referencePath, await template.generate())
  const pandocPath = join(workDir, 'pandoc.docx')
  const filterPath = (await hasCover(template, mapping))
    ? join(input.resourcesDir, 'pandoc/filters/strip-title.lua')
    : null
  const { warnings } = await runPandoc(
    docxArgs({ ...invocation, outputPath: pandocPath }, referencePath, filterPath),
    markdown,
    { cwd: workDir },
  )

  const { bytes } = await adaptToTemplate({
    template,
    pandocOutput: await Package.load(await readFile(pandocPath)),
    pandocDefaults: await Package.load(await pandocDefaults()),
    mapping,
    metadata: await readMetadata(markdown, workDir),
  })
  await writeFile(invocation.outputPath, bytes)

  const lintIssues = await lintDocx(bytes)
  return [
    ...warnings,
    ...lintIssues.map((issue) => `[${issue.severity}] ${issue.part}: ${issue.message}`),
  ]
}

/** `<template>.marcdoc.json` next to the template, or a mapping derived from its built-in styles. */
async function loadMapping(templatePath: string, template: Package): Promise<StyleMapping> {
  const mappingPath = mappingPathFor(templatePath)
  if (!(await exists(mappingPath))) return defaultMapping(await templateStyles(template))
  let json: unknown
  try {
    json = JSON.parse(await readFile(mappingPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot read ${mappingPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  return parseMapping(json)
}

async function readMetadata(markdown: string, workDir: string): Promise<Record<string, unknown>> {
  const metaTemplatePath = join(workDir, 'meta.tpl')
  await writeFile(metaTemplatePath, '$meta-json$')
  const { stdout } = await runPandoc(metadataArgs(metaTemplatePath), markdown, { cwd: workDir })
  return JSON.parse(stdout.toString('utf8')) as Record<string, unknown>
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
