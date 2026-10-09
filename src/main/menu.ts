import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { EXPORT_FORMATS, type ExportFormat } from '../core/export/formats'
import { IpcChannel, type MenuCommand } from '../shared/ipc'

export function buildApplicationMenu(window: BrowserWindow): Menu {
  const send = (command: MenuCommand) => () =>
    window.webContents.send(IpcChannel.MenuCommand, command)

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { id: 'open', label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { id: 'save', label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        {
          id: 'save-as',
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: send('save-as'),
        },
        { type: 'separator' },
        { id: 'export', label: 'Export…', accelerator: 'CmdOrCtrl+E', click: send('export') },
        {
          label: 'Export As',
          submenu: (Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => ({
            id: `export-${format}`,
            label: `${EXPORT_FORMATS[format].label}…`,
            click: send(`export-${format}`),
          })),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          id: 'view-split',
          label: 'Document and Source',
          accelerator: 'CmdOrCtrl+1',
          click: send('view-split'),
        },
        {
          id: 'view-wysiwyg',
          label: 'Document Only',
          accelerator: 'CmdOrCtrl+2',
          click: send('view-wysiwyg'),
        },
        {
          id: 'view-source',
          label: 'Source Only',
          accelerator: 'CmdOrCtrl+3',
          click: send('view-source'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}
