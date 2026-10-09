import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  latexArgs,
  pdfViaLatexArgs,
  printableHtmlArgs,
  texInputsFor,
  type ExportFormat,
  type PandocInvocation,
} from '../../core'
import type { ExportResult } from '../../shared/ipc'
import { exportDocx } from './docxExport'
import { printHtmlToPdf } from './htmlToPdf'
import { exportLuaFilters } from './filters'
import { runPandoc } from './pandocRunner'

/** Generous limit: LaTeX may run several passes on long documents. */
const PDF_TIMEOUT_MS = 300_000

export interface ExportJob {
  readonly format: ExportFormat
  readonly markdown: string
  /** Path of the Markdown file, used to resolve relative images; null if never saved. */
  readonly documentPath: string | null
  readonly outputPath: string
  /** Word template for .docx export; null uses MarcDoc's default template. */
  readonly templatePath?: string | null
  /** Pandoc LaTeX template for LaTeX outputs; null uses Pandoc's default. */
  readonly latexTemplatePath?: string | null
}

export class ExportService {
  constructor(private readonly resourcesDir: string) {}

  async export(job: ExportJob): Promise<ExportResult> {
    const workDir = await mkdtemp(join(tmpdir(), 'marcdoc-export-'))
    try {
      const invocation: PandocInvocation = {
        // Pandoc runs in workDir, so a relative path would resolve against the wrong directory.
        resourcePath: job.documentPath ? resolve(dirname(job.documentPath)) : workDir,
        outputPath: job.outputPath,
        fallbackTitle: job.documentPath ? basename(job.documentPath) : 'Untitled',
        luaFilters: exportLuaFilters(this.resourcesDir),
      }
      const warnings = await this.run(job, invocation, workDir)
      return { outputPath: job.outputPath, warnings }
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }

  private async run(
    job: ExportJob,
    invocation: PandocInvocation,
    workDir: string,
  ): Promise<string[]> {
    // Pandoc writes LaTeX auxiliary files to its working directory; keep them out of the user's.
    const options = { cwd: workDir }
    const latexTemplate = job.latexTemplatePath ?? null
    // Classes and packages shipped next to a LaTeX template must be found by LuaLaTeX.
    const latexEnv = latexTemplate
      ? { TEXINPUTS: texInputsFor(dirname(resolve(latexTemplate)), process.env['TEXINPUTS']) }
      : undefined
    switch (job.format) {
      case 'latex':
        return (await runPandoc(latexArgs(invocation, latexTemplate), job.markdown, options))
          .warnings
      case 'pdf-latex':
        return (
          await runPandoc(pdfViaLatexArgs(invocation, latexTemplate), job.markdown, {
            ...options,
            timeoutMs: PDF_TIMEOUT_MS,
            ...(latexEnv ? { env: latexEnv } : {}),
          })
        ).warnings
      case 'pdf-html': {
        const htmlPath = join(workDir, 'document.html')
        const cssPath = join(this.resourcesDir, 'html/print.css')
        const { warnings } = await runPandoc(
          printableHtmlArgs({ ...invocation, outputPath: htmlPath }, cssPath),
          job.markdown,
          options,
        )
        await printHtmlToPdf(htmlPath, job.outputPath)
        return warnings
      }
      case 'docx':
        return exportDocx({
          markdown: job.markdown,
          invocation,
          templatePath: job.templatePath ?? null,
          resourcesDir: this.resourcesDir,
          workDir,
        })
    }
  }
}
