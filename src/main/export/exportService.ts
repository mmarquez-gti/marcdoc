import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  latexArgs,
  pdfViaLatexArgs,
  printableHtmlArgs,
  type ExportFormat,
  type PandocInvocation,
} from '../../core'
import type { ExportResult } from '../../shared/ipc'
import { printHtmlToPdf } from './htmlToPdf'
import { runPandoc } from './pandocRunner'

/** Generous limit: LaTeX may run several passes on long documents. */
const PDF_TIMEOUT_MS = 300_000

export interface ExportJob {
  readonly format: ExportFormat
  readonly markdown: string
  /** Path of the Markdown file, used to resolve relative images; null if never saved. */
  readonly documentPath: string | null
  readonly outputPath: string
}

export class ExportService {
  constructor(private readonly resourcesDir: string) {}

  async export(job: ExportJob): Promise<ExportResult> {
    const workDir = await mkdtemp(join(tmpdir(), 'marcdoc-export-'))
    try {
      const invocation: PandocInvocation = {
        resourcePath: job.documentPath ? dirname(job.documentPath) : workDir,
        outputPath: job.outputPath,
        fallbackTitle: job.documentPath ? basename(job.documentPath) : 'Untitled',
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
    switch (job.format) {
      case 'latex':
        return (await runPandoc(latexArgs(invocation), job.markdown, options)).warnings
      case 'pdf-latex':
        return (
          await runPandoc(pdfViaLatexArgs(invocation), job.markdown, {
            ...options,
            timeoutMs: PDF_TIMEOUT_MS,
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
        throw new Error('Word export is not available yet.')
    }
  }
}
