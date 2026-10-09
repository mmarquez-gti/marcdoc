import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
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
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ]
  return Menu.buildFromTemplate(template)
}
