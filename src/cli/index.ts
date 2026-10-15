// Entry point of the light command line: MarcDoc's exports on plain Node.js, without Electron
// (ADR-0007). Built into a single file by vite.cli.config.ts, next to a copy of `resources/`.
import { join } from 'node:path'
import { CliUsageError, LITE_CLI_USAGE, parseLiteCommandLine, type LiteCliCommand } from '../core'
import { EXIT_FAILURE, runExport, runListTemplates, showUsage, type CliOutput } from '../main/cli'
import { ExportService, type HtmlToPdf } from '../main/export/exportService'
import { TemplateService } from '../main/services/templateService'
import { CHROME_MISSING_MESSAGE, chromeHtmlToPdf, findChrome } from './chromePdf'

/** Bundled next to the built script. */
const RESOURCES_DIR = join(__dirname, 'resources')

const stdio: CliOutput = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
}

/** Chrome is looked for only when a PDF through HTML is exported. */
const printWithChrome: HtmlToPdf = async (htmlPath, outputPath) => {
  const chrome = await findChrome(process.env)
  if (!chrome) throw new Error(CHROME_MISSING_MESSAGE)
  await chromeHtmlToPdf(chrome)(htmlPath, outputPath)
}

function run(command: LiteCliCommand): Promise<number> {
  switch (command.kind) {
    case 'export':
      return runExport(
        command,
        process.cwd(),
        new ExportService(RESOURCES_DIR, printWithChrome),
        stdio,
      )
    case 'templates':
      return runListTemplates(
        new TemplateService(join(RESOURCES_DIR, 'templates/docx')),
        command.json,
        stdio,
      )
    case 'help':
      return Promise.resolve(showUsage(stdio, null, LITE_CLI_USAGE))
  }
}

async function main(args: readonly string[]): Promise<number> {
  try {
    return await run(parseLiteCommandLine(args))
  } catch (error) {
    if (error instanceof CliUsageError) return showUsage(stdio, error.message, LITE_CLI_USAGE)
    stdio.err(`marcdoc: ${error instanceof Error ? error.message : String(error)}`)
    return EXIT_FAILURE
  }
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
