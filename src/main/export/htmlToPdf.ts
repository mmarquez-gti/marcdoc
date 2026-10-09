import { writeFile } from 'node:fs/promises'
import { BrowserWindow } from 'electron'

/**
 * Prints a self-contained HTML file to PDF with Chromium. The window is hidden, sandboxed and
 * has JavaScript disabled: the HTML comes from the user's document and is only rendered.
 */
export async function printHtmlToPdf(htmlPath: string, outputPath: string): Promise<void> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      javascript: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  try {
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await window.loadFile(htmlPath)
    // Page size and margins come from the @page rule in the print stylesheet.
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    })
    await writeFile(outputPath, pdf)
  } finally {
    window.destroy()
  }
}
